import { z } from 'zod';

import { RunResultSchema, ScenarioSchema, type RunResult } from '@crucible/core/schema';

const EvidenceFieldSchema = z.enum([
  'status',
  'error.kind',
  'error.message',
  'error.expected',
  'error.actual',
  'txHash'
]);

export const DiagnosisEvidenceSchema = z.object({
  nodeId: z.string().min(1),
  field: EvidenceFieldSchema,
  value: z.string().min(1)
});

export const DiagnosisSchema = z.object({
  schemaVersion: z.string().default('0.1'),
  runId: z.string().min(1),
  status: z.literal('ready'),
  rootCause: z.string().min(1),
  evidence: z.array(DiagnosisEvidenceSchema).min(1),
  suggestedFix: z.string().min(1),
  confidence: z.number().min(0).max(1),
  followUpTests: z.array(z.string().min(1)).min(1)
});

export const DiagnosisRequestSchema = z.object({
  runResult: RunResultSchema,
  scenario: ScenarioSchema,
  source: z.string().optional(),
  abi: z.unknown().optional()
});

export type Diagnosis = z.infer<typeof DiagnosisSchema>;
export type DiagnosisEvidence = z.infer<typeof DiagnosisEvidenceSchema>;
export type DiagnosisRequest = z.infer<typeof DiagnosisRequestSchema>;

function evidenceValue(result: RunResult, nodeId: string, field: DiagnosisEvidence['field']): string | undefined {
  const node = result.nodes.find((item) => item.id === nodeId);
  if (!node) return undefined;
  if (field === 'status') return node.status;
  if (field === 'txHash') return node.txHash;
  if (field === 'error.kind') return node.error?.kind;
  if (field === 'error.message') return node.error?.message;
  if (field === 'error.expected') return node.error?.expected === undefined ? undefined : String(node.error.expected);
  return node.error?.actual === undefined ? undefined : String(node.error.actual);
}

export function validateDiagnosisForResult(value: unknown, result: RunResult): Diagnosis {
  const diagnosis = DiagnosisSchema.parse(value);
  if (diagnosis.runId !== result.runId) throw new Error('Diagnosis runId tidak cocok dengan RunResult.');
  for (const evidence of diagnosis.evidence) {
    const actual = evidenceValue(result, evidence.nodeId, evidence.field);
    if (actual === undefined) throw new Error(`Evidence tidak tersedia: ${evidence.nodeId}.${evidence.field}`);
    if (actual !== evidence.value) throw new Error(`Evidence tidak cocok: ${evidence.nodeId}.${evidence.field}`);
  }
  return diagnosis;
}

export { EvidenceFieldSchema };
export {
  buildDiagnosisPrompt,
  createOpenAICompatibleClient,
  diagnoseWithModel,
  type DiagnosisModelClient,
  type DiagnosisServiceOptions,
  type DiagnosisServiceResult,
  type DiagnosisSource,
  type OpenAICompatibleClientOptions
} from './service.js';
