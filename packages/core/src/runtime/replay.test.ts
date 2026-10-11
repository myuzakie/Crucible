import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { RunResultSchema } from '../schema/index.js';
import { createVerifiedReplay } from './replay.js';

const root = process.cwd();
const read = (name: string) => RunResultSchema.parse(JSON.parse(readFileSync(join(root, 'apps/web/public/results', name), 'utf8')));

test('creates a verified before/after replay with matching invariants', () => {
  const replay = createVerifiedReplay({
    beforeRun: read('monad-runtime-vulnerable.json'),
    afterRun: read('monad-runtime-fixed.json'),
    scenarioHash: 'scenario-hash-1',
    ruleSetHash: 'rules-hash-1'
  });
  assert.equal(replay.status, 'runtime-verified');
  assert.deepEqual(replay.diffSummary.recoveredJourneys.sort(), ['auction', 'new-user-purchase', 'settlement']);
});

test('rejects replay when after run still fails', () => {
  const beforeRun = read('monad-runtime-vulnerable.json');
  assert.throws(() => createVerifiedReplay({
    beforeRun,
    afterRun: beforeRun,
    scenarioHash: 'scenario-hash-1',
    ruleSetHash: 'rules-hash-1'
  }), /failed before run and a passed after run/);
});
