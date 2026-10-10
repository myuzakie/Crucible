import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { DiagnosisSchema } from '@crucible/ai';
import { RunResultSchema, ScenarioSchema } from '@crucible/core/schema';

import {
  contentHash,
  createCertificate,
  generateSigningKeyPair,
  verifyCertificate
} from './index.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../../');

function readJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(join(root, relativePath), 'utf8'));
}

const scenario = ScenarioSchema.parse(readJson('examples/monad-erc20-demo/scenarios/buggy-mint.json'));
const runResult = RunResultSchema.parse(readJson('fixtures/result/buggy-mint.json'));
const diagnosis = DiagnosisSchema.parse(readJson('fixtures/diagnosis/buggy-mint.json'));

test('creates a verifiable certificate without private key material', () => {
  const { privateKeyPem } = generateSigningKeyPair();
  const report = createCertificate({
    scenario,
    runResult,
    diagnosis,
    privateKeyPem,
    reportId: 'cert-buggy-001',
    createdAt: '2026-10-11T00:00:03.000Z'
  });

  const verified = verifyCertificate(report);
  assert.equal(verified.reportId, 'cert-buggy-001');
  assert.equal(verified.contentHash, contentHash(scenario, runResult, diagnosis));
  assert.equal(JSON.stringify(report).includes('BEGIN PRIVATE KEY'), false);
  assert.equal(JSON.stringify(report).includes(privateKeyPem), false);
});

test('certificate hash and verification fail when result changes', () => {
  const { privateKeyPem } = generateSigningKeyPair();
  const report = createCertificate({ scenario, runResult, diagnosis, privateKeyPem });

  const tampered = {
    ...report,
    runResult: {
      ...report.runResult,
      score: report.runResult.score === 66 ? 67 : 66
    }
  };

  assert.notEqual(
    contentHash(scenario, tampered.runResult, diagnosis),
    report.contentHash
  );
  assert.throws(() => verifyCertificate(tampered), /contentHash/);
});

test('committed offline fixture verifies', () => {
  const report = verifyCertificate(readJson('fixtures/certificate/buggy-mint.json'));
  assert.equal(report.reportId, 'cert-buggy-001');
  assert.equal(report.runResult.scenario, 'token-buggy-mint');
});

test('rejects invalid signatures', () => {
  const first = generateSigningKeyPair();
  const second = generateSigningKeyPair();
  const report = createCertificate({
    scenario,
    runResult,
    diagnosis,
    privateKeyPem: first.privateKeyPem
  });

  assert.throws(
    () =>
      verifyCertificate({
        ...report,
        signature: { ...report.signature, publicKey: second.publicKeyPem }
      }),
    /signature/
  );
});
