import test from 'node:test';
import assert from 'node:assert/strict';

test('repository foundation is available', () => {
  assert.equal(typeof process.version, 'string');
});
