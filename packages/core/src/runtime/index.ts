import { z } from 'zod';

export const RuntimeRuleIdSchema = z
  .string()
  .regex(/^[A-Z0-9]+-[A-Z0-9]+-\d{3}$/, 'Invalid runtime rule id.');

export const RuntimeRuleSchema = z
  .object({
    ruleId: RuntimeRuleIdSchema,
    title: z.string().min(1),
    description: z.string().min(1),
    severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
    category: z.string().min(1),
    runtime: z.string().min(1),
    docsReference: z.string().min(1),
    suiteVersion: z.string().min(1)
  })
  .strict();

export const RuntimeEvidenceSchema = z
  .object({
    type: z.enum([
      'block',
      'blockDistance',
      'transaction',
      'receipt',
      'assurance',
      'assertion',
      'custom'
    ]),
    source: z.enum(['runtime', 'receipt', 'rpc', 'scenario', 'fixture', 'testnet']),
    observed: z.unknown(),
    expected: z.unknown().optional(),
    blockNumber: z.number().int().nonnegative().optional(),
    blockTimestamp: z.number().int().nonnegative().optional(),
    txHash: z.string().min(1).optional(),
    receiptStatus: z.enum(['success', 'reverted', 'pending']).optional(),
    assuranceLevel: z.enum(['proposed', 'voted', 'finalized', 'verified']).optional(),
    metadata: z.record(z.string(), z.unknown()).optional()
  })
  .strict();

export const RuntimeFindingSchema = z
  .object({
    findingId: z.string().min(1),
    ruleId: RuntimeRuleIdSchema,
    journeyId: z.string().min(1),
    nodeId: z.string().min(1),
    status: z.enum(['passed', 'failed', 'skipped']),
    userImpact: z.string().min(1).optional(),
    summary: z.string().min(1),
    expected: z.unknown(),
    observed: z.unknown(),
    evidence: z.array(RuntimeEvidenceSchema).min(1),
    remediationClass: z.string().min(1).optional()
  })
  .superRefine((finding, ctx) => {
    if (finding.status === 'failed' && !finding.userImpact) {
      ctx.addIssue({
        code: 'custom',
        path: ['userImpact'],
        message: 'A failed runtime finding must describe user impact.'
      });
    }
  });

export const VerificationProfileSchema = z.enum(['generic-evm', 'monad-core']);

export const RuntimeVerificationSchema = z
  .object({
    profile: VerificationProfileSchema,
    suiteVersion: z.string().min(1),
    findings: z.array(RuntimeFindingSchema)
  })
  .strict();

export const RuntimeReplaySummarySchema = z
  .object({
    status: z.literal('runtime-verified'),
    beforeRunId: z.string().min(1),
    afterRunId: z.string().min(1),
    scenarioHash: z.string().min(1),
    suiteVersion: z.string().min(1),
    profile: VerificationProfileSchema,
    ruleSetHash: z.string().min(1),
    diffSummary: z.object({
      recoveredJourneys: z.array(z.string().min(1)),
      failedBefore: z.number().int().nonnegative(),
      passedAfter: z.number().int().nonnegative()
    }).strict()
  })
  .strict();

export type RuntimeRuleId = z.infer<typeof RuntimeRuleIdSchema>;
export type RuntimeRule = z.infer<typeof RuntimeRuleSchema>;
export type RuntimeEvidence = z.infer<typeof RuntimeEvidenceSchema>;
export type RuntimeFinding = z.infer<typeof RuntimeFindingSchema>;
export type VerificationProfile = z.infer<typeof VerificationProfileSchema>;
export type RuntimeVerification = z.infer<typeof RuntimeVerificationSchema>;
export type RuntimeReplaySummary = z.infer<typeof RuntimeReplaySummarySchema>;

export const MONAD_CORE_RULE_IDS = [
  'MND-TIME-001',
  'MND-FINALITY-001',
  'MND-FUND-001'
] as const satisfies readonly RuntimeRuleId[];

export const VERIFICATION_PROFILES = {
  'generic-evm': {
    id: 'generic-evm',
    name: 'Generic EVM',
    description: 'Build and execute the scenario against a fresh local Anvil chain.',
    mandatoryRuleIds: [] as readonly RuntimeRuleId[]
  },
  'monad-core': {
    id: 'monad-core',
    name: 'Monad Core Runtime',
    description: 'Evaluate the scenario against the mandatory Monad runtime rule suite.',
    mandatoryRuleIds: MONAD_CORE_RULE_IDS
  }
} as const satisfies Record<VerificationProfile, {
  id: VerificationProfile;
  name: string;
  description: string;
  mandatoryRuleIds: readonly RuntimeRuleId[];
}>;

export function isRuntimePassportEligible(input: unknown): boolean {
  const verification = RuntimeVerificationSchema.safeParse(input);
  if (!verification.success || verification.data.profile !== 'monad-core') return false;

  return MONAD_CORE_RULE_IDS.every((ruleId) =>
    verification.data.findings.some(
      (finding) => finding.ruleId === ruleId && finding.status === 'passed' && finding.evidence.length > 0
    )
  );
}
