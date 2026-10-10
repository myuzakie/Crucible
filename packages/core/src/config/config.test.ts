import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
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

test('init writes config and scenario once, then stays idempotent', () => {
  const root = mkdtempSync(join(tmpdir(), 'crucible-init-'));
  try {
    writeFileSync(join(root, 'foundry.toml'), '[profile.default]\nout = "out"\n');
    const first = initCrucible(root);
    assert.ok(first.created.includes('crucible.config.json'));
    assert.ok(first.created.includes('scenarios/crucible-smoke.json'));
    assert.equal(CrucibleConfigSchema.safeParse(first.config).success, true);
    assert.match(readFileSync(join(root, 'crucible.config.json'), 'utf8'), /"toolchain": "foundry"/);
    assert.doesNotMatch(readFileSync(join(root, 'crucible.config.json'), 'utf8'), /PRIVATE_KEY|0x[a-fA-F0-9]{64}/);

    const second = initCrucible(root);
    assert.deepEqual(second.created, []);
    assert.ok(second.skipped.includes('crucible.config.json'));
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
    assert.equal(result.config.scenario, 'scenarios/keep.json');
    assert.equal(readFileSync(join(root, 'scenarios', 'keep.json'), 'utf8'), '{"name":"keep"}\n');
    assert.ok(!result.created.some((path) => path.includes('scenarios/')));
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
