import assert from 'node:assert/strict';
import test from 'node:test';

import { validateMonadEnvironment } from './validate-monad-env.js';

const configured = {
  MONAD_TESTNET_RPC_URL: 'https://testnet-rpc.monad.xyz/',
  MONAD_CHAIN_ID: '10143',
  DEPLOYER_PRIVATE_KEY: 'redacted',
  ALICE_PRIVATE_KEY: 'redacted'
};

test('accepts configured Monad smoke environment', () => {
  assert.doesNotThrow(() => validateMonadEnvironment(configured));
});

test('reports missing names without exposing values', () => {
  assert.throws(() => validateMonadEnvironment({ MONAD_CHAIN_ID: '10143' }), /MONAD_TESTNET_RPC_URL/);
});

test('rejects a non-Monad chain id', () => {
  assert.throws(() => validateMonadEnvironment({ ...configured, MONAD_CHAIN_ID: '1' }), /Expected MONAD_CHAIN_ID 10143/);
});
