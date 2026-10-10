import {
  createOpenAICompatibleClient,
  diagnoseWithModel
} from '../packages/ai/src/service.js';

export const config = { runtime: 'edge' };

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

export default async function diagnose(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return json({ error: 'Request body must be valid JSON.' }, 400);
  }

  const apiKey = process.env.AI_API_KEY;
  const model = process.env.AI_MODEL;
  const endpoint = process.env.AI_API_URL ?? 'https://api.openai.com/v1/chat/completions';
  if (!apiKey || !model) return json({ error: 'AI provider is not configured.' }, 503);

  try {
    const response = await diagnoseWithModel(input, {
      client: createOpenAICompatibleClient({ apiKey, model, endpoint })
    });
    if (!response.diagnosis) return json({ error: response.error ?? 'AI diagnosis unavailable.' }, 503);
    return json({ diagnosis: response.diagnosis, source: response.source });
  } catch (error: unknown) {
    return json({ error: error instanceof Error ? error.message : 'Invalid diagnosis request.' }, 400);
  }
}
