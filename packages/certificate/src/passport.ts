import { createHash, createPrivateKey, createPublicKey, sign, verify, type KeyObject } from 'node:crypto';
import { z } from 'zod';

import {
  isRuntimePassportEligible,
  RuntimeReplaySummarySchema,
  RunResultSchema,
  type RunResult,
  type RuntimeReplaySummary
} from '@crucible/core';

function canonicalize(value: unknown): string {
  function sortKeys(input: unknown): unknown {
    if (Array.isArray(input)) return input.map(sortKeys);
    if (input && typeof input === 'object') {
      return Object.fromEntries(Object.keys(input as Record<string, unknown>).sort().map((key) => [key, sortKeys((input as Record<string, unknown>)[key])]));
    }
    return input;
  }
  return JSON.stringify(sortKeys(value));
}

const PassportSignatureSchema = z.object({
  algorithm: z.literal('ed25519'),
  publicKey: z.string().min(1),
  value: z.string().min(1)
}).strict();

export const RuntimePassportSchema = z.object({
  schemaVersion: z.literal('1.0'),
  passportId: z.string().min(1),
  repository: z.string().min(1),
  commit: z.string().min(1),
  runtime: z.literal('monad'),
  runtimeVersion: z.string().min(1),
  verificationProfile: z.literal('monad-core'),
  suiteVersion: z.string().min(1),
  journeyHashes: z.record(z.string(), z.string().min(1)),
  ruleResults: z.array(z.object({
    ruleId: z.string().min(1),
    status: z.literal('passed'),
    evidenceHash: z.string().regex(/^[a-f0-9]{64}$/)
  }).strict()).min(1),
  evidenceHash: z.string().regex(/^[a-f0-9]{64}$/),
  issuer: z.string().min(1),
  issuedAt: z.string().datetime(),
  passportHash: z.string().regex(/^[a-f0-9]{64}$/),
  signature: PassportSignatureSchema,
  onChain: z.object({
    chainId: z.number().int().positive(),
    registryAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    transactionHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
    suiteVersion: z.string().min(1),
    explorerUrl: z.string().url().optional()
  }).optional()
}).strict();

export type RuntimePassport = z.infer<typeof RuntimePassportSchema>;

export type RuntimePassportInput = {
  runResult: RunResult;
  replay: RuntimeReplaySummary;
  repository: string;
  commit: string;
  runtimeVersion: string;
  journeyHashes: Record<string, string>;
  issuer: string;
  privateKeyPem: string;
  passportId?: string;
  issuedAt?: string;
};

function publicKeyPemFromPrivate(privateKeyPem: string): string {
  return createPublicKey(createPrivateKey(privateKeyPem)).export({ type: 'spki', format: 'pem' }).toString();
}

function passportUnsigned(value: Omit<RuntimePassport, 'passportHash' | 'signature' | 'onChain'>): Omit<RuntimePassport, 'passportHash' | 'signature' | 'onChain'> {
  return value;
}

export function runtimePassportHash(value: Omit<RuntimePassport, 'passportHash' | 'signature' | 'onChain'>): string {
  return createHash('sha256').update(canonicalize(passportUnsigned(value))).digest('hex');
}

export function createRuntimePassport(input: RuntimePassportInput): RuntimePassport {
  const runResult = RunResultSchema.parse(input.runResult);
  const replay = RuntimeReplaySummarySchema.parse(input.replay);
  if (!runResult.runtimeVerification || !isRuntimePassportEligible(runResult.runtimeVerification)) {
    throw new Error('Runtime Passport requires all mandatory Monad findings to pass.');
  }
  if (replay.status !== 'runtime-verified' || replay.afterRunId !== runResult.runId) {
    throw new Error('Runtime Passport requires a verified replay for the exact after run.');
  }
  if (replay.profile !== 'monad-core' || replay.suiteVersion !== runResult.runtimeVerification.suiteVersion) {
    throw new Error('Runtime Passport replay and runtime verification do not match.');
  }

  const evidenceHash = createHash('sha256').update(canonicalize(runResult.runtimeVerification)).digest('hex');
  const base = {
    schemaVersion: '1.0' as const,
    passportId: input.passportId ?? `passport-${runResult.runId}`,
    repository: input.repository,
    commit: input.commit,
    runtime: 'monad' as const,
    runtimeVersion: input.runtimeVersion,
    verificationProfile: 'monad-core' as const,
    suiteVersion: runResult.runtimeVerification.suiteVersion,
    journeyHashes: input.journeyHashes,
    ruleResults: runResult.runtimeVerification.findings.map((finding) => ({
      ruleId: finding.ruleId,
      status: 'passed' as const,
      evidenceHash: createHash('sha256').update(canonicalize(finding.evidence)).digest('hex')
    })),
    evidenceHash,
    issuer: input.issuer,
    issuedAt: input.issuedAt ?? new Date().toISOString()
  };
  const passportHash = runtimePassportHash(base);
  const value = sign(null, Buffer.from(passportHash, 'utf8'), createPrivateKey(input.privateKeyPem)).toString('base64');
  return RuntimePassportSchema.parse({
    ...base,
    passportHash,
    signature: { algorithm: 'ed25519', publicKey: publicKeyPemFromPrivate(input.privateKeyPem), value }
  });
}

export function verifyRuntimePassport(value: unknown): RuntimePassport {
  const passport = RuntimePassportSchema.parse(value);
  const unsigned = {
    schemaVersion: passport.schemaVersion,
    passportId: passport.passportId,
    repository: passport.repository,
    commit: passport.commit,
    runtime: passport.runtime,
    runtimeVersion: passport.runtimeVersion,
    verificationProfile: passport.verificationProfile,
    suiteVersion: passport.suiteVersion,
    journeyHashes: passport.journeyHashes,
    ruleResults: passport.ruleResults,
    evidenceHash: passport.evidenceHash,
    issuer: passport.issuer,
    issuedAt: passport.issuedAt
  };
  if (runtimePassportHash(unsigned) !== passport.passportHash) throw new Error('Runtime Passport hash is invalid.');
  const publicKey: KeyObject = createPublicKey(passport.signature.publicKey);
  if (!verify(null, Buffer.from(passport.passportHash, 'utf8'), publicKey, Buffer.from(passport.signature.value, 'base64'))) {
    throw new Error('Runtime Passport signature is invalid.');
  }
  return passport;
}

export function attachPassportAttestation(value: unknown, attestation: RuntimePassport['onChain']): RuntimePassport {
  const passport = verifyRuntimePassport(value);
  return RuntimePassportSchema.parse({ ...passport, onChain: attestation });
}
