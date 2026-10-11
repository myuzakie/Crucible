import { RunResultSchema, type RunResult, type RuntimeFinding } from '@crucible/core/schema';

export type Status = 'passed' | 'failed' | 'skipped';
export type { RunResult };
export type NodeResult = RunResult['nodes'][number];

export function validateResult(value: unknown): RunResult {
  try {
    return RunResultSchema.parse(value);
  } catch {
    throw new Error('RunResult tidak valid.');
  }
}

export function replaySequence(nodes: NodeResult[]): string[] {
  const sequence: string[] = [];
  for (const node of nodes) {
    sequence.push(node.id);
    if (node.status === 'failed') break;
  }
  return sequence;
}

export function runtimeFindings(result: RunResult): RuntimeFinding[] {
  return result.runtimeVerification?.findings ?? [];
}

export function runtimeJourneys(result: RunResult): string[] {
  return [...new Set(runtimeFindings(result).map((finding) => finding.journeyId))];
}

export function findingsForJourney(result: RunResult, journeyId: string): RuntimeFinding[] {
  return runtimeFindings(result).filter((finding) => finding.journeyId === journeyId);
}
