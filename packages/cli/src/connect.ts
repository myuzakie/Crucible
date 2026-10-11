import { createServer, type Server } from 'node:http';
import { resolve } from 'node:path';

import { ScenarioSchema, compileJourney, inspectProject, runLocalTest, type ProjectSnapshot } from '@crucible/core';

export type RunnerOptions = { root: string; name?: string; host?: string; port?: number };
export type RunnerHandle = { server: Server; url: string; snapshot: ProjectSnapshot; close: () => Promise<void> };

function json(response: import('node:http').ServerResponse, status: number, body: unknown) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type'
  });
  response.end(JSON.stringify(body));
}

async function body(request: import('node:http').IncomingMessage): Promise<unknown> {
  let raw = '';
  for await (const chunk of request) {
    raw += String(chunk);
    if (raw.length > 1_000_000) throw new Error('Request body is too large.');
  }
  return raw ? JSON.parse(raw) as unknown : {};
}

function foundryOptions(root: string, snapshot: ProjectSnapshot) {
  const foundryRoot = snapshot.detection.toolchain.foundry.configPaths[0]?.split('/').slice(0, -1).join('/') || '.';
  return { foundryRoot: resolve(root, foundryRoot), artifactDir: 'out' };
}

export async function startLocalRunner(options: RunnerOptions): Promise<RunnerHandle> {
  const host = options.host ?? '127.0.0.1';
  const root = resolve(options.root);
  const snapshot = inspectProject(root, options.name);
  const server = createServer(async (request, response) => {
    if (request.method === 'OPTIONS') return json(response, 204, {});
    const path = new URL(request.url ?? '/', `http://${host}`).pathname;
    if (path === '/health') return json(response, 200, { ok: true, service: 'crucible-local-runner', version: '0.1.0' });
    try {
      if (request.method === 'GET' && path === '/project') return json(response, 200, snapshot);
      if (request.method === 'GET' && path === '/contracts') return json(response, 200, { project: snapshot.project, contracts: snapshot.contracts });
      if (request.method !== 'POST') return json(response, 405, { error: 'Use GET for inspection or POST for compile/run.' });
      const input = await body(request);
      if (path === '/journeys/compile') {
        const value = input as Record<string, unknown>;
        const compiled = compileJourney({
          root,
          ...foundryOptions(root, snapshot),
          name: String(value.name ?? 'manual-journey'),
          contract: String(value.contract ?? ''),
          call: String(value.call ?? ''),
          assertion: String(value.assertion ?? ''),
          constructorArgs: Array.isArray(value.constructorArgs) ? value.constructorArgs : [],
          callArgs: Array.isArray(value.callArgs) ? value.callArgs : [],
          assertionArgs: Array.isArray(value.assertionArgs) ? value.assertionArgs : [],
          expected: typeof value.expected === 'string' || typeof value.expected === 'number' || typeof value.expected === 'boolean' ? value.expected : undefined,
          source: value.source && typeof value.source === 'object' ? value.source as never : undefined
        });
        return json(response, 200, { scenario: compiled.scenario, contract: compiled.contract });
      }
      if (path === '/runs') {
        const value = input as Record<string, unknown>;
        const scenario = ScenarioSchema.parse(value.scenario);
        const mode = value.mode === 'testnet' ? 'testnet' : 'local';
        if (mode === 'testnet') return json(response, 501, { status: 'TESTNET_GUARD_REQUIRED', message: 'Testnet execution is exposed through the guarded CLI command in M21-B. Use crucible test --network monad-testnet --dry-run first.' });
        const result = await runLocalTest({ scenario, ...foundryOptions(root, snapshot) });
        return json(response, 200, { mode, result });
      }
      return json(response, 404, { error: 'Not found' });
    } catch (error) {
      return json(response, 400, { error: error instanceof Error ? error.message : String(error) });
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 8787, host, () => resolve());
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : options.port ?? 8787;
  return {
    server,
    url: `http://${host}:${port}`,
    snapshot,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}
