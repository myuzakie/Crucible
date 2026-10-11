import { createServer, type Server } from 'node:http';

import { inspectProject, type ProjectSnapshot } from '@crucible/core';

export type RunnerOptions = { root: string; name?: string; host?: string; port?: number };
export type RunnerHandle = { server: Server; url: string; snapshot: ProjectSnapshot; close: () => Promise<void> };

function json(response: import('node:http').ServerResponse, status: number, body: unknown) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, OPTIONS',
    'access-control-allow-headers': 'content-type'
  });
  response.end(JSON.stringify(body));
}

export async function startLocalRunner(options: RunnerOptions): Promise<RunnerHandle> {
  const host = options.host ?? '127.0.0.1';
  const snapshot = inspectProject(options.root, options.name);
  const server = createServer((request, response) => {
    if (request.method === 'OPTIONS') return json(response, 204, {});
    const path = new URL(request.url ?? '/', `http://${host}`).pathname;
    if (request.method !== 'GET') return json(response, 405, { error: 'The local runner is read-only in M21-A.' });
    if (path === '/health') return json(response, 200, { ok: true, service: 'crucible-local-runner', version: '0.1.0' });
    if (path === '/project') return json(response, 200, snapshot);
    if (path === '/contracts') return json(response, 200, { project: snapshot.project, contracts: snapshot.contracts });
    return json(response, 404, { error: 'Not found' });
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
