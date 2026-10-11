import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { resolve } from 'node:path';

import { RunResultSchema, type RunResult } from '@crucible/core';

export type WebViewerOptions = {
  resultPath: string;
  host?: string;
  port?: number;
};

export type WebViewerHandle = {
  server: Server;
  url: string;
  result: RunResult;
  close: () => Promise<void>;
};

export async function loadViewerResult(path: string): Promise<RunResult> {
  const absolute = resolve(path);
  try {
    const raw = JSON.parse(await readFile(absolute, 'utf8')) as unknown;
    return RunResultSchema.parse(raw);
  } catch (error) {
    throw new Error(
      `Cannot load RunResult at ${absolute}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
}

export function createViewerHtml(result: RunResult): string {
  const safeJson = JSON.stringify(result).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Crucible — ${escapeHtml(result.scenario)}</title>
<style>
:root{font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#172033;background:#f6f8fb}body{max-width:980px;margin:0 auto;padding:32px}header,.card{background:white;border:1px solid #dfe5ee;border-radius:14px;padding:22px;box-shadow:0 4px 18px #1720330d}header{display:flex;justify-content:space-between;gap:20px;align-items:center;margin-bottom:18px}h1{margin:0 0 6px;font-size:24px}h2{font-size:16px;margin:0 0 14px}.muted{color:#657188}.status{font-weight:700;padding:8px 12px;border-radius:999px;background:${result.status === 'passed' ? '#d9f8e5' : '#ffe0e0'};color:${result.status === 'passed' ? '#087443' : '#a31919'}}.summary{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px}.pill{background:#eef2f7;border-radius:999px;padding:7px 11px;font-size:13px}.nodes{display:grid;gap:10px}.node{border:1px solid #e1e6ef;border-radius:10px;padding:14px;display:flex;justify-content:space-between;gap:20px}.node.failed{border-color:#ef9b9b;background:#fff7f7}.node.skipped{opacity:.65}.ok{color:#087443}.bad{color:#a31919}.error{margin-top:8px;color:#7c2020;font-size:13px}code{font-family:ui-monospace,SFMono-Regular,monospace}
</style></head><body>
<header><div><h1>Crucible Local Result</h1><div class="muted">Scenario: <code>${escapeHtml(result.scenario)}</code></div></div><div class="status">${result.status.toUpperCase()}</div></header>
<section class="summary"><div class="pill">Network: ${escapeHtml(result.network.name)}</div><div class="pill">Score: ${result.score}%</div><div class="pill">Passed: ${result.summary.passed}</div><div class="pill">Failed: ${result.summary.failed}</div><div class="pill">Skipped: ${result.summary.skipped}</div></section>
<section class="card"><h2>Execution nodes</h2><div id="nodes" class="nodes"></div></section>
<script>const result=${safeJson};const target=document.querySelector('#nodes');for(const node of result.nodes){const item=document.createElement('article');item.className='node '+node.status;const error=node.error?'<div class="error">'+[node.error.message,node.error.expected!==undefined?'Expected: '+node.error.expected:'',node.error.actual!==undefined?'Actual: '+node.error.actual:''].filter(Boolean).join(' · ')+'</div>':'';item.innerHTML='<div><strong>'+node.id+'</strong>'+error+'</div><strong class="'+(node.status==='passed'?'ok':node.status==='failed'?'bad':'muted')+'">'+node.status+'</strong>';target.appendChild(item)}</script>
</body></html>`;
}

export async function startWebViewer(options: WebViewerOptions): Promise<WebViewerHandle> {
  const result = await loadViewerResult(options.resultPath);
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 5173;
  const html = createViewerHtml(result);
  const server = createServer((request, response) => {
    if (request.url === '/' || request.url === '/index.html') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(html);
      return;
    }
    if (request.url === '/result.json') {
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify(result, null, 2));
      return;
    }
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  });
  await new Promise<void>((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolveListen());
  });
  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;
  const url = `http://${host}:${actualPort}`;
  return {
    server,
    url,
    result,
    close: () => new Promise<void>((resolveClose, rejectClose) => server.close((error) => (error ? rejectClose(error) : resolveClose())))
  };
}
