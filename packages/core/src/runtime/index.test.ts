import assert from 'node:assert/strict';
import test from 'node:test';

import {
  RuntimeEvidenceSchema,
  RuntimeFindingSchema,
  RuntimeReplaySummarySchema,
  RuntimeRuleSchema,
  RuntimeVerificationSchema,
  isRuntimePassportEligible
} from './index.js';

const rule = {
  ruleId: 'MND-TIME-001',
  title: 'Block Timestamp Progression Assumption',
  description: 'Checks whether the application assumes every block has a new timestamp.',
  severity: 'high',
  category: 'timing',
  runtime: 'monad',
  docsReference: 'https://docs.monad.xyz/',
  suiteVersion: '1.0.0'
} as const;

const evidence = {
  type: 'block',
  source: 'fixture',
  observed: { block: 502, timestamp: 1000 },
  expected: { timestamp: 1001 },
  blockNumber: 502,
  blockTimestamp: 1000
} as const;

const finding = {
  findingId: 'finding-time-1',
  ruleId: 'MND-TIME-001',
  journeyId: 'auction',
  nodeId: 'bid-c',
  status: 'failed',
  userImpact: 'Bids in adjacent blocks can receive the same timestamp.',
  summary: 'Timestamp did not progress between adjacent blocks.',
  expected: 'timestamp increases for every block',
  observed: 'block 501 and 502 share timestamp 1000',
  evidence: [evidence]
} as const;

test('accepts a runtime rule and evidence round-trip', () => {
  assert.deepEqual(RuntimeRuleSchema.parse(rule), rule);
  assert.deepEqual(RuntimeEvidenceSchema.parse(evidence), evidence);
});

test('rejects malformed rule ids and unknown evidence sources', () => {
  assert.equal(RuntimeRuleSchema.safeParse({ ...rule, ruleId: 'time-rule' }).success, false);
  assert.equal(RuntimeEvidenceSchema.safeParse({ ...evidence, source: 'made-up' }).success, false);
});

test('requires evidence and user impact for failed findings', () => {
  assert.equal(RuntimeFindingSchema.safeParse({ ...finding, evidence: [] }).success, false);
  assert.equal(RuntimeFindingSchema.safeParse({ ...finding, userImpact: undefined }).success, false);
});

test('generic pass is not Monad Passport eligible', () => {
  assert.equal(
    isRuntimePassportEligible({ profile: 'generic-evm', suiteVersion: '1.0.0', findings: [] }),
    false
  );
});

test('Monad Passport requires all mandatory rules to pass', () => {
  const passedFinding = (ruleId: string) => ({
    ...finding,
    findingId: `passed-${ruleId}`,
    ruleId,
    status: 'passed' as const,
    userImpact: undefined,
    evidence: [evidence]
  });

  const partial = RuntimeVerificationSchema.parse({
    profile: 'monad-core',
    suiteVersion: '1.0.0',
    findings: [passedFinding('MND-TIME-001')]
  });
  assert.equal(isRuntimePassportEligible(partial), false);

  const complete = RuntimeVerificationSchema.parse({
    ...partial,
    findings: [
      passedFinding('MND-TIME-001'),
      passedFinding('MND-FINALITY-001'),
      passedFinding('MND-FUND-001')
    ]
  });
  assert.equal(isRuntimePassportEligible(complete), true);
});

test('runtime replay summary only accepts the verified status', () => {
  const summary = RuntimeReplaySummarySchema.parse({
    status: 'runtime-verified', beforeRunId: 'before', afterRunId: 'after',
    scenarioHash: 'scenario-hash', suiteVersion: '1.0.0', profile: 'monad-core', ruleSetHash: 'rules-hash',
    diffSummary: { recoveredJourneys: ['auction'], failedBefore: 1, passedAfter: 3 }
  });
  assert.equal(summary.status, 'runtime-verified');
  assert.equal(RuntimeReplaySummarySchema.safeParse({ ...summary, status: 'ai-suggested' }).success, false);
});
