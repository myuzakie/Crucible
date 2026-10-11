import { z } from 'zod';

import { verifyRuntimePassport, type RuntimePassport } from './passport.js';

export const CREAttestationIntentSchema = z.object({
  workflow: z.literal('crucible-runtime-passport-verification'),
  status: z.enum(['ready-for-attestation', 'rejected']),
  passportHash: z.string().regex(/^[a-f0-9]{64}$/),
  suiteVersion: z.string().min(1),
  checks: z.object({
    signature: z.boolean(),
    profile: z.boolean(),
    mandatoryRules: z.boolean(),
    evidenceHash: z.boolean()
  }).strict(),
  registry: z.object({
    functionName: z.literal('registerPassport'),
    args: z.tuple([z.string(), z.string(), z.string()])
  }).strict()
}).strict();

export type CREAttestationIntent = z.infer<typeof CREAttestationIntentSchema>;

export type CREWorkflowInput = {
  passport: unknown;
  registryUri: string;
};

export function runCREVerificationWorkflow(input: CREWorkflowInput): CREAttestationIntent {
  try {
    const passport = verifyRuntimePassport(input.passport);
    const result = {
      workflow: 'crucible-runtime-passport-verification' as const,
      status: 'ready-for-attestation' as const,
      passportHash: passport.passportHash,
      suiteVersion: passport.suiteVersion,
      checks: { signature: true, profile: passport.verificationProfile === 'monad-core', mandatoryRules: passport.ruleResults.every((rule) => rule.status === 'passed'), evidenceHash: /^[a-f0-9]{64}$/.test(passport.evidenceHash) },
      registry: { functionName: 'registerPassport' as const, args: [`0x${passport.passportHash}`, input.registryUri, passport.suiteVersion] as [string, string, string] }
    };
    return CREAttestationIntentSchema.parse(result);
  } catch {
    return CREAttestationIntentSchema.parse({
      workflow: 'crucible-runtime-passport-verification', status: 'rejected', passportHash: '0'.repeat(64), suiteVersion: 'unknown',
      checks: { signature: false, profile: false, mandatoryRules: false, evidenceHash: false },
      registry: { functionName: 'registerPassport', args: ['0x' + '0'.repeat(64), input.registryUri, 'unknown'] }
    });
  }
}

export type { RuntimePassport };
