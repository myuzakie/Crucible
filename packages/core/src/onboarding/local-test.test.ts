import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';

import {
  formatOnboardingLocalResult,
  onboardingExitCode,
  runOnboardingLocalTest
} from './index.js';

test('onboarding stops on unsupported Hardhat without deploy', async () => {
  const root = mkdtempSync(join(tmpdir(), 'crucible-onboard-hh-'));
  try {
    writeFileSync(join(root, 'hardhat.config.js'), 'module.exports = {};\n');
    writeFileSync(join(root, 'package.json'), '{"name":"hh"}\n');
    const result = await runOnboardingLocalTest({ root, autoInit: false });
    assert.equal(result.status, 'UNSUPPORTED_TOOLCHAIN');
    assert.equal(onboardingExitCode(result.status), 1);
    assert.match(formatOnboardingLocalResult(result), /Hardhat|unsupported/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('onboarding reports MISSING_TOOL when forge is absent', async () => {
  const root = mkdtempSync(join(tmpdir(), 'crucible-onboard-tool-'));
  const previousPath = process.env.PATH;
  const previousForge = process.env.FORGE_BIN;
  const previousAnvil = process.env.ANVIL_BIN;
  try {
    writeFileSync(join(root, 'foundry.toml'), '[profile.default]\nout = "out"\n');
    process.env.PATH = '';
    process.env.FORGE_BIN = '/missing/forge';
    process.env.ANVIL_BIN = '/missing/anvil';
    const result = await runOnboardingLocalTest({ root, autoInit: false });
    assert.equal(result.status, 'MISSING_TOOL');
    const output = formatOnboardingLocalResult(result);
    assert.match(output, /CRUCIBLE CANNOT RUN/);
    assert.match(output, /What we found/);
    assert.match(output, /What is missing/);
    assert.match(output, /MISSING_TOOL/);
    assert.match(output, /Foundry|PATH|forge/i);
    assert.doesNotMatch(output, /ENOENT|ELIFECYCLE/);
  } finally {
    process.env.PATH = previousPath;
    if (previousForge === undefined) delete process.env.FORGE_BIN;
    else process.env.FORGE_BIN = previousForge;
    if (previousAnvil === undefined) delete process.env.ANVIL_BIN;
    else process.env.ANVIL_BIN = previousAnvil;
    rmSync(root, { recursive: true, force: true });
  }
});

test('onboarding reports MISSING_SCENARIO without inventing deploy steps', async () => {
  const root = mkdtempSync(join(tmpdir(), 'crucible-onboard-scenario-'));
  try {
    writeFileSync(join(root, 'foundry.toml'), '[profile.default]\nout = "out"\n');
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src', 'YourContract.sol'), 'contract YourContract {}\n');
    const result = await runOnboardingLocalTest({ root, autoInit: true });
    assert.equal(result.status, 'MISSING_SCENARIO');
    assert.ok(result.detectedContracts.includes('YourContract'));
    const output = formatOnboardingLocalResult(result);
    assert.match(output, /MISSING_SCENARIO/);
    assert.match(output, /YourContract/);
    assert.match(output, /Next step/);
    assert.doesNotMatch(result.summary + result.nextSteps.join('\n'), /deployed|running scenario/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('missing artifacts stay a single failure state without a result path', async () => {
  const root = resolve('fixtures/capabilities/foundry-missing-artifact');
  const result = await runOnboardingLocalTest({ root, autoInit: false });
  assert.equal(result.status, 'MISSING_ARTIFACT');
  assert.equal(result.resultPath, undefined);
  assert.equal(result.runResult, undefined);
  const output = formatOnboardingLocalResult(result);
  assert.match(output, /MISSING_ARTIFACT/);
  assert.doesNotMatch(output, /Cannot load RunResult|latest\.json|CRUCIBLE ERROR/);
});

test('onboarding refuses to guess among multiple Foundry projects', async () => {
  const root = mkdtempSync(join(tmpdir(), 'crucible-onboard-multi-'));
  try {
    mkdirSync(join(root, 'first'), { recursive: true });
    mkdirSync(join(root, 'second'), { recursive: true });
    writeFileSync(join(root, 'first', 'foundry.toml'), '[profile.default]\nout = "out"\n');
    writeFileSync(join(root, 'second', 'foundry.toml'), '[profile.default]\nout = "out"\n');
    const result = await runOnboardingLocalTest({ root, autoInit: false });
    assert.equal(result.status, 'UNSUPPORTED_TOOLCHAIN');
    assert.match(result.summary, /Multiple Foundry projects/);
    assert.match(result.nextSteps.join('\n'), /--root/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('onboarding happy path runs detect → build → Anvil → test', async () => {
  const root = resolve('examples/monad-erc721-demo');
  const outPath = join(mkdtempSync(join(tmpdir(), 'crucible-onboard-out-')), 'result.json');
  try {
    const result = await runOnboardingLocalTest({
      root,
      scenarioPath: 'scenarios/mint-nft.json',
      foundryRoot: '.',
      outPath,
      autoInit: false
    });
    assert.equal(result.status, 'PASSED');
    assert.equal(onboardingExitCode(result.status), 0);
    assert.equal(result.runResult?.status, 'passed');
    assert.ok(result.resultPath?.endsWith('result.json'));
    assert.match(formatOnboardingLocalResult(result), /CRUCIBLE LOCAL TEST/);
  } finally {
    rmSync(dirname(outPath), { recursive: true, force: true });
  }
});

test('onboarding repeat run stays deterministic on clean Anvil', async () => {
  const root = resolve('examples/monad-erc20-demo');
  const dir = mkdtempSync(join(tmpdir(), 'crucible-onboard-repeat-'));
  try {
    const first = await runOnboardingLocalTest({
      root,
      scenarioPath: 'scenarios/happy-path.json',
      foundryRoot: '.',
      outPath: join(dir, 'a.json'),
      autoInit: false
    });
    const second = await runOnboardingLocalTest({
      root,
      scenarioPath: 'scenarios/happy-path.json',
      foundryRoot: '.',
      outPath: join(dir, 'b.json'),
      autoInit: false
    });
    assert.equal(first.status, 'PASSED');
    assert.equal(second.status, 'PASSED');
    assert.equal(first.runResult?.status, second.runResult?.status);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
