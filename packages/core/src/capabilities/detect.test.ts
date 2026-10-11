import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';

import { CapabilityReportSchema, detectCapabilities, formatCapabilityReport } from './index.js';

const fixtures = resolve(process.cwd(), 'fixtures/capabilities');

test('detects scaffold-like Foundry monorepo as SUPPORTED_WITH_CONFIG', () => {
  const report = detectCapabilities(resolve(fixtures, 'scaffold-like'));
  assert.equal(CapabilityReportSchema.safeParse(report).success, true);
  assert.equal(report.status, 'SUPPORTED_WITH_CONFIG');
  assert.equal(report.toolchain.foundry.detected, true);
  assert.deepEqual(report.toolchain.foundry.configPaths, ['packages/foundry/foundry.toml']);
  assert.equal(report.toolchain.scaffoldEth.detected, true);
  assert.equal(report.packageManager.name, 'yarn');
  assert.equal(report.packageManager.monorepo, true);
  assert.equal(report.artifacts.present, false);
  assert.equal(report.scenarios.present, false);
  assert.match(formatCapabilityReport(report), /^STATUS: SUPPORTED_WITH_CONFIG/m);
  assert.doesNotMatch(formatCapabilityReport(report), /ENOENT|EACCES|stack/i);
});

test('reports Hardhat-only repos as UNSUPPORTED_TOOLCHAIN', () => {
  const report = detectCapabilities(resolve(fixtures, 'hardhat-only'));
  assert.equal(report.status, 'UNSUPPORTED_TOOLCHAIN');
  assert.equal(report.toolchain.hardhat.detected, true);
  assert.equal(report.toolchain.hardhat.supported, false);
  assert.equal(report.toolchain.foundry.detected, false);
  assert.match(report.summary, /Hardhat/i);
});

test('reports empty repos as UNSUPPORTED_TOOLCHAIN without raw fs errors', () => {
  const report = detectCapabilities(resolve(fixtures, 'empty'));
  assert.equal(report.status, 'UNSUPPORTED_TOOLCHAIN');
  assert.equal(report.toolchain.foundry.detected, false);
  assert.doesNotMatch(report.summary, /ENOENT|no such file/i);
});

test('detects foundry with artifacts and scenarios as SUPPORTED_WITH_CONFIG when config missing', () => {
  const report = detectCapabilities(resolve(fixtures, 'foundry-ready'));
  assert.equal(report.status, 'SUPPORTED_WITH_CONFIG');
  assert.equal(report.toolchain.foundry.detected, true);
  assert.equal(report.artifacts.present, true);
  assert.equal(report.scenarios.present, true);
  assert.equal(report.config.present, false);
  assert.ok(report.artifacts.candidates.includes('out/Token.sol/Token.json'));
});

test('detects fully configured Foundry repo as SUPPORTED', () => {
  const report = detectCapabilities(resolve(fixtures, 'foundry-ready-configured'));
  assert.equal(report.status, 'SUPPORTED');
  assert.equal(report.config.present, true);
  assert.deepEqual(report.config.candidates, ['crucible.config.json']);
});

test('detects Foundry with scenarios but no artifacts as MISSING_ARTIFACT', () => {
  const report = detectCapabilities(resolve(fixtures, 'foundry-missing-artifact'));
  assert.equal(report.status, 'MISSING_ARTIFACT');
  assert.equal(report.scenarios.present, true);
  assert.equal(report.artifacts.present, false);
});

test('detects local example Foundry package', () => {
  const report = detectCapabilities(resolve(process.cwd(), 'examples/monad-erc20-demo'));
  assert.equal(report.toolchain.foundry.detected, true);
  assert.ok(report.scenarios.candidates.some((path) => path.includes('scenarios/')));
  assert.ok(['SUPPORTED', 'SUPPORTED_WITH_CONFIG', 'MISSING_ARTIFACT'].includes(report.status));
});
