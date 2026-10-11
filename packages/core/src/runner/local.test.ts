import assert from 'node:assert/strict';
import test from 'node:test';

import { mapAnvilAccounts, ANVIL_DEFAULT_KEYS } from './local.js';

test('mapAnvilAccounts maps deployer/alice to Anvil defaults', () => {
  const accounts = mapAnvilAccounts({
    deployer: 'env:DEPLOYER_PRIVATE_KEY',
    alice: 'env:ALICE_PRIVATE_KEY'
  });
  assert.equal(accounts.deployer, ANVIL_DEFAULT_KEYS[0]);
  assert.equal(accounts.alice, ANVIL_DEFAULT_KEYS[1]);
});

test('mapAnvilAccounts falls back by actor order for unknown names', () => {
  const accounts = mapAnvilAccounts({
    owner: 'env:OWNER_PRIVATE_KEY',
    user: 'env:USER_PRIVATE_KEY'
  });
  assert.equal(accounts.owner, ANVIL_DEFAULT_KEYS[0]);
  assert.equal(accounts.user, ANVIL_DEFAULT_KEYS[1]);
});
