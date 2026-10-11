import assert from 'node:assert/strict';
import test from 'node:test';

import { missingToolMessage, probeTool, toolExecutable } from './tooling.js';

test('tool probe reports a missing forge executable without raw ENOENT', () => {
  const env = { FORGE_BIN: '/path/that/does/not/exist' };
  const probe = probeTool('forge', env);
  assert.equal(probe.available, false);
  assert.match(missingToolMessage('forge', probe), /Foundry forge was not found/);
  assert.doesNotMatch(missingToolMessage('forge', probe), /ENOENT/);
});

test('tool probe honors explicit executable overrides', () => {
  assert.equal(toolExecutable('anvil', { ANVIL_BIN: '/custom/anvil' }), '/custom/anvil');
});
