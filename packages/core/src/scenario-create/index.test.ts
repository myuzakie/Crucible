import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { coerceAbiValue, createScenarioDraft, formatScenarioPreview, listScenarioContracts, writeScenario } from './index.js';

function artifactRoot() {
  const root = mkdtempSync(join(tmpdir(), 'crucible-scenario-create-'));
  mkdirSync(join(root, 'out', 'YourContract.sol'), { recursive: true });
  writeFileSync(join(root, 'foundry.toml'), '[profile.default]\nout = "out"\n');
  writeFileSync(
    join(root, 'out', 'YourContract.sol', 'YourContract.json'),
    JSON.stringify({
      abi: [
        { type: 'constructor', inputs: [] },
        { type: 'function', name: 'setGreeting', stateMutability: 'nonpayable', inputs: [{ name: 'value', type: 'string' }], outputs: [] },
        { type: 'function', name: 'greeting', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'string' }] }
      ],
      bytecode: { object: '0x6000' }
    })
  );
  return root;
}

test('creates a reviewable scenario from an ABI and does not write during draft', () => {
  const root = artifactRoot();
  try {
    const result = createScenarioDraft({
      root,
      foundryRoot: '.',
      contract: 'YourContract',
      name: 'set-greeting',
      call: 'setGreeting',
      callArgs: ['Hello Crucible'],
      assertion: 'greeting',
      expected: 'Hello Crucible'
    });
    assert.equal(existsSync(result.path), false);
    assert.match(formatScenarioPreview(result), /No file has been written/);
    const path = writeScenario(result);
    assert.equal(path, join(root, 'scenarios', 'set-greeting.json'));
    assert.equal(existsSync(path), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('refuses to overwrite an existing scenario without explicit permission', () => {
  const root = artifactRoot();
  try {
    const result = createScenarioDraft({ root, foundryRoot: '.', contract: 'YourContract', name: 'same', call: 'setGreeting', assertion: 'greeting' });
    writeScenario(result);
    assert.throws(() => writeScenario(result), /already exists/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('prefers application contracts and hides deployment/test/library artifacts', () => {
  const root = artifactRoot();
  try {
    for (const name of ['DeployYourContract', 'YourContractTest', 'StdAssertions', 'stdError', 'CommonBase']) {
      mkdirSync(join(root, 'out', `${name}.sol`), { recursive: true });
      writeFileSync(join(root, 'out', `${name}.sol`, `${name}.json`), JSON.stringify({
        abi: [{ type: 'function', name: 'helper', stateMutability: 'view', inputs: [], outputs: [] }],
        bytecode: { object: '0x6000' }
      }));
    }
    mkdirSync(join(root, 'out', 'Base.sol'), { recursive: true });
    writeFileSync(join(root, 'out', 'Base.sol', 'CommonBase.json'), JSON.stringify({
      abi: [{ type: 'function', name: 'helper', stateMutability: 'view', inputs: [], outputs: [] }],
      bytecode: { object: '0x6000' }
    }));
    const contracts = listScenarioContracts(root, '.');
    assert.deepEqual(contracts.map((contract) => contract.name), ['YourContract']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('coerces common ABI scalar answers without JSON syntax', () => {
  assert.equal(coerceAbiValue('yes', 'bool'), true);
  assert.equal(coerceAbiValue('42', 'uint256'), 42);
  assert.equal(coerceAbiValue('Hello Crucible', 'string'), 'Hello Crucible');
});
