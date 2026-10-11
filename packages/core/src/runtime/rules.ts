import {
  RuntimeFindingSchema,
  RuntimeRuleSchema,
  type RuntimeEvidence,
  type RuntimeFinding,
  type RuntimeRule,
  type RuntimeVerification
} from './index.js';

export const MONAD_RUNTIME_RULES = [
  {
    ruleId: 'MND-TIME-001',
    title: 'Block Timestamp Progression Assumption',
    description: 'The journey must not assume that every newly produced block has a new timestamp.',
    severity: 'high',
    category: 'timing',
    runtime: 'monad',
    docsReference: 'https://docs.monad.xyz/architecture/consensus',
    suiteVersion: '1.0.0'
  },
  {
    ruleId: 'MND-FINALITY-001',
    title: 'Insufficient Assurance Before Irreversible Action',
    description: 'An irreversible action must wait for the assurance level required by the journey.',
    severity: 'critical',
    category: 'finality',
    runtime: 'monad',
    docsReference: 'https://docs.monad.xyz/architecture/consensus',
    suiteVersion: '1.0.0'
  },
  {
    ruleId: 'MND-FUND-001',
    title: 'Newly Funded Zero-Balance Account',
    description: 'A newly funded account must respect the required block distance before its first action.',
    severity: 'critical',
    category: 'funding',
    runtime: 'monad',
    docsReference: 'https://docs.monad.xyz/architecture/consensus',
    suiteVersion: '1.0.0'
  }
] as const satisfies readonly RuntimeRule[];

for (const rule of MONAD_RUNTIME_RULES) RuntimeRuleSchema.parse(rule);

const ruleById = new Map(MONAD_RUNTIME_RULES.map((rule) => [rule.ruleId, rule]));
const assuranceRank = { proposed: 0, voted: 1, finalized: 2, verified: 3 } as const;

type EvidenceInput = {
  journeyId: string;
  nodeId: string;
  time?: {
    previousBlock: number;
    previousTimestamp: number;
    currentBlock: number;
    currentTimestamp: number;
  };
  finality?: {
    observedAssurance: keyof typeof assuranceRank;
    requiredAssurance: keyof typeof assuranceRank;
    actionTriggered: boolean;
  };
  funding?: {
    fundingBlock: number;
    attemptBlock: number;
    requiredSafeDistance: number;
    firstAttempt: 'failed' | 'unsafe' | 'passed';
    retryBlock?: number;
    retryAttempt?: 'failed' | 'unsafe' | 'passed';
  };
};

function baseFinding(
  ruleId: RuntimeFinding['ruleId'],
  input: EvidenceInput,
  status: RuntimeFinding['status'],
  summary: string,
  expected: unknown,
  observed: unknown,
  evidence: RuntimeEvidence[],
  userImpact?: string
): RuntimeFinding {
  return RuntimeFindingSchema.parse({
    findingId: `${ruleId}:${input.journeyId}:${input.nodeId}`,
    ruleId,
    journeyId: input.journeyId,
    nodeId: input.nodeId,
    status,
    userImpact,
    summary,
    expected,
    observed,
    evidence,
    remediationClass: ruleId === 'MND-TIME-001' ? 'avoid-block-timestamp-equality' : undefined
  });
}

export function evaluateMonadRuntime(input: EvidenceInput): RuntimeVerification {
  const findings: RuntimeFinding[] = [];
  const timeRule = ruleById.get('MND-TIME-001');
  const finalityRule = ruleById.get('MND-FINALITY-001');
  const fundingRule = ruleById.get('MND-FUND-001');
  if (!timeRule || !finalityRule || !fundingRule) throw new Error('Monad runtime rule catalog is incomplete.');

  if (input.time) {
    const failed = input.time.currentTimestamp <= input.time.previousTimestamp;
    findings.push(baseFinding(
      timeRule.ruleId,
      input,
      failed ? 'failed' : 'passed',
      failed ? 'Adjacent blocks share a timestamp.' : 'Timestamp progression was not assumed between adjacent blocks.',
      'current timestamp is greater than the previous timestamp',
      input.time,
      [
        { type: 'block', source: 'fixture', observed: { number: input.time.previousBlock, timestamp: input.time.previousTimestamp }, blockNumber: input.time.previousBlock, blockTimestamp: input.time.previousTimestamp },
        { type: 'block', source: 'fixture', observed: { number: input.time.currentBlock, timestamp: input.time.currentTimestamp }, blockNumber: input.time.currentBlock, blockTimestamp: input.time.currentTimestamp }
      ],
      failed ? 'Time-sensitive ordering may treat multiple blocks as the same moment.' : undefined
    ));
  }

  if (input.finality) {
    const { observedAssurance, requiredAssurance, actionTriggered } = input.finality;
    const failed = actionTriggered && assuranceRank[observedAssurance] < assuranceRank[requiredAssurance];
    findings.push(baseFinding(
      finalityRule.ruleId,
      input,
      failed ? 'failed' : 'passed',
      failed ? 'An irreversible action was triggered before the required assurance level.' : 'The irreversible action waited for the required assurance level.',
      requiredAssurance,
      observedAssurance,
      [{ type: 'assurance', source: 'fixture', observed: observedAssurance, expected: requiredAssurance, assuranceLevel: observedAssurance }],
      failed ? 'A product, payment, or settlement may be released while the transaction is still processing.' : undefined
    ));
  }

  if (input.funding) {
    const { fundingBlock, attemptBlock, requiredSafeDistance, firstAttempt, retryBlock, retryAttempt } = input.funding;
    const firstDistance = attemptBlock - fundingBlock;
    const firstFailed = firstDistance < requiredSafeDistance && firstAttempt !== 'passed';
    const retrySafe = retryBlock === undefined || retryAttempt === undefined
      ? undefined
      : retryBlock - fundingBlock >= requiredSafeDistance && retryAttempt === 'passed';
    const failed = firstFailed || retrySafe === false;
    findings.push(baseFinding(
      fundingRule.ruleId,
      input,
      failed ? 'failed' : 'passed',
      failed ? 'The first funded-account action did not respect the safe block distance.' : 'The funded-account action respected the safe block distance.',
      { requiredSafeDistance, firstAttempt: 'passed after the safe distance' },
      { firstDistance, firstAttempt, retryBlock, retryAttempt },
      [
        { type: 'blockDistance', source: 'fixture', observed: firstDistance, expected: requiredSafeDistance, blockNumber: attemptBlock, metadata: { fundingBlock, attemptBlock, requiredSafeDistance, firstAttempt } },
        ...(retryBlock === undefined || retryAttempt === undefined ? [] : [{ type: 'blockDistance' as const, source: 'fixture' as const, observed: retryBlock - fundingBlock, expected: requiredSafeDistance, blockNumber: retryBlock, metadata: { retryAttempt } }])
      ],
      failed ? 'A first-time user may fail during the first purchase immediately after funding.' : undefined
    ));
  }

  return { profile: 'monad-core', suiteVersion: timeRule.suiteVersion, findings };
}

export type { EvidenceInput as MonadRuntimeEvidenceInput };
