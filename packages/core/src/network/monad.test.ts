import assert from 'node:assert/strict';
import test from 'node:test';

import { explorerLinks, MONAD_TESTNET, parsePrivateKey } from './monad.js';

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
