import assert from 'node:assert/strict';
import test from 'node:test';

import { selectAppSurface } from './app-surface.js';

test('public build selects PublicApp and not the local workspace', () => {
  assert.equal(selectAppSurface('public'), 'public');
  assert.notEqual(selectAppSurface('public'), 'local');
});

test('local build selects the existing local workspace', () => {
  assert.equal(selectAppSurface('local'), 'local');
});

test('public fixture query remains available without changing the local build surface', () => {
  assert.equal(selectAppSurface('public', true), 'fixture');
  assert.equal(selectAppSurface('local', true), 'local');
});
