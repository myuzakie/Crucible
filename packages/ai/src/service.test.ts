import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { buildDiagnosisPrompt, diagnoseWithModel, type Diagnosis } from './index.js';

const root = join(import.meta.dirname, '../../../');
const result = JSON.parse(readFileSync(join(root, 'fixtures/result/buggy-mint.json'), 'utf8'));
const scenario = JSON.parse(readFileSync(join(root, 'examples/monad-erc20-demo/scenarios/buggy-mint.json'), 'utf8'));
const diagnosis = JSON.parse(readFileSync(join(root, 'fixtures/diagnosis/buggy-mint.json'), 'utf8')) as Diagnosis;
const request = { runResult: result, scenario, source: 'const privateKey = 0x' + 'a'.repeat(64) };

test('accepts a model diagnosis only when evidence matches the RunResult', async () => {
  const response = await diagnoseWithModel(request, { client: async () => diagnosis });
  assert.equal(response.source, 'model');
  assert.equal(response.diagnosis?.runId, result.runId);
});

test('falls back when the model returns fabricated evidence', async () => {
  const response = await diagnoseWithModel(request, {
    client: async () => ({ ...diagnosis, evidence: [{ nodeId: 'balance', field: 'error.actual', value: '999' }] }),
    fallback: diagnosis
  });
  assert.equal(response.source, 'fallback');
  assert.equal(response.diagnosis?.runId, result.runId);
  assert.match(response.error ?? '', /Evidence tidak cocok/);
});

test('falls back on timeout and does not expose source secrets in the prompt', async () => {
  const prompt = buildDiagnosisPrompt(request);
  assert.doesNotMatch(prompt, /a{64}/);
  const response = await diagnoseWithModel(request, {
    timeoutMs: 5,
    client: (_value, signal) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      setTimeout(() => resolve(diagnosis), 50);
    }),
    fallback: diagnosis
  });
  assert.equal(response.source, 'fallback');
});

test('returns unavailable without a provider or fallback', async () => {
  const response = await diagnoseWithModel(request);
  assert.equal(response.source, 'unavailable');
  assert.equal(response.diagnosis, null);
});
