import assert from 'node:assert/strict';
import test from 'node:test';

import { RunResultSchema } from '../schema/index.js';
import { withExecutionVerification } from './execution.js';

const base = RunResultSchema.parse({
  runId: 'run-execution', scenario: 'manual-journey', status: 'failed', score: 50,
  network: { name: 'local', chainId: 31337 }, startedAt: '2026-01-01T00:00:00.000Z', finishedAt: '2026-01-01T00:00:01.000Z',
  nodes: [
    { id: 'deploy', status: 'passed', durationMs: 1 },
    { id: 'assert', status: 'failed', durationMs: 1, error: { kind: 'assertion', expected: 'alice', actual: 'bob', message: 'Expected alice, got bob' } }
  ], summary: { passed: 1, failed: 1, skipped: 0 }
});

test('execution verification binds generic findings to run node evidence', () => {
  const verified = withExecutionVerification(base);
  assert.equal(verified.runtimeVerification?.profile, 'generic-evm');
  assert.equal(verified.runtimeVerification?.findings.length, 2);
  const failed = verified.runtimeVerification?.findings.find((finding) => finding.nodeId === 'assert');
  assert.equal(failed?.status, 'failed');
  assert.deepEqual(failed?.observed, 'bob');
  assert.equal(failed?.evidence[0]?.source, 'scenario');
});
