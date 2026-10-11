import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import assert from 'node:assert/strict';
import test from 'node:test';

import { inspectProject } from './index.js';

test('project inspection returns a stable onboarding payload for an unsupported repository', () => {
    const root = mkdtempSync(join(tmpdir(), 'crucible-project-'));
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'sample-app' }));
    const snapshot = inspectProject(root, 'Sample app');
    assert.equal(snapshot.schemaVersion, '0.1');
    assert.equal(snapshot.project.name, 'Sample app');
    assert.equal(snapshot.detection.status, 'UNSUPPORTED_TOOLCHAIN');
    assert.equal(snapshot.contractExplorer.available, false);
  });

test('project inspection detects foundry roots without requiring compiled artifacts', () => {
    const root = mkdtempSync(join(tmpdir(), 'crucible-foundry-'));
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'foundry.toml'), '[profile.default]\nsrc = "src"\nout = "out"\n');
    const snapshot = inspectProject(root);
    assert.equal(snapshot.detection.toolchain.foundry.detected, true);
    assert.match(snapshot.project.name, /^crucible-foundry-/);
});
