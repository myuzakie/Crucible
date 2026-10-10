import assert from 'node:assert/strict';
import test from 'node:test';

import { RunResultSchema, ScenarioSchema } from './index.js';

const validScenario = {
  name: 'token-happy-path',
  network: 'local',
  actors: { alice: 'env:ALICE_PRIVATE_KEY' },
  nodes: [
    { id: 'deploy', type: 'deploy', contract: 'Token', args: [], after: [] },
    {
      id: 'mint',
      type: 'call',
      from: 'alice',
      to: 'deploy',
      fn: 'mint',
      args: ['alice', '1000'],
      after: ['deploy']
    },
    {
      id: 'balance',
      type: 'assert',
      check: { fn: 'balanceOf', args: ['alice'], eq: '1000' },
      after: ['mint']
    }
  ]
};

test('accepts a valid scenario', () => {
  const result = ScenarioSchema.safeParse(validScenario);
  assert.equal(result.success, true);
});

test('rejects duplicate and unknown node dependencies', () => {
  const result = ScenarioSchema.safeParse({
    ...validScenario,
    nodes: [
      { id: 'same', type: 'deploy', contract: 'Token' },
      { id: 'same', type: 'assert', check: { fn: 'x' }, after: ['missing'] }
    ]
  });

  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.issues.length, 2);
});

test('accepts a failed run result', () => {
  const result = RunResultSchema.safeParse({
    runId: 'run-1',
    scenario: 'token-buggy-mint',
    status: 'failed',
    score: 66,
    network: { name: 'local', chainId: 31337 },
    startedAt: '2026-10-11T00:00:00.000Z',
    finishedAt: '2026-10-11T00:00:01.000Z',
    nodes: [
      { id: 'deploy', status: 'passed', durationMs: 10 },
      {
        id: 'balance',
        status: 'failed',
        durationMs: 2,
        error: { kind: 'assertion', expected: '1000', actual: '0' }
      }
    ],
    summary: { passed: 1, failed: 1, skipped: 0 }
  });

  assert.equal(result.success, true);
});
