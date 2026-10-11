import { z } from 'zod';

import { RuntimeFindingSchema, ScenarioSchema, type RuntimeFinding, type Scenario } from '@crucible/core/schema';

export const RuntimeRemediationRequestSchema = z.object({
  finding: RuntimeFindingSchema,
  scenario: ScenarioSchema,
  sourceSlice: z.string().max(20_000).optional(),
  documentation: z.string().max(20_000).optional()
});

export const RuntimeRemediationSchema = z.object({
  status: z.literal('ai-suggested'),
  findingId: z.string().min(1),
  ruleId: z.string().min(1),
  explanation: z.string().min(1),
  rootCause: z.string().min(1),
  remediation: z.string().min(1),
  suggestedDiff: z.string().min(1),
  followUpTests: z.array(z.string().min(1)).min(1),
  confidence: z.number().min(0).max(1)
}).strict();

export type RuntimeRemediationRequest = z.infer<typeof RuntimeRemediationRequestSchema>;
export type RuntimeRemediation = z.infer<typeof RuntimeRemediationSchema>;

export function validateRuntimeRemediation(value: unknown, finding: RuntimeFinding): RuntimeRemediation {
  const remediation = RuntimeRemediationSchema.parse(value);
  if (remediation.findingId !== finding.findingId) throw new Error('Remediation findingId does not match runtime finding.');
  if (remediation.ruleId !== finding.ruleId) throw new Error('Remediation ruleId does not match runtime finding.');
  return remediation;
}

export function buildRuntimeRemediationPrompt(request: RuntimeRemediationRequest): string {
  return [
    'Suggest a remediation for this validated Monad runtime finding.',
    'Return JSON only with status ai-suggested, findingId, ruleId, explanation, rootCause, remediation, suggestedDiff, followUpTests, confidence.',
    'Use only the supplied finding evidence. Do not invent block numbers, transaction hashes, or verification status.',
    'Do not claim Runtime Verified; only deterministic replay can do that.',
    JSON.stringify(request)
  ].join('\n');
}

export type RuntimeRemediationClient = (prompt: string, signal: AbortSignal) => Promise<unknown>;

export type RuntimeRemediationServiceOptions = {
  client?: RuntimeRemediationClient;
  fallback?: unknown;
  timeoutMs?: number;
};

export type RuntimeRemediationServiceResult = {
  remediation: RuntimeRemediation | null;
  source: 'model' | 'fallback' | 'unavailable';
  error?: string;
};

export async function remediateRuntimeFinding(
  input: unknown,
  options: RuntimeRemediationServiceOptions = {}
): Promise<RuntimeRemediationServiceResult> {
  const request = RuntimeRemediationRequestSchema.parse(input);
  const fallback = options.fallback === undefined
    ? undefined
    : validateRuntimeRemediation(options.fallback, request.finding);
  if (!options.client) {
    return fallback
      ? { remediation: fallback, source: 'fallback', error: 'AI provider is not configured.' }
      : { remediation: null, source: 'unavailable', error: 'AI provider is not configured.' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 8_000);
  try {
    const value = await options.client(buildRuntimeRemediationPrompt(request), controller.signal);
    return { remediation: validateRuntimeRemediation(value, request.finding), source: 'model' };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'AI remediation unavailable.';
    return fallback
      ? { remediation: fallback, source: 'fallback', error: message }
      : { remediation: null, source: 'unavailable', error: message };
  } finally {
    clearTimeout(timer);
  }
}

export type { RuntimeFinding, Scenario };
