import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { runScenario } from './index.js';
import { ScenarioSchema, RunResultSchema } from '../schema/index.js';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '../../../../');
const deployerKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const;
const aliceKey = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as const;

function readJson(path: string): any {
  return JSON.parse(readFileSync(join(root, path), 'utf8'));
}

function artifact(name: string) {
  const value = readJson(`examples/monad-erc20-demo/out/${name}.sol/${name}.json`);
  return { abi: value.abi, bytecode: value.bytecode.object };
}

function erc721Artifact(name: string) {
  const value = readJson(`examples/monad-erc721-demo/out/${name}.sol/${name}.json`);
  return { abi: value.abi, bytecode: value.bytecode.object };
}

async function waitForRpc(url: string) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] })
      });
      if (response.ok) return;
    } catch {
      // Anvil is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Anvil did not become ready.');
}

async function runFresh(name: 'happy-path' | 'buggy-mint', port: number) {
  const anvilProcess = spawn(process.env.ANVIL_BIN ?? 'anvil', ['--silent', '--port', String(port), '--accounts', '2']);
  try {
    const rpcUrl = `http://127.0.0.1:${port}`;
    await waitForRpc(rpcUrl);
    const scenario = ScenarioSchema.parse(readJson(`examples/monad-erc20-demo/scenarios/${name}.json`));
    return await runScenario({
      scenario,
      rpcUrl,
      accounts: { deployer: deployerKey, alice: aliceKey },
      artifacts: { Token: artifact('Token'), BuggyToken: artifact('BuggyToken') }
    });
  } finally {
    anvilProcess.kill('SIGTERM');
    await new Promise<void>((resolve) => anvilProcess.once('exit', () => resolve()));
  }
}

async function runErc721Fresh(name: 'happy-path' | 'missing-owner', port: number) {
  const anvilProcess = spawn(process.env.ANVIL_BIN ?? 'anvil', ['--silent', '--port', String(port), '--accounts', '2']);
  try {
    const rpcUrl = `http://127.0.0.1:${port}`;
    await waitForRpc(rpcUrl);
    const scenario = ScenarioSchema.parse(readJson(`examples/monad-erc721-demo/scenarios/${name}.json`));
    return await runScenario({
      scenario,
      rpcUrl,
      accounts: { deployer: deployerKey, alice: aliceKey },
      artifacts: { Collectible: erc721Artifact('Collectible') }
    });
  } finally {
    anvilProcess.kill('SIGTERM');
    await new Promise<void>((resolve) => anvilProcess.once('exit', () => resolve()));
  }
}

test('runs happy and buggy scenarios twice on fresh Anvil chains', async () => {
  const happyFirst = await runFresh('happy-path', 18545);
  const buggyFirst = await runFresh('buggy-mint', 18546);
  const happySecond = await runFresh('happy-path', 18547);
  const buggySecond = await runFresh('buggy-mint', 18548);

  for (const result of [happyFirst, buggyFirst, happySecond, buggySecond]) RunResultSchema.parse(result);
  assert.equal(happyFirst.status, 'passed');
  assert.equal(happySecond.status, happyFirst.status);
  assert.equal(buggyFirst.status, 'failed');
  assert.equal(buggySecond.status, buggyFirst.status);
  assert.equal(buggyFirst.nodes.find((node) => node.id === 'balance')?.error?.actual, '0');
});

test('runs generic ERC-721 mint and ownerOf flow twice on fresh Anvil chains', async () => {
  const happyFirst = await runErc721Fresh('happy-path', 18549);
  const failedFirst = await runErc721Fresh('missing-owner', 18550);
  const happySecond = await runErc721Fresh('happy-path', 18551);
  const failedSecond = await runErc721Fresh('missing-owner', 18552);

  for (const result of [happyFirst, failedFirst, happySecond, failedSecond]) RunResultSchema.parse(result);
  assert.equal(happyFirst.status, 'passed');
  assert.equal(happySecond.status, happyFirst.status);
  assert.equal(failedFirst.status, 'failed');
  assert.equal(failedSecond.status, failedFirst.status);
});
