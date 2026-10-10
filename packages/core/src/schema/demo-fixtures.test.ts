import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { RunResultSchema, ScenarioSchema, type ScenarioNode } from './index.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../../../');

function readJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(join(root, relativePath), 'utf8'));
}

function executionOrder(nodes: ScenarioNode[]): string[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const order: string[] = [];

  function visit(id: string): void {
    if (visited.has(id)) return;
    assert.equal(visiting.has(id), false, `cycle at ${id}`);
    visiting.add(id);
    const node = byId.get(id);
    assert.ok(node, `missing node ${id}`);
    for (const dependency of node.after) visit(dependency);
    visiting.delete(id);
    visited.add(id);
    order.push(id);
  }

  for (const node of nodes) visit(node.id);
  return order;
}

for (const name of ['happy-path', 'buggy-mint'] as const) {
  test(`${name} scenario passes schema and has deploy->mint->balance order`, () => {
    const scenario = ScenarioSchema.parse(
      readJson(`examples/monad-erc20-demo/scenarios/${name}.json`)
    );
    assert.deepEqual(executionOrder(scenario.nodes), ['deploy', 'mint', 'balance']);
  });

  test(`${name} result fixture passes RunResult schema`, () => {
    const result = RunResultSchema.parse(readJson(`fixtures/result/${name}.json`));
    assert.equal(result.scenario, name === 'happy-path' ? 'token-happy-path' : 'token-buggy-mint');
  });
}
