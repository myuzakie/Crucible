import assert from 'node:assert/strict';
import test from 'node:test';

import { isLocalTestCommand, localTestUsage } from './command-contract.js';

test('test command defaults to local mode', () => {
  assert.equal(isLocalTestCommand([]), true);
  assert.equal(isLocalTestCommand(['--root', '/tmp/dapp']), true);
  assert.equal(isLocalTestCommand(['--local']), true);
});

test('test command accepts explicit local network only', () => {
  assert.equal(isLocalTestCommand(['--network', 'local']), true);
  assert.equal(isLocalTestCommand(['--network', 'monad-testnet']), false);
});

test('local test usage explains the short command', () => {
  assert.match(localTestUsage(), /pnpm crucible test \[--local\]/);
});
