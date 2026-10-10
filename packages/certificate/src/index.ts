import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomUUID,
  sign,
  verify,
  type KeyObject
} from 'node:crypto';

import { DiagnosisSchema, type Diagnosis } from '@crucible/ai';
import { RunResultSchema, ScenarioSchema, type RunResult, type Scenario } from '@crucible/core/schema';
import { z } from 'zod';

export * from './registry.js';

export const CertificateReportSchema = z.object({
  schemaVersion: z.string().default('0.1'),
  reportId: z.string().min(1),
  createdAt: z.string().datetime(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  scenario: ScenarioSchema,
  runResult: RunResultSchema,
  diagnosis: DiagnosisSchema,
  signature: z.object({
    algorithm: z.literal('ed25519'),
    publicKey: z.string().min(1),
    value: z.string().min(1)
  }),
  onChain: z
    .object({
      chainId: z.number().int().positive(),
      registryAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
      transactionHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
      explorerUrl: z.string().url().optional()
    })
    .optional()
});

export type CertificateReport = z.infer<typeof CertificateReportSchema>;

export type CertificateInput = {
  scenario: Scenario;
  runResult: RunResult;
  diagnosis: Diagnosis;
  privateKeyPem: string;
  reportId?: string;
  createdAt?: string;
};

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])])
    );
  }
  return value;
}

export function canonicalize(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

export function contentHash(
  scenario: Scenario,
  runResult: RunResult,
  diagnosis: Diagnosis
): string {
  return createHash('sha256')
    .update(canonicalize({ diagnosis, runResult, scenario }))
    .digest('hex');
}

export function generateSigningKeyPair(): { privateKeyPem: string; publicKeyPem: string } {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return {
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString()
  };
}

function publicKeyPemFromPrivate(privateKeyPem: string): string {
  const privateKey = createPrivateKey(privateKeyPem);
  return createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }).toString();
}

function assertNoPrivateKeyMaterial(report: CertificateReport): void {
  const serialized = JSON.stringify(report);
  if (serialized.includes('BEGIN PRIVATE KEY') || serialized.includes('BEGIN OPENSSH PRIVATE KEY')) {
    throw new Error('Certificate report must not contain a private key.');
  }
  for (const reference of Object.values(report.scenario.actors)) {
    if (/^0x[a-fA-F0-9]{64}$/.test(reference)) {
      throw new Error('Certificate report must not embed raw private keys in actors.');
    }
  }
}

export function createCertificate(input: CertificateInput): CertificateReport {
  const scenario = ScenarioSchema.parse(input.scenario);
  const runResult = RunResultSchema.parse(input.runResult);
  const diagnosis = DiagnosisSchema.parse(input.diagnosis);
  if (diagnosis.runId !== runResult.runId) {
    throw new Error('Diagnosis runId tidak cocok dengan RunResult.');
  }

  const hash = contentHash(scenario, runResult, diagnosis);
  const privateKey = createPrivateKey(input.privateKeyPem);
  const publicKeyPem = publicKeyPemFromPrivate(input.privateKeyPem);
  const value = sign(null, Buffer.from(hash, 'utf8'), privateKey).toString('base64');

  const report = CertificateReportSchema.parse({
    schemaVersion: '0.1',
    reportId: input.reportId ?? randomUUID(),
    createdAt: input.createdAt ?? new Date().toISOString(),
    contentHash: hash,
    scenario,
    runResult,
    diagnosis,
    signature: {
      algorithm: 'ed25519',
      publicKey: publicKeyPem,
      value
    }
  });

  assertNoPrivateKeyMaterial(report);
  return report;
}

export function verifyCertificate(value: unknown): CertificateReport {
  const report = CertificateReportSchema.parse(value);
  assertNoPrivateKeyMaterial(report);

  const expectedHash = contentHash(report.scenario, report.runResult, report.diagnosis);
  if (expectedHash !== report.contentHash) {
    throw new Error('Certificate contentHash tidak cocok dengan isi report.');
  }

  const publicKey: KeyObject = createPublicKey(report.signature.publicKey);
  const ok = verify(
    null,
    Buffer.from(report.contentHash, 'utf8'),
    publicKey,
    Buffer.from(report.signature.value, 'base64')
  );
  if (!ok) throw new Error('Certificate signature tidak valid.');
  return report;
}
