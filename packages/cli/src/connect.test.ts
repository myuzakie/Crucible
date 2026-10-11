import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { generateSigningKeyPair } from '@crucible/certificate';
import { CertificateRegistryAbi } from '@crucible/certificate';
import { startFreshAnvil } from '@crucible/core';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { startLocalRunner } from './connect.js';

async function fixture(name: string): Promise<unknown> {
  const root = process.cwd().endsWith('/packages/cli') ? join(process.cwd(), '..', '..') : process.cwd();
  return JSON.parse(await readFile(join(root, 'apps/web/public/results', name), 'utf8')) as unknown;
}

async function scenario(): Promise<unknown> {
  const root = process.cwd().endsWith('/packages/cli') ? join(process.cwd(), '..', '..') : process.cwd();
  return JSON.parse(await readFile(join(root, 'examples/monad-erc20-demo/scenarios/buggy-mint.json'), 'utf8')) as unknown;
}

test('local runner generates and persists a Runtime Passport without exposing its signing key', async () => {
  const root = await mkdtemp(join(tmpdir(), 'crucible-m21d-'));
  const previous = process.env.PASSPORT_PRIVATE_KEY_PEM;
  process.env.PASSPORT_PRIVATE_KEY_PEM = generateSigningKeyPair().privateKeyPem;
  const runner = await startLocalRunner({ root, port: 0 });
  try {
    const beforeRun = await fixture('monad-runtime-vulnerable.json');
    const afterRun = await fixture('monad-runtime-fixed.json');
    const scenarioValue = await scenario();
    const response = await fetch(`${runner.url}/passport`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ beforeRun, afterRun, scenario: scenarioValue }) });
    assert.equal(response.status, 200);
    const payload = await response.json() as { passport: { passportHash: string; signature: { publicKey: string } } };
    assert.match(payload.passport.passportHash, /^[a-f0-9]{64}$/);
    assert.doesNotMatch(JSON.stringify(payload), /BEGIN PRIVATE KEY/);
    const state = await fetch(`${runner.url}/state`);
    assert.equal(state.status, 200);
    const persisted = await state.json() as { passport?: { passportHash: string } };
    assert.equal(persisted.passport?.passportHash, payload.passport.passportHash);
    const rejected = await fetch(`${runner.url}/passport`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ beforeRun: afterRun, afterRun, scenario: scenarioValue }) });
    assert.equal(rejected.status, 400);
  } finally {
    await runner.close();
    if (previous === undefined) delete process.env.PASSPORT_PRIVATE_KEY_PEM;
    else process.env.PASSPORT_PRIVATE_KEY_PEM = previous;
    await rm(root, { recursive: true, force: true });
  }
});

test('local runner publishes a verified Passport to a local registry', async () => {
  const root = await mkdtemp(join(tmpdir(), 'crucible-m21d-publish-'));
  const passportKey = generateSigningKeyPair().privateKeyPem;
  const deployerKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as `0x${string}`;
  const previousPassportKey = process.env.PASSPORT_PRIVATE_KEY_PEM;
  const previousDeployerKey = process.env.DEPLOYER_PRIVATE_KEY;
  process.env.PASSPORT_PRIVATE_KEY_PEM = passportKey;
  process.env.DEPLOYER_PRIVATE_KEY = deployerKey;
  const anvil = await startFreshAnvil();
  const runner = await startLocalRunner({ root, port: 0 });
  try {
    const artifact = JSON.parse(await readFile(join(process.cwd().endsWith('/packages/cli') ? join(process.cwd(), '..', '..') : process.cwd(), 'examples/monad-certificate-registry/out/CertificateRegistry.sol/CertificateRegistry.json'), 'utf8')) as { abi: readonly unknown[]; bytecode: { object: `0x${string}` } };
    const account = privateKeyToAccount(deployerKey);
    const publicClient = createPublicClient({ transport: http(anvil.rpcUrl) });
    const walletClient = createWalletClient({ account, transport: http(anvil.rpcUrl) });
    const deployment = await walletClient.deployContract({ chain: null, abi: artifact.abi, bytecode: artifact.bytecode.object });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: deployment });
    assert.ok(receipt.contractAddress);
    const beforeRun = await fixture('monad-runtime-vulnerable.json');
    const afterRun = await fixture('monad-runtime-fixed.json');
    const scenarioValue = await scenario();
    const passportResponse = await fetch(`${runner.url}/passport`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ beforeRun, afterRun, scenario: scenarioValue }) });
    const passportPayload = await passportResponse.json() as { passport: unknown };
    const publishResponse = await fetch(`${runner.url}/passport/publish`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ passport: passportPayload.passport, registry: receipt.contractAddress, rpc: anvil.rpcUrl }) });
    assert.equal(publishResponse.status, 200);
    const published = await publishResponse.json() as { passport: { passportHash: string; onChain?: { transactionHash: `0x${string}` } } };
    assert.ok(published.passport.onChain?.transactionHash);
    const record = await publicClient.readContract({ address: receipt.contractAddress, abi: CertificateRegistryAbi, functionName: 'get', args: [`0x${published.passport.passportHash}`] });
    assert.equal(record.exists, true);
  } finally {
    await runner.close(); await anvil.stop(); await rm(root, { recursive: true, force: true });
    if (previousPassportKey === undefined) delete process.env.PASSPORT_PRIVATE_KEY_PEM; else process.env.PASSPORT_PRIVATE_KEY_PEM = previousPassportKey;
    if (previousDeployerKey === undefined) delete process.env.DEPLOYER_PRIVATE_KEY; else process.env.DEPLOYER_PRIVATE_KEY = previousDeployerKey;
  }
});

test('local runner enforces origin allowlist and validates structured requests', async () => {
  const root = await mkdtemp(join(tmpdir(), 'crucible-m22-security-'));
  const runner = await startLocalRunner({ root, port: 0, allowedOrigins: ['https://app.example.test'] });
  try {
    const allowed = await fetch(`${runner.url}/health`, { headers: { origin: 'https://app.example.test' } });
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://app.example.test');

    const unknown = await fetch(`${runner.url}/health`, { headers: { origin: 'https://evil.example.test' } });
    assert.equal(unknown.status, 403);
    assert.equal(unknown.headers.get('access-control-allow-origin'), null);

    const malformed = await fetch(`${runner.url}/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://app.example.test' },
      body: JSON.stringify({ scenario: { name: 'not-a-scenario' } })
    });
    assert.equal(malformed.status, 400);
    assert.match(await malformed.text(), /Invalid input|nodes|network/);
  } finally {
    await runner.close();
    await rm(root, { recursive: true, force: true });
  }
});
