import assert from 'node:assert/strict';
import test from 'node:test';

import { findingsForJourney, replaySequence, runtimeJourneys, validateResult } from './viewer.js';

test('replay stops at the first failed node', () => {
  assert.deepEqual(replaySequence([
    { id: 'deploy', status: 'passed', durationMs: 1 },
    { id: 'mint', status: 'passed', durationMs: 1 },
    { id: 'balance', status: 'failed', durationMs: 1 },
    { id: 'after-failure', status: 'skipped', durationMs: 0 }
  ]), ['deploy', 'mint', 'balance']);
});

test('malformed result is rejected while an empty node list is valid for empty state', () => {
  assert.throws(() => validateResult({ scenario: 'broken' }), /RunResult tidak valid/);
  const result = validateResult({
    schemaVersion: '0.1', runId: 'empty', scenario: 'empty', status: 'passed', score: 0,
    network: { name: 'fixture', chainId: 31337 }, startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(), nodes: [], summary: { passed: 0, failed: 0, skipped: 0 }
  });
  assert.equal(result.nodes.length, 0);
});

test('groups Monad runtime findings by business journey', () => {
  const result = validateResult({
    schemaVersion: '0.1', runId: 'runtime', scenario: 'runtime-demo', status: 'failed', score: 50,
    network: { name: 'fixture', chainId: 10143 }, startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(), nodes: [], summary: { passed: 0, failed: 0, skipped: 0 },
    runtimeVerification: {
      profile: 'monad-core', suiteVersion: '1.0.0', findings: [{
        findingId: 'f1', ruleId: 'MND-TIME-001', journeyId: 'auction', nodeId: 'bid', status: 'failed',
        userImpact: 'Auction timing can be ambiguous.', summary: 'Same timestamp.', expected: 'progress', observed: 'same',
        evidence: [{ type: 'block', source: 'fixture', observed: { block: 2, timestamp: 1 } }]
      }]
    }
  });
  assert.deepEqual(runtimeJourneys(result), ['auction']);
  assert.equal(findingsForJourney(result, 'auction')[0]?.ruleId, 'MND-TIME-001');
});
