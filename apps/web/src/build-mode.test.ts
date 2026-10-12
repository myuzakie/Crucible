import assert from 'node:assert/strict';
import test from 'node:test';

import { parseWebBuildMode } from './build-mode.js';

test('accepts the explicit public Web build mode', () => {
  assert.equal(parseWebBuildMode('public'), 'public');
});

test('accepts the explicit local Web build mode', () => {
  assert.equal(parseWebBuildMode('local'), 'local');
});

test('rejects a missing or empty Web build mode', () => {
  assert.throws(() => parseWebBuildMode(undefined), /VITE_CRUCIBLE_MODE.*missing/);
  assert.throws(() => parseWebBuildMode(''), /VITE_CRUCIBLE_MODE.*empty/);
});

test('rejects an unknown Web build mode', () => {
  assert.throws(() => parseWebBuildMode('preview'), /VITE_CRUCIBLE_MODE.*preview/);
});
