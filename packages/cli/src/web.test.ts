import assert from 'node:assert/strict';
import test from 'node:test';

import { startWebViewer } from './web.js';

test('local web viewer serves a RunResult without RPC or private keys', async () => {
  const viewer = await startWebViewer({ resultPath: 'fixtures/result/erc721-happy.json', port: 0 });
  try {
    const html = await (await fetch(viewer.url)).text();
    const result = await (await fetch(`${viewer.url}/result.json`)).json() as { status: string };
    assert.match(html, /Crucible Local Result/);
    assert.match(html, /collectible-happy-path/);
    assert.equal(result.status, 'passed');
    assert.doesNotMatch(html, /private.?key|rpcUrl/i);
  } finally {
    await viewer.close();
  }
});

test('local web viewer rejects malformed result files', async () => {
  await assert.rejects(
    () => startWebViewer({ resultPath: 'fixtures/result/malformed.json', port: 0 }),
    /Cannot load RunResult/
  );
});
