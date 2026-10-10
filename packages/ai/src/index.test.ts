import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { DiagnosisRequestSchema, DiagnosisSchema, validateDiagnosisForResult } from './index.js';

const root = join(import.meta.dirname, '../../../');
const result = JSON.parse(readFileSync(join(root, 'fixtures/result/buggy-mint.json'), 'utf8'));
const scenario = JSON.parse(readFileSync(join(root, 'examples/monad-erc20-demo/scenarios/buggy-mint.json'), 'utf8'));
const diagnosis = JSON.parse(readFileSync(join(root, 'fixtures/diagnosis/buggy-mint.json'), 'utf8'));

test('accepts the deterministic buggy-mint diagnosis fixture', () => {
  const parsed = validateDiagnosisForResult(diagnosis, result);
  assert.equal(parsed.runId, result.runId);
});

test('rejects fabricated evidence and missing evidence', () => {
  assert.throws(() => validateDiagnosisForResult({ ...diagnosis, evidence: [] }, result), /Too small/);
  assert.throws(() => validateDiagnosisForResult({
    ...diagnosis,
    evidence: [{ nodeId: 'balance', field: 'error.actual', value: '999' }]
  }, result), /Evidence tidak cocok/);
  assert.throws(() => validateDiagnosisForResult({
    ...diagnosis,
    evidence: [{ nodeId: 'unknown', field: 'status', value: 'failed' }]
  }, result), /Evidence tidak tersedia/);
});

test('validates diagnosis request inputs', () => {
  const request = DiagnosisRequestSchema.parse({ runResult: result, scenario, source: 'contract source', abi: [] });
  assert.equal(request.runResult.runId, result.runId);
  assert.equal(DiagnosisSchema.parse(diagnosis).status, 'ready');
});
