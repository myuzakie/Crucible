import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import test from 'node:test';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

function waitForOutput(child: ReturnType<typeof spawn>, pattern: RegExp): Promise<string> {
  return new Promise((resolveOutput, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${pattern}. Output:\n${output}`)), 10000);
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

function waitForExit(child: ReturnType<typeof spawn>): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  return new Promise((resolveExit, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolveExit({ code, signal }));
  });
}

test('connect boots the bundled workspace and keeps the process alive', async () => {
  const root = await mkdtemp(join(tmpdir(), 'crucible-m23-7-'));
  const repositoryRoot = resolve(process.cwd().endsWith('/packages/cli') ? join(process.cwd(), '..', '..') : process.cwd());
  const entrypoint = join(repositoryRoot, 'packages/cli/src/index.ts');
  const child = spawn(process.execPath, ['--import', 'tsx', entrypoint, 'connect', '--root', root, '--port', '0'], {
    cwd: repositoryRoot,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  try {
    const output = await waitForOutput(child, /Shutdown/);
    const url = output.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
    assert.ok(url);
    assert.match(output, /CRUCIBLE LOCAL WORKSPACE/);
    assert.match(output, /Repository/);
    assert.match(output, /Shutdown/);

    const rootResponse = await fetch(`${url}/`);
    assert.equal(rootResponse.status, 200);
    assert.match(await rootResponse.text(), /Crucible/);

    const healthResponse = await fetch(`${url}/api/health`);
    assert.equal(healthResponse.status, 200);

    const projectResponse = await fetch(`${url}/api/project`);
    assert.equal(projectResponse.status, 200);
    const project = await projectResponse.json() as { project: { root: string } };
    assert.equal(project.project.root, root);

    child.kill('SIGINT');
    const exited = await waitForExit(child);
    assert.equal(exited.code, 0);

    const second = spawn(process.execPath, ['--import', 'tsx', entrypoint, 'connect', '--root', root, '--port', new URL(url).port], {
      cwd: repositoryRoot,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    try {
      const secondOutput = await waitForOutput(second, /Shutdown/);
      const secondUrl = secondOutput.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
      assert.equal(secondUrl, url);
      assert.equal((await fetch(`${secondUrl}/api/health`)).status, 200);
      second.kill('SIGTERM');
      const secondExit = await waitForExit(second);
      assert.equal(secondExit.code, 0);
    } finally {
      if (!second.killed) second.kill('SIGTERM');
    }
  } finally {
    if (!child.killed) child.kill('SIGTERM');
    await rm(root, { recursive: true, force: true });
  }
});
