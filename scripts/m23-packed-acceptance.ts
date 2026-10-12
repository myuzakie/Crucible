import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temporaryRoot = await mkdtemp(join(tmpdir(), 'crucible-m23-6-'));
const packDirectory = join(temporaryRoot, 'pack');
const externalDirectory = join(temporaryRoot, 'external-repository');
await mkdir(packDirectory, { recursive: true });
await mkdir(externalDirectory, { recursive: true });

try {
  execFileSync('pnpm', ['--filter', '@ohmuzakie/crucible-cli', 'pack', '--pack-destination', packDirectory], {
    cwd: repositoryRoot,
    stdio: 'inherit'
  });
  const tarball = join(packDirectory, (await readdir(packDirectory)).find((name) => name.endsWith('.tgz')) ?? '');
  assert.ok(tarball.endsWith('.tgz'), 'pnpm pack did not produce a tarball.');

  const listing = execFileSync('tar', ['-tzf', tarball], { encoding: 'utf8' }).split('\n').filter(Boolean);
  for (const required of ['package/dist/index.js', 'package/dist/workspace-server.js', 'package/web/index.html', 'package/README.md', 'package/logo.txt']) {
    assert.ok(listing.includes(required), `Packed CLI is missing ${required}.`);
  }
  assert.ok(listing.some((entry) => entry.startsWith('package/web/assets/')), 'Packed CLI is missing Web assets.');
  for (const forbidden of ['apps/web', 'examples/', '.env', 'PRIVATE KEY', 'node_modules/']) {
    assert.equal(listing.some((entry) => entry.includes(forbidden)), false, `Packed CLI contains unnecessary or secret path marker ${forbidden}.`);
  }

  execFileSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', tarball], {
    cwd: externalDirectory,
    stdio: 'inherit'
  });
  assert.equal(existsSync(join(externalDirectory, 'node_modules', '.bin', 'crucible')), true, 'Packed CLI executable was not installed.');
  const help = execFileSync(join(externalDirectory, 'node_modules', '.bin', 'crucible'), ['--help'], { encoding: 'utf8' });
  assert.match(help, /Crucible|Usage:/);

  const externalSmoke = `
    import { startLocalWorkspaceServer } from '@ohmuzakie/crucible-cli/workspace-server';
    const workspace = await startLocalWorkspaceServer({ root: process.cwd(), port: 0 });
    try {
      const root = await fetch(workspace.url + '/');
      if (root.status !== 200 || !(await root.text()).includes('<title>Crucible')) throw new Error('Local Web root failed.');
      const health = await fetch(workspace.url + '/api/health');
      if (health.status !== 200) throw new Error('Local API health failed.');
    } finally {
      await workspace.close();
    }
  `;
  execFileSync(process.execPath, ['--input-type=module', '-e', externalSmoke], { cwd: externalDirectory, stdio: 'inherit' });
  console.log('M23.6 PACKED EXTERNAL ACCEPTANCE: PASSED');
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
