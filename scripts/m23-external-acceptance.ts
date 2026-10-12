import assert from 'node:assert/strict';
import { chmod, cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temporaryRoot = await mkdtemp(join(tmpdir(), 'crucible-m23-10-'));
const packageDirectory = join(temporaryRoot, 'package');
const installDirectory = join(temporaryRoot, 'cli-install');
const externalRoot = join(temporaryRoot, 'external-foundry');
const missingScenarioRoot = join(temporaryRoot, 'missing-scenario');
const hardhatRoot = join(temporaryRoot, 'hardhat');
const fakeBinDirectory = join(temporaryRoot, 'fake-bin');

type CliResult = { status: number | null; output: string };

function commandEnvironment(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PATH: `${fakeBinDirectory}:${process.env.PATH ?? ''}`
  };
}

function runCli(bin: string, args: string[], cwd: string, env = commandEnvironment()): CliResult {
  try {
    return {
      status: 0,
      output: execFileSync(bin, args, { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    };
  } catch (error) {
    const failure = error as { status?: number | null; stdout?: string; stderr?: string; message?: string };
    return {
      status: failure.status ?? 1,
      output: `${failure.stdout ?? ''}${failure.stderr ?? ''}${failure.message ?? ''}`
    };
  }
}

function waitForOutput(child: ChildProcess, pattern: RegExp): Promise<string> {
  return new Promise((resolveOutput, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${pattern}. Output:\n${output}`)), 15000);
    const onData = (chunk: Buffer | string) => {
      output += String(chunk);
      if (pattern.test(output)) {
        clearTimeout(timer);
        resolveOutput(output);
      }
    };
    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
  });
}

function waitForExit(child: ChildProcess): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  return new Promise((resolveExit, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolveExit({ code, signal }));
  });
}

async function jsonResponse<T>(url: string, init?: RequestInit): Promise<{ response: Response; value: T }> {
  const response = await fetch(url, init);
  return { response, value: await response.json() as T };
}

async function copyExternalFoundry(source: string, destination: string, includeScenarios = true): Promise<void> {
  await cp(source, destination, {
    recursive: true,
    filter: (path) => {
      if (path.includes('/.git') || path.includes('/out') || path.includes('/cache') || path.includes('/crucible')) return false;
      if (!includeScenarios && path.includes('/scenarios')) return false;
      return true;
    }
  });
}

function assertNoRawError(output: string, label: string): void {
  assert.doesNotMatch(output, /ENOENT|ELIFECYCLE|Cannot find module|stack trace/i, `${label} leaked a raw filesystem/runtime error`);
}

function parseCliJson<T>(output: string, label: string): T {
  const start = output.indexOf('{');
  for (let end = output.lastIndexOf('}'); start >= 0 && end >= start; end -= 1) {
    try {
      return JSON.parse(output.slice(start, end + 1)) as T;
    } catch {
      // execFileSync appends its own failure message after JSON on non-zero exits.
    }
  }
  throw new Error(`${label} did not return JSON:\n${output}`);
}

try {
  await cp(resolve('examples/monad-erc20-demo'), externalRoot, { recursive: true, filter: (path) => !path.includes('/.git') && !path.includes('/out') && !path.includes('/cache') && !path.includes('/crucible') });
  await copyExternalFoundry(resolve('examples/monad-erc20-demo'), missingScenarioRoot, false);
  await mkdir(fakeBinDirectory, { recursive: true });
  await writeFile(join(fakeBinDirectory, 'xdg-open'), '#!/bin/sh\nexit 1\n');
  await chmod(join(fakeBinDirectory, 'xdg-open'), 0o755);
  await mkdir(hardhatRoot, { recursive: true });
  await writeFile(join(hardhatRoot, 'hardhat.config.ts'), 'export default {}\n');

  execFileSync('forge', ['build'], { cwd: externalRoot, stdio: 'pipe' });
  execFileSync('forge', ['build'], { cwd: missingScenarioRoot, stdio: 'pipe' });

  await mkdir(packageDirectory, { recursive: true });
  await mkdir(installDirectory, { recursive: true });
  execFileSync('pnpm', ['--filter', '@ohmuzakie/crucible-cli', 'pack', '--pack-destination', packageDirectory], { cwd: repositoryRoot, stdio: 'inherit' });
  const tarballName = (await readdir(packageDirectory)).find((name) => name.endsWith('.tgz'));
  assert.ok(tarballName, 'Packed CLI tarball was not produced.');
  const tarball = join(packageDirectory, tarballName);
  const listing = execFileSync('tar', ['-tzf', tarball], { encoding: 'utf8' });
  assert.match(listing, /package\/dist\/index\.js/);
  assert.match(listing, /package\/dist\/workspace-server\.js/);
  assert.match(listing, /package\/web\/index\.html/);
  assert.match(listing, /package\/web\/assets\//);
  assert.doesNotMatch(listing, /apps\/web|examples\/|\.env|PRIVATE KEY|node_modules\//i);
  execFileSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', tarball], { cwd: installDirectory, stdio: 'pipe' });

  const cli = join(installDirectory, 'node_modules', '.bin', 'crucible');
  assert.equal(runCli(cli, ['--help'], installDirectory).status, 0, 'Packed CLI executable did not start.');

  const testResult = runCli(cli, ['test', '--root', externalRoot, '--foundry-root', '.', '--scenario', 'scenarios/happy-path.json', '--json'], externalRoot);
  assert.equal(testResult.status, 0, testResult.output);
  assertNoRawError(testResult.output, 'Packed local test');
  const parsedTest = parseCliJson<{ status?: string; resultPath?: string }>(testResult.output, 'Packed local test');
  assert.equal(parsedTest.status, 'PASSED');

  const connect = spawn(process.execPath, [join(installDirectory, 'node_modules', '@ohmuzakie', 'crucible-cli', 'dist', 'index.js'), 'connect', '--root', externalRoot, '--port', '0'], {
    cwd: externalRoot,
    env: commandEnvironment(),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  try {
    const output = await waitForOutput(connect, /Shutdown/);
    assert.match(output, /CRUCIBLE LOCAL WORKSPACE/);
    assert.match(output, /Repository/);
    assert.match(output, /Status/);
    const url = output.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
    assert.ok(url, 'connect did not report a localhost workspace URL.');

    const rootResponse = await fetch(`${url}/`);
    assert.equal(rootResponse.status, 200);
    assert.match(await rootResponse.text(), /<title>Crucible/);

    const project = await jsonResponse<{ project: { root: string } }>(`${url}/api/project`);
    assert.equal(project.response.status, 200);
    assert.equal(project.value.project.root, externalRoot);

    const contracts = await jsonResponse<{ contracts: Array<{ name?: string }> }>(`${url}/api/contracts`);
    assert.equal(contracts.response.status, 200);
    assert.ok(contracts.value.contracts.some((contract: { name?: string }) => contract.name === 'Token'), 'External contract was not visible in the Local Web API.');

    const health = await jsonResponse<{ ok: boolean }>(`${url}/api/health`);
    assert.equal(health.response.status, 200);

    const scenario = JSON.parse(await readFile(join(externalRoot, 'scenarios', 'happy-path.json'), 'utf8')) as Record<string, unknown>;
    const run = await jsonResponse<{ result?: { status?: string; nodes?: unknown[] } }>(`${url}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ scenario })
    });
    assert.equal(run.response.status, 200, JSON.stringify(run.value));
    assert.equal(run.value.result?.status, 'passed');
    assert.ok(Array.isArray(run.value.result?.nodes) && run.value.result.nodes.length > 0, 'External run did not return evidence nodes.');

    const state = await jsonResponse<{ scenario?: { name?: string } }>(`${url}/api/state`);
    assert.equal(state.response.status, 200);
    assert.equal(state.value.scenario?.name, 'token-happy-path');
  } finally {
    connect.kill('SIGTERM');
    const exited = await waitForExit(connect);
    assert.equal(exited.code, 0, `connect did not shut down cleanly: ${exited.signal ?? 'unknown'}`);
  }

  const missingScenario = runCli(cli, ['test', '--root', missingScenarioRoot, '--json'], missingScenarioRoot);
  assert.notEqual(missingScenario.status, 0);
  assertNoRawError(missingScenario.output, 'Missing-scenario acceptance');
  assert.equal(parseCliJson<{ status?: string }>(missingScenario.output, 'Missing-scenario acceptance').status, 'MISSING_SCENARIO');

  const unsupported = runCli(cli, ['test', '--root', hardhatRoot, '--json'], hardhatRoot);
  assert.notEqual(unsupported.status, 0);
  assertNoRawError(unsupported.output, 'Unsupported-toolchain acceptance');
  assert.equal(parseCliJson<{ status?: string }>(unsupported.output, 'Unsupported-toolchain acceptance').status, 'UNSUPPORTED_TOOLCHAIN');

  console.log('M23.10 PACKED EXTERNAL ACCEPTANCE: PASSED');
  console.log('Verified packed connect, same-origin API, external contract discovery, local run/evidence, missing-scenario guidance, and unsupported-toolchain guidance.');
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
