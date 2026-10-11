import { RuntimeFindingSchema, RuntimeVerificationSchema, type RuntimeVerification } from './index.js';
import type { RunResult } from '../schema/index.js';

/** Converts deterministic assertion execution into a generic, evidence-bound verification layer. */
export function executionVerification(result: RunResult): RuntimeVerification {
  const findings = result.nodes.map((node) => RuntimeFindingSchema.parse({
      findingId: `EVM-ASSERT-001:${result.scenario}:${node.id}`,
      ruleId: 'EVM-ASSERT-001',
      journeyId: result.scenario,
      nodeId: node.id,
      status: node.status === 'skipped' ? 'skipped' : node.status,
      ...(node.status === 'failed' ? { userImpact: 'The selected user journey did not produce the expected contract state.' } : {}),
      summary: node.status === 'passed' ? 'The assertion matched the expected contract state.' : 'The assertion did not match the expected contract state.',
      expected: node.error?.expected ?? 'assertion passed',
      observed: node.error?.actual ?? node.status,
      evidence: [{ type: 'assertion', source: 'scenario', observed: node.status, expected: node.error?.expected, metadata: { runId: result.runId } }]
    }));
  return RuntimeVerificationSchema.parse({ profile: 'generic-evm', suiteVersion: '1.0.0', findings });
}

export function withExecutionVerification(result: RunResult): RunResult {
  return { ...result, runtimeVerification: executionVerification(result) };
}
