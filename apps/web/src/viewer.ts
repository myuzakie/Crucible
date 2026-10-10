import type { RunResult } from '@crucible/core/schema';

export type Status = 'passed' | 'failed' | 'skipped';
export type { RunResult };
export type NodeResult = RunResult['nodes'][number];

export function validateResult(value: unknown): RunResult {
  if (!value || typeof value !== 'object') throw new Error('RunResult bukan object.');
  const result = value as Partial<RunResult>;
  if (!result.scenario || !result.status || !Array.isArray(result.nodes)) {
    throw new Error('RunResult tidak memiliki scenario, status, atau nodes.');
  }
  if (!result.network || typeof result.network.chainId !== 'number') {
    throw new Error('RunResult network atau chainId tidak valid.');
  }
  return value as RunResult;
}

export function replaySequence(nodes: NodeResult[]): string[] {
  const sequence: string[] = [];
  for (const node of nodes) {
    sequence.push(node.id);
    if (node.status === 'failed') break;
  }
  return sequence;
}
