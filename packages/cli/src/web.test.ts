import assert from 'node:assert/strict';
import test from 'node:test';

import { startWebViewer } from './web.js';

test('local web viewer serves a RunResult without RPC or private keys', async () => {
  const viewer = await startWebViewer({
    resultPath: 'fixtures/result/erc721-happy.json',
    scenario: {
      schemaVersion: '0.1',
      name: 'collectible-happy-path',
      network: 'local',
      actors: { deployer: 'fixture:deployer' },
      metadata: { label: 'Mint and verify ownership' },
      nodes: [
        { id: 'deploy', type: 'deploy', contract: 'Collectible', args: [], after: [] },
        { id: 'mint', type: 'call', from: 'deployer', to: 'deploy', fn: 'mint', args: [], after: ['deploy'] },
        { id: 'owner', type: 'assert', check: { fn: 'ownerOf', args: [] }, after: ['mint'] }
      ]
    },
    port: 0
  });
  try {
    const html = await (await fetch(viewer.url)).text();
    const result = await (await fetch(`${viewer.url}/result.json`)).json() as { status: string };
    assert.match(html, /Crucible Local Result/);
    assert.match(html, /collectible-happy-path/);
    assert.match(html, /Mint and verify ownership/);
    assert.match(html, /Business scenario/);
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
