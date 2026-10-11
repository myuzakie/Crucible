import assert from 'node:assert/strict';
import test from 'node:test';

import { explorerLinks, MONAD_TESTNET, parsePrivateKey } from './monad.js';
import { preflightMonadTestnet } from './testnet.js';

test('validates testnet private key format without exposing the value', () => {
  assert.equal(parsePrivateKey(`0x${'1'.repeat(64)}`, 'KEY').length, 66);
  assert.throws(() => parsePrivateKey('not-a-key', 'KEY'), /KEY must be a 32-byte/);
});

test('builds Monad explorer links', () => {
  assert.deepEqual(explorerLinks(MONAD_TESTNET.explorerUrl, ['0xabc'], '0xdef'), {
    transactions: [`${MONAD_TESTNET.explorerUrl}tx/0xabc`],
    contract: `${MONAD_TESTNET.explorerUrl}address/0xdef`
  });
});

test('testnet guard requires explicit confirmation before keys are used', () => {
  const result = preflightMonadTestnet({
    chainId: MONAD_TESTNET.chainId,
    rpcUrl: MONAD_TESTNET.rpcUrl,
    actorRefs: { deployer: 'env:DEPLOYER_PRIVATE_KEY' },
    env: {},
    confirmed: false,
    dryRun: false
  });
  assert.equal(result.status, 'TESTNET_CONFIRMATION_REQUIRED');
  assert.deepEqual(result.actorKeys, {});
});

test('testnet dry-run is read-only and does not require wallet keys', () => {
  const result = preflightMonadTestnet({
    chainId: MONAD_TESTNET.chainId,
    rpcUrl: MONAD_TESTNET.rpcUrl,
    actorRefs: { deployer: 'env:DEPLOYER_PRIVATE_KEY' },
    env: {},
    confirmed: false,
    dryRun: true
  });
  assert.equal(result.status, 'TESTNET_DRY_RUN');
  assert.match(result.message, /No build, deployment, or transaction/);
});

test('testnet guard rejects a wrong chain before execution', () => {
  const result = preflightMonadTestnet({
    chainId: 1,
    rpcUrl: 'https://example.invalid',
    actorRefs: {},
    env: {},
    confirmed: true,
    dryRun: false
  });
  assert.equal(result.status, 'WRONG_CHAIN');
});

test('testnet guard accepts only confirmed test-only keys', () => {
  const result = preflightMonadTestnet({
    chainId: MONAD_TESTNET.chainId,
    rpcUrl: MONAD_TESTNET.rpcUrl,
    actorRefs: { deployer: 'env:DEPLOYER_PRIVATE_KEY' },
    env: { DEPLOYER_PRIVATE_KEY: `0x${'1'.repeat(64)}` },
    confirmed: true,
    dryRun: false
  });
  assert.equal(result.status, 'READY');
  assert.equal(result.actorKeys.deployer.length, 66);
  assert.doesNotMatch(result.message, /1111/);
});
