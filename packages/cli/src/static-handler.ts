import { readFile, realpath, stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, relative, resolve, sep } from 'node:path';

export type StaticWebHandlerOptions = {
  /** Production Web assets are supplied by a later packaging task. */
  rootDir?: string;
  indexHtml?: string;
};

export type StaticWebHandler = (request: IncomingMessage, response: ServerResponse) => Promise<boolean>;

const defaultIndex = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Crucible Local Workspace</title></head>
<body><main><h1>Crucible Local Workspace</h1><p>Local Web assets are ready to be served from this workspace.</p></main></body></html>`;

function isWithin(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path === '' || (!path.startsWith(`..${sep}`) && path !== '..' && !path.split(sep).includes('..'));
}

function contentType(path: string): string {
  switch (extname(path).toLowerCase()) {
    case '.css': return 'text/css; charset=utf-8';
    case '.html': return 'text/html; charset=utf-8';
    case '.js': return 'text/javascript; charset=utf-8';
    case '.json': return 'application/json; charset=utf-8';
    case '.svg': return 'image/svg+xml';
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.webp': return 'image/webp';
    case '.woff': return 'font/woff';
    case '.woff2': return 'font/woff2';
    default: return 'application/octet-stream';
  }
}

function notFound(response: ServerResponse): true {
  response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', 'x-content-type-options': 'nosniff' });
  response.end('Not found');
  return true;
}

export async function createStaticWebHandler(options: StaticWebHandlerOptions = {}): Promise<StaticWebHandler> {
  const rootDir = options.rootDir ? await realpath(resolve(options.rootDir)) : undefined;
  const indexHtml = options.indexHtml ?? defaultIndex;

  return async (request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') return false;
    let pathname: string;
    try {
      pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname);
    } catch {
      return notFound(response);
    }
    if (pathname.includes('\0') || pathname.includes('\\')) return notFound(response);

    const isIndex = pathname === '/' || pathname === '/index.html';
    const isAsset = pathname.startsWith('/assets/');
    if (!isIndex && !isAsset) return false;
    if (!rootDir) {
      if (!isIndex) return notFound(response);
      const body = Buffer.from(indexHtml, 'utf8');
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': String(body.byteLength), 'x-content-type-options': 'nosniff' });
      if (request.method === 'GET') response.end(body);
      else response.end();
      return true;
    }

    const relativePath = isIndex ? 'index.html' : pathname.slice(1);
    const candidate = resolve(rootDir, relativePath);
    if (!isWithin(rootDir, candidate)) return notFound(response);
    let safeCandidate: string;
    try {
      safeCandidate = await realpath(candidate);
      if (!isWithin(rootDir, safeCandidate)) return notFound(response);
      if (!(await stat(safeCandidate)).isFile()) return notFound(response);
    } catch {
      return notFound(response);
    }
    const body = await readFile(safeCandidate);
    response.writeHead(200, { 'content-type': contentType(safeCandidate), 'content-length': String(body.byteLength), 'x-content-type-options': 'nosniff' });
    if (request.method === 'GET') response.end(body);
    else response.end();
    return true;
  };
}
