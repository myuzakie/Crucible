import assert from 'node:assert/strict';
import test from 'node:test';

import { replaySequence, validateResult } from './viewer.js';

test('replay stops at the first failed node', () => {
  assert.deepEqual(replaySequence([
    { id: 'deploy', status: 'passed', durationMs: 1 },
    { id: 'mint', status: 'passed', durationMs: 1 },
    { id: 'balance', status: 'failed', durationMs: 1 },
    { id: 'after-failure', status: 'skipped', durationMs: 0 }
  ]), ['deploy', 'mint', 'balance']);
});

test('malformed result is rejected while an empty node list is valid for empty state', () => {
  assert.throws(() => validateResult({ scenario: 'broken' }), /scenario, status, atau nodes/);
  const result = validateResult({
    schemaVersion: '0.1', runId: 'empty', scenario: 'empty', status: 'passed', score: 0,
    network: { name: 'fixture', chainId: 31337 }, startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(), nodes: [], summary: { passed: 0, failed: 0, skipped: 0 }
  });
  assert.equal(result.nodes.length, 0);
});
