import { createServer, type Server } from 'node:http';
import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

import type { ProjectSnapshot } from '@crucible/core';
import { createRunnerApiHandler } from './runner-api-handler.js';
import { createStaticWebHandler } from './static-handler.js';

export type LocalWorkspaceServerOptions = {
  root: string;
  name?: string;
  host?: string;
  port?: number;
  allowedOrigins?: string[];
  staticRoot?: string;
  indexHtml?: string;
};

export type LocalWorkspaceServerHandle = {
  server: Server;
  url: string;
  snapshot: ProjectSnapshot;
  close: () => Promise<void>;
};

export function resolveBundledWebRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', 'web');
}

async function findBundledWebRoot(): Promise<string | undefined> {
  const root = resolveBundledWebRoot();
  try {
    await access(join(root, 'index.html'));
    return root;
  } catch {
    return undefined;
  }
}

export async function startLocalWorkspaceServer(options: LocalWorkspaceServerOptions): Promise<LocalWorkspaceServerHandle> {
  const host = options.host ?? '127.0.0.1';
  if (host !== '127.0.0.1') throw new Error('Local workspace server must bind to 127.0.0.1.');

  const api = await createRunnerApiHandler({
    root: resolve(options.root),
    name: options.name,
    host,
    allowedOrigins: options.allowedOrigins,
    allowSameOrigin: true
  });
  const staticRoot = options.staticRoot ?? await findBundledWebRoot();
  const staticHandler = await createStaticWebHandler({ rootDir: staticRoot, indexHtml: options.indexHtml });
  const server = createServer(async (request, response) => {
    const path = new URL(request.url ?? '/', `http://${host}`).pathname;
    if (path === '/api' || path.startsWith('/api/')) return api.handle(request, response);
    if (await staticHandler(request, response)) return;
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', 'x-content-type-options': 'nosniff' });
    response.end('Not found');
  });
  await new Promise<void>((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 8787, host, () => resolveListen());
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : options.port ?? 8787;
  return {
    server,
    url: `http://${host}:${port}`,
    snapshot: api.snapshot,
    close: () => new Promise<void>((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose()))
  };
}
