import assert from 'node:assert/strict';
import test from 'node:test';

import { createRunnerApiClient } from './runner-api.js';

function fakeFetch(calls: string[]) {
  return async (input: RequestInfo | URL): Promise<Response> => {
    calls.push(String(input));
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
}

test('normal local Web requests use relative canonical /api paths', async () => {
  const calls: string[] = [];
  const client = createRunnerApiClient({ fetchImpl: fakeFetch(calls) });

  await client.requestJson('/health');
  await client.requestJson('/project');
  await client.requestJson('/contracts');
  await client.requestJson('/journeys/compile', { method: 'POST' });
  await client.requestJson('/runs', { method: 'POST' });
  await client.requestJson('/replay', { method: 'POST' });
  await client.requestJson('/passport', { method: 'POST' });
  await client.requestJson('/passport/publish', { method: 'POST' });

  assert.deepEqual(calls, [
    '/api/health',
    '/api/project',
    '/api/contracts',
    '/api/journeys/compile',
    '/api/runs',
    '/api/replay',
    '/api/passport',
    '/api/passport/publish'
  ]);
  assert.equal(client.usesLegacyBaseUrl, false);
});

test('explicit runner URL remains a legacy compatibility override', async () => {
  const calls: string[] = [];
  const client = createRunnerApiClient({ baseUrl: 'http://127.0.0.1:8787/', fetchImpl: fakeFetch(calls) });

  await client.requestJson('/health');
  assert.deepEqual(calls, ['http://127.0.0.1:8787/health']);
  assert.equal(client.usesLegacyBaseUrl, true);
});

test('API errors preserve the existing response message behavior', async () => {
  const client = createRunnerApiClient({
    fetchImpl: async () => new Response(JSON.stringify({ error: 'Not found' }), { status: 404 })
  });

  await assert.rejects(() => client.requestJson('/health'), /Not found/);
});
