import assert from 'node:assert/strict';
import test from 'node:test';

import { isRuntimePassportEligible } from './index.js';
import { evaluateMonadRuntime } from './rules.js';

test('evaluates the three Monad runtime rules from deterministic evidence', () => {
  const result = evaluateMonadRuntime({
    journeyId: 'auction',
    nodeId: 'bid-c',
    time: { previousBlock: 501, previousTimestamp: 1000, currentBlock: 502, currentTimestamp: 1000 },
    finality: { observedAssurance: 'proposed', requiredAssurance: 'finalized', actionTriggered: true },
    funding: { fundingBlock: 12051, attemptBlock: 12052, requiredSafeDistance: 3, firstAttempt: 'failed', retryBlock: 12054, retryAttempt: 'passed' }
  });

  assert.deepEqual(result.findings.map((finding) => [finding.ruleId, finding.status]), [
    ['MND-TIME-001', 'failed'],
    ['MND-FINALITY-001', 'failed'],
    ['MND-FUND-001', 'failed']
  ]);
  assert.equal(result.findings.every((finding) => finding.evidence.length > 0), true);
  assert.equal(isRuntimePassportEligible(result), false);
});

test('fixed evidence passes the same three rules and is Passport eligible', () => {
  const result = evaluateMonadRuntime({
    journeyId: 'fixed-runtime-demo',
    nodeId: 'settlement',
    time: { previousBlock: 501, previousTimestamp: 1000, currentBlock: 502, currentTimestamp: 1001 },
    finality: { observedAssurance: 'finalized', requiredAssurance: 'finalized', actionTriggered: true },
    funding: { fundingBlock: 12051, attemptBlock: 12054, requiredSafeDistance: 3, firstAttempt: 'passed' }
  });

  assert.equal(result.findings.every((finding) => finding.status === 'passed'), true);
  assert.equal(isRuntimePassportEligible({ ...result, findings: [
    ...result.findings,
    { ...result.findings[0], ruleId: 'MND-FINALITY-001', findingId: 'finality' },
    { ...result.findings[0], ruleId: 'MND-FUND-001', findingId: 'funding' }
  ] }), true);
});
