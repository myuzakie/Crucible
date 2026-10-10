import {
  DiagnosisRequestSchema,
  validateDiagnosisForResult,
  type Diagnosis,
  type DiagnosisRequest
} from './index.js';

export type DiagnosisModelClient = (prompt: string, signal: AbortSignal) => Promise<unknown>;

export type DiagnosisSource = 'model' | 'fallback' | 'unavailable';

export interface DiagnosisServiceResult {
  diagnosis: Diagnosis | null;
  source: DiagnosisSource;
  error?: string;
}

export interface DiagnosisServiceOptions {
  client?: DiagnosisModelClient;
  fallback?: unknown;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 8_000;
const MAX_SOURCE_LENGTH = 20_000;

function redactSource(value: string): string {
  return value
    .replace(/(private[\s_-]*key|api[\s_-]*key|secret|mnemonic)(\s*[:=]\s*)[^\s,;"']+/gi, '$1$2[REDACTED]')
    .replace(/\b0x[a-f\d]{64}\b/gi, '[REDACTED_HEX_SECRET]')
    .slice(0, MAX_SOURCE_LENGTH);
}

export function buildDiagnosisPrompt(request: DiagnosisRequest): string {
  const payload = {
    scenario: request.scenario,
    runResult: request.runResult,
    source: request.source ? redactSource(request.source) : undefined,
    abi: request.abi
  };

  return [
    'Diagnose this smart-contract execution result.',
    'Return one JSON object only with: runId, status, rootCause, evidence, suggestedFix, confidence, followUpTests.',
    'Evidence must quote only values that exist exactly in runResult.nodes.',
    'Do not invent node IDs, transaction hashes, expected values, or actual values.',
    JSON.stringify(payload)
  ].join('\n');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'AI diagnosis unavailable.';
}

async function withTimeout<T>(work: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await work(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

export async function diagnoseWithModel(input: unknown, options: DiagnosisServiceOptions = {}): Promise<DiagnosisServiceResult> {
  const request = DiagnosisRequestSchema.parse(input);
  const fallback = options.fallback === undefined
    ? undefined
    : validateDiagnosisForResult(options.fallback, request.runResult);

  if (!options.client) {
    return fallback
      ? { diagnosis: fallback, source: 'fallback', error: 'AI provider is not configured.' }
      : { diagnosis: null, source: 'unavailable', error: 'AI provider is not configured.' };
  }

  try {
    const value = await withTimeout(
      (signal) => options.client?.(buildDiagnosisPrompt(request), signal) ?? Promise.reject(new Error('AI client missing.')),
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    );
    return { diagnosis: validateDiagnosisForResult(value, request.runResult), source: 'model' };
  } catch (error: unknown) {
    return fallback
      ? { diagnosis: fallback, source: 'fallback', error: errorMessage(error) }
      : { diagnosis: null, source: 'unavailable', error: errorMessage(error) };
  }
}

export interface OpenAICompatibleClientOptions {
  apiKey: string;
  endpoint: string;
  model: string;
  fetchImpl?: typeof fetch;
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
}

function parseModelContent(content: string | Array<{ type?: string; text?: string }>): unknown {
  const text = Array.isArray(content)
    ? content.map((part) => part.text ?? '').join('')
    : content;
  const json = text.trim().replace(/^```json\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(json);
}

export function createOpenAICompatibleClient(options: OpenAICompatibleClientOptions): DiagnosisModelClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  return async (prompt, signal) => {
    const response = await fetchImpl(options.endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${options.apiKey}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: options.model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You are a careful smart-contract debugging assistant.' },
          { role: 'user', content: prompt }
        ]
      }),
      signal
    });
    if (!response.ok) throw new Error(`AI provider returned HTTP ${response.status}.`);
    const payload = await response.json() as ChatCompletionResponse;
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error('AI provider returned no diagnosis content.');
    return parseModelContent(content);
  };
}
