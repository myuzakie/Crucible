import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { AdapterError, createFoundryAdapter, parseFoundryArtifact } from '../index.js';

test('parseFoundryArtifact requires abi and bytecode', () => {
  assert.throws(
    () => parseFoundryArtifact({ abi: [] }, 'x.json', 'Token'),
    (error: unknown) => error instanceof AdapterError && error.status === 'BUILD_FAILED'
  );
  const artifact = parseFoundryArtifact({ abi: [], bytecode: { object: '0x1234' } }, 'x.json', 'Token');
  assert.equal(artifact.bytecode, '0x1234');
});

test('Foundry adapter loads explicit contract path and rejects missing/invalid artifacts', () => {
  const root = mkdtempSync(join(tmpdir(), 'crucible-foundry-'));
  try {
    writeFileSync(join(root, 'foundry.toml'), '[profile.default]\nout = "out"\n');
    mkdirSync(join(root, 'out', 'Token.sol'), { recursive: true });
    writeFileSync(
      join(root, 'out', 'Token.sol', 'Token.json'),
      JSON.stringify({ abi: [{ type: 'constructor' }], bytecode: { object: '0xabcd' } })
    );

    const adapter = createFoundryAdapter({ foundryRoot: root });
    assert.equal(adapter.kind, 'foundry');
    assert.match(adapter.resolveArtifactPath('Token'), /out\/Token\.sol\/Token\.json$/);
    assert.equal(adapter.loadArtifact('Token').bytecode, '0xabcd');

    assert.throws(
      () => adapter.loadArtifact('Missing'),
      (error: unknown) => error instanceof AdapterError && error.status === 'MISSING_ARTIFACT'
    );

    writeFileSync(join(root, 'out', 'Token.sol', 'Broken.json'), '{}');
    mkdirSync(join(root, 'out', 'Broken.sol'), { recursive: true });
    writeFileSync(join(root, 'out', 'Broken.sol', 'Broken.json'), '{}');
    assert.throws(
      () => adapter.loadArtifact('Broken'),
      (error: unknown) => error instanceof AdapterError && error.status === 'BUILD_FAILED'
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Foundry adapter refuses missing foundry.toml without guessing Hardhat', () => {
  const root = mkdtempSync(join(tmpdir(), 'crucible-no-foundry-'));
  try {
    assert.throws(
      () => createFoundryAdapter({ foundryRoot: root }),
      (error: unknown) => error instanceof AdapterError && error.status === 'UNSUPPORTED_TOOLCHAIN'
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('loads Collectible from monad-erc721-demo when artifacts exist', () => {
  const foundryRoot = join(process.cwd(), 'examples/monad-erc721-demo');
  try {
    const adapter = createFoundryAdapter({ foundryRoot });
    const artifact = adapter.loadArtifact('Collectible');
    assert.ok(Array.isArray(artifact.abi));
    assert.match(artifact.bytecode, /^0x/);
  } catch (error) {
    if (error instanceof AdapterError && error.status === 'MISSING_ARTIFACT') {
      assert.ok(error.message.includes('forge build'));
      return;
    }
    throw error;
  }
});
