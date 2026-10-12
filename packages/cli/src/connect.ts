import { createServer, type Server } from 'node:http';
import { resolve } from 'node:path';

import type { ProjectSnapshot } from '@crucible/core';
import { createRunnerApiHandler } from './runner-api-handler.js';

export type RunnerOptions = { root: string; name?: string; host?: string; port?: number; allowedOrigins?: string[] };
export type RunnerHandle = { server: Server; url: string; snapshot: ProjectSnapshot; close: () => Promise<void> };

export async function startLocalRunner(options: RunnerOptions): Promise<RunnerHandle> {
  const host = options.host ?? '127.0.0.1';
  const api = await createRunnerApiHandler({
    root: resolve(options.root),
    name: options.name,
    host,
    allowedOrigins: options.allowedOrigins
  });
  const server = createServer(api.handle);
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
