import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { RunResultSchema } from '@crucible/core/schema';
import { createVerifiedReplay } from '@crucible/core';
import { attachPassportAttestation, createRuntimePassport, generateSigningKeyPair, verifyRuntimePassport } from './index.js';

const root = process.cwd();
const read = (name: string) => RunResultSchema.parse(JSON.parse(readFileSync(join(root, 'apps/web/public/results', name), 'utf8')));

test('creates, verifies, and attests a version-bound Runtime Passport', () => {
  const before = read('monad-runtime-vulnerable.json');
  const after = read('monad-runtime-fixed.json');
  const replay = createVerifiedReplay({ beforeRun: before, afterRun: after, scenarioHash: 'scenario-v1', ruleSetHash: 'rules-v1' });
  const { privateKeyPem } = generateSigningKeyPair();
  const passport = createRuntimePassport({
    runResult: after,
    replay,
    repository: 'github.com/myuzakie/FlashMarket',
    commit: 'abc123def456',
    runtimeVersion: 'monad-testnet-10143',
    journeyHashes: { 'new-user-purchase': 'journey-purchase-v1', settlement: 'journey-settlement-v1', auction: 'journey-auction-v1' },
    issuer: 'crucible-test-issuer',
    privateKeyPem,
    passportId: 'passport-runtime-demo',
    issuedAt: '2026-10-11T10:00:00.000Z'
  });
  assert.equal(verifyRuntimePassport(passport).passportHash, passport.passportHash);
  const attested = attachPassportAttestation(passport, {
    chainId: 10143,
    registryAddress: '0x1111111111111111111111111111111111111111',
    transactionHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    suiteVersion: '1.0.0',
    explorerUrl: 'https://testnet.monadexplorer.com/tx/0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  });
  assert.equal(attested.onChain?.suiteVersion, '1.0.0');
});

test('rejects a passport without runtime-verified replay', () => {
  const after = read('monad-runtime-fixed.json');
  const { privateKeyPem } = generateSigningKeyPair();
  assert.throws(() => createRuntimePassport({
    runResult: after,
    replay: { status: 'runtime-verified', beforeRunId: 'before', afterRunId: 'wrong', scenarioHash: 's', suiteVersion: '1.0.0', profile: 'monad-core', ruleSetHash: 'r', diffSummary: { recoveredJourneys: [], failedBefore: 0, passedAfter: 3 } },
    repository: 'repo', commit: 'commit', runtimeVersion: 'runtime', journeyHashes: {}, issuer: 'issuer', privateKeyPem
  }), /exact after run/);
});
