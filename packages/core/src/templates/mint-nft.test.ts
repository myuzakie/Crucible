import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { ScenarioSchema } from '../schema/index.js';
import { expandMintNftTemplate, resolveScenarioDocument } from './index.js';

test('expands mint NFT template into deploy → mint → ownerOf', () => {
  const scenario = expandMintNftTemplate({
    businessFlow: 'mint NFT',
    contract: 'Collectible',
    actors: {
      deployer: 'env:DEPLOYER_PRIVATE_KEY',
      alice: 'env:ALICE_PRIVATE_KEY'
    },
    minter: 'deployer',
    recipient: 'alice',
    tokenId: '0'
  });

  assert.equal(scenario.metadata?.businessFlow, 'mint NFT');
  assert.equal(scenario.metadata?.label, 'Mint NFT');
  assert.deepEqual(
    scenario.nodes.map((node) => node.id),
    ['deploy', 'mint', 'owner']
  );
  assert.equal(scenario.nodes[0]?.type, 'deploy');
  assert.equal(scenario.nodes[1]?.type, 'call');
  assert.equal(scenario.nodes[2]?.type, 'assert');
  if (scenario.nodes[2]?.type === 'assert') {
    assert.equal(scenario.nodes[2].check.fn, 'ownerOf');
    assert.equal(scenario.nodes[2].check.eq, 'alice');
  }
  assert.equal(ScenarioSchema.safeParse(scenario).success, true);
});

test('rejects unknown actors with readable errors', () => {
  assert.throws(
    () =>
      expandMintNftTemplate({
        businessFlow: 'mint NFT',
        contract: 'Collectible',
        actors: { deployer: 'env:DEPLOYER_PRIVATE_KEY' },
        minter: 'deployer',
        recipient: 'alice'
      }),
    /Unknown recipient actor: alice/
  );
});

test('resolveScenarioDocument accepts fixture template and expanded scenarios', () => {
  const template = JSON.parse(readFileSync(join(process.cwd(), 'fixtures/scenarios/mint-nft.json'), 'utf8'));
  const expanded = resolveScenarioDocument(template);
  assert.equal(expanded.metadata?.businessFlow, 'mint NFT');

  const already = resolveScenarioDocument({
    name: 'collectible-happy-path',
    network: 'local',
    actors: { deployer: 'env:DEPLOYER_PRIVATE_KEY', alice: 'env:ALICE_PRIVATE_KEY' },
    metadata: { businessFlow: 'mint NFT', label: 'Mint NFT' },
    nodes: [
      { id: 'deploy', type: 'deploy', contract: 'Collectible' },
      { id: 'mint', type: 'call', from: 'deployer', to: 'deploy', fn: 'mint', args: ['alice'], after: ['deploy'] },
      { id: 'owner', type: 'assert', check: { fn: 'ownerOf', args: ['0'], eq: 'alice' }, after: ['mint'] }
    ]
  });
  assert.equal(already.nodes.length, 3);
});
