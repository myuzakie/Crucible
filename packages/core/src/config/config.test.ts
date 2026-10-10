import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import {
  CrucibleConfigSchema,
  DoctorReportSchema,
  formatDoctorReport,
  formatInitResult,
  initCrucible,
  runDoctor
} from './index.js';

test('init writes config only and reports MISSING_SCENARIO without Token template', () => {
  const root = mkdtempSync(join(tmpdir(), 'crucible-init-'));
  try {
    writeFileSync(join(root, 'foundry.toml'), '[profile.default]\nout = "out"\n');
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src', 'YourContract.sol'), 'contract YourContract {}\n');

    const first = initCrucible(root);
    assert.equal(first.status, 'MISSING_SCENARIO');
    assert.ok(first.created.includes('crucible.config.json'));
    assert.ok(!first.created.some((path) => path.includes('scenarios/')));
    assert.equal(first.config.scenario, undefined);
    assert.deepEqual(first.detectedContracts, ['YourContract']);
    assert.equal(CrucibleConfigSchema.safeParse(first.config).success, true);
    assert.doesNotMatch(readFileSync(join(root, 'crucible.config.json'), 'utf8'), /Token|PRIVATE_KEY|0x[a-fA-F0-9]{64}/);
    assert.equal(existsSync(join(root, 'scenarios', 'crucible-smoke.json')), false);
    assert.match(formatInitResult(first), /MISSING_SCENARIO/);
    assert.match(formatInitResult(first), /YourContract/);

    const second = initCrucible(root);
    assert.deepEqual(second.created, []);
    assert.ok(second.skipped.includes('crucible.config.json'));
    assert.equal(second.status, 'MISSING_SCENARIO');
    assert.match(formatInitResult(second), /idempotent/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('init does not overwrite an existing scenario', () => {
  const root = mkdtempSync(join(tmpdir(), 'crucible-init-keep-'));
  try {
    writeFileSync(join(root, 'foundry.toml'), '[profile.default]\nout = "out"\n');
    mkdirSync(join(root, 'scenarios'));
    writeFileSync(join(root, 'scenarios', 'keep.json'), '{"name":"keep"}\n');
    const result = initCrucible(root);
    assert.equal(result.status, 'READY');
    assert.equal(result.config.scenario, 'scenarios/keep.json');
    assert.equal(readFileSync(join(root, 'scenarios', 'keep.json'), 'utf8'), '{"name":"keep"}\n');
    assert.ok(!result.created.some((path) => path.includes('scenarios/')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('init lists ERC-20 artifact contracts without writing a runnable scenario', () => {
  const root = mkdtempSync(join(tmpdir(), 'crucible-init-erc20-'));
  try {
    writeFileSync(join(root, 'foundry.toml'), '[profile.default]\nout = "out"\n');
    mkdirSync(join(root, 'out', 'Token.sol'), { recursive: true });
    writeFileSync(join(root, 'out', 'Token.sol', 'Token.json'), '{"abi":[],"bytecode":{"object":"0x"}}\n');
    const result = initCrucible(root);
    assert.equal(result.status, 'MISSING_SCENARIO');
    assert.ok(result.detectedContracts.includes('Token'));
    assert.equal(result.config.scenario, undefined);
    assert.equal(existsSync(join(root, 'scenarios')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('init lists ERC-721 artifact contracts without inventing ownerOf assertions', () => {
  const root = mkdtempSync(join(tmpdir(), 'crucible-init-erc721-'));
  try {
    writeFileSync(join(root, 'foundry.toml'), '[profile.default]\nout = "out"\n');
    mkdirSync(join(root, 'out', 'Collectible.sol'), { recursive: true });
    writeFileSync(
      join(root, 'out', 'Collectible.sol', 'Collectible.json'),
      '{"abi":[],"bytecode":{"object":"0x"}}\n'
    );
    const result = initCrucible(root);
    assert.equal(result.status, 'MISSING_SCENARIO');
    assert.deepEqual(result.detectedContracts, ['Collectible']);
    assert.equal(existsSync(join(root, 'scenarios')), false);
    assert.doesNotMatch(JSON.stringify(result.config), /ownerOf|"mint"/);
    assert.ok(result.nextSteps.some((step) => /mint-nft\.json/i.test(step)));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('init reports no contracts when artifacts and sources are missing', () => {
  const root = mkdtempSync(join(tmpdir(), 'crucible-init-empty-'));
  try {
    writeFileSync(join(root, 'foundry.toml'), '[profile.default]\nout = "out"\n');
    const result = initCrucible(root);
    assert.equal(result.status, 'MISSING_SCENARIO');
    assert.deepEqual(result.detectedContracts, []);
    assert.match(formatInitResult(result), /No contract/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('doctor reports missing local chain without secrets or raw errors', async () => {
  const root = join(process.cwd(), 'fixtures/capabilities/scaffold-like');
  const report = await runDoctor({
    root,
    env: {},
    probeRpc: async () => ({ reachable: false })
  });
  assert.equal(DoctorReportSchema.safeParse(report).success, true);
  assert.equal(report.status, 'MISSING_LOCAL_CHAIN');
  assert.equal(report.walletMode, 'fixture');
  assert.equal(report.localRpc.reachable, false);
  assert.doesNotMatch(formatDoctorReport(report), /ENOENT|PRIVATE_KEY|0x[a-fA-F0-9]{64}/i);
});

test('doctor reports missing Foundry tools with actionable guidance', async () => {
  const report = await runDoctor({
    root: resolve('examples/monad-erc721-demo'),
    env: {
      PATH: '',
      FORGE_BIN: '/missing/forge',
      ANVIL_BIN: '/missing/anvil'
    },
    probeRpc: async () => ({ reachable: false })
  });
  assert.equal(report.status, 'MISSING_TOOL');
  assert.equal(report.tools.forge.available, false);
  assert.equal(report.tools.anvil.available, false);
  assert.match(report.nextSteps.join('\n'), /Foundry forge was not found/);
  assert.doesNotMatch(report.nextSteps.join('\n'), /ENOENT|PRIVATE_KEY|0x[a-fA-F0-9]{64}/i);
});

test('doctor stays SUPPORTED_WITH_CONFIG when RPC is up and config is missing', async () => {
  const root = join(process.cwd(), 'fixtures/capabilities/scaffold-like');
  const report = await runDoctor({
    root,
    env: {},
    probeRpc: async () => ({ reachable: true, chainId: 31337 })
  });
  assert.equal(report.status, 'SUPPORTED_WITH_CONFIG');
  assert.equal(report.localRpc.chainId, 31337);
  assert.ok(report.nextSteps.some((step) => /crucible init/i.test(step)));
});
