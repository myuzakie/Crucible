import { RunResultSchema, type RunResult } from '../schema/index.js';
import {
  RuntimeReplaySummarySchema,
  type RuntimeReplaySummary,
  type RuntimeVerification
} from './index.js';

export type VerifiedReplayInput = {
  beforeRun: RunResult;
  afterRun: RunResult;
  scenarioHash: string;
  ruleSetHash: string;
};

function ruleSet(verification: RuntimeVerification): string[] {
  return verification.findings.map((finding) => finding.ruleId).sort();
}

export function createVerifiedReplay(input: VerifiedReplayInput): RuntimeReplaySummary {
  const beforeRun = RunResultSchema.parse(input.beforeRun);
  const afterRun = RunResultSchema.parse(input.afterRun);
  const beforeVerification = beforeRun.runtimeVerification;
  const afterVerification = afterRun.runtimeVerification;

  if (beforeRun.status !== 'failed' || afterRun.status !== 'passed') {
    throw new Error('Verified replay requires a failed before run and a passed after run.');
  }
  if (!beforeVerification || !afterVerification) {
    throw new Error('Verified replay requires runtime verification on both runs.');
  }
  if (beforeVerification.profile !== afterVerification.profile) {
    throw new Error('Verified replay profile mismatch.');
  }
  if (beforeVerification.suiteVersion !== afterVerification.suiteVersion) {
    throw new Error('Verified replay suite version mismatch.');
  }
  if (ruleSet(beforeVerification).join('|') !== ruleSet(afterVerification).join('|')) {
    throw new Error('Verified replay rule set mismatch.');
  }
  if (!afterVerification.findings.every((finding) => finding.status === 'passed')) {
    throw new Error('Verified replay after run still contains a failed runtime finding.');
  }

  const recoveredJourneys = beforeVerification.findings
    .filter((finding) => finding.status === 'failed')
    .map((finding) => finding.journeyId)
    .filter((journeyId, index, journeys) => journeys.indexOf(journeyId) === index);

  return RuntimeReplaySummarySchema.parse({
    status: 'runtime-verified',
    beforeRunId: beforeRun.runId,
    afterRunId: afterRun.runId,
    scenarioHash: input.scenarioHash,
    suiteVersion: afterVerification.suiteVersion,
    profile: afterVerification.profile,
    ruleSetHash: input.ruleSetHash,
    diffSummary: {
      recoveredJourneys,
      failedBefore: beforeVerification.findings.filter((finding) => finding.status === 'failed').length,
      passedAfter: afterVerification.findings.filter((finding) => finding.status === 'passed').length
    }
  });
}
