import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import test from 'node:test';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { startLocalWorkspaceServer } from './workspace-server.js';

test('local workspace server composes localhost API and static handlers safely', async () => {
  const root = await mkdtemp(join(tmpdir(), 'crucible-m23-4-'));
  const staticRoot = join(root, 'web');
  await mkdir(join(staticRoot, 'assets'), { recursive: true });
  await writeFile(join(staticRoot, 'index.html'), '<!doctype html><title>Local fixture</title>');
  await writeFile(join(staticRoot, 'assets', 'app.js'), 'window.fixture = true;');
  await writeFile(join(root, 'outside.txt'), 'private repository file');
  await symlink(join(root, 'outside.txt'), join(staticRoot, 'assets', 'escape.js'));

  const workspace = await startLocalWorkspaceServer({ root, staticRoot, port: 0 });
  try {
    const address = workspace.server.address();
    if (!address || typeof address === 'string') throw new Error('Workspace server did not expose an address.');
    assert.equal(address.address, '127.0.0.1');

    const rootResponse = await fetch(`${workspace.url}/`);
    assert.equal(rootResponse.status, 200);
    assert.match(await rootResponse.text(), /Local fixture/);

    const assetResponse = await fetch(`${workspace.url}/assets/app.js`);
    assert.equal(assetResponse.status, 200);
    assert.match(await assetResponse.text(), /window\.fixture/);

    const healthResponse = await fetch(`${workspace.url}/api/health`, { headers: { origin: workspace.url } });
    assert.equal(healthResponse.status, 200);
    assert.deepEqual(await healthResponse.json(), { ok: true, service: 'crucible-local-runner', version: '0.1.0' });

    const unknownApiResponse = await fetch(`${workspace.url}/api/not-real`);
    assert.equal(unknownApiResponse.status, 404);

    const traversalResponse = await fetch(`${workspace.url}/assets/%2e%2e/outside.txt`);
    assert.equal(traversalResponse.status, 404);

    const symlinkResponse = await fetch(`${workspace.url}/assets/escape.js`);
    assert.equal(symlinkResponse.status, 404);
  } finally {
    await workspace.close();
    assert.equal(workspace.server.listening, false);
    await rm(root, { recursive: true, force: true });
  }
});

test('local workspace server rejects non-localhost binds', async () => {
  const root = await mkdtemp(join(tmpdir(), 'crucible-m23-4-bind-'));
  try {
    await assert.rejects(
      () => startLocalWorkspaceServer({ root, host: '0.0.0.0', port: 0 }),
      /must bind to 127\.0\.0\.1/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
