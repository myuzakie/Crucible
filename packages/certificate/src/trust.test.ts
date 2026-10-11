import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { RunResultSchema } from '@crucible/core/schema';
import { createVerifiedReplay } from '@crucible/core';
import { createRuntimePassport, generateSigningKeyPair, runCREVerificationWorkflow } from './index.js';

const root = process.cwd();
const read = (name: string) => RunResultSchema.parse(JSON.parse(readFileSync(join(root, 'apps/web/public/results', name), 'utf8')));

test('CRE workflow verifies a Passport and prepares registry attestation', () => {
  const before = read('monad-runtime-vulnerable.json');
  const after = read('monad-runtime-fixed.json');
  const { privateKeyPem } = generateSigningKeyPair();
  const passport = createRuntimePassport({
    runResult: after,
    replay: createVerifiedReplay({ beforeRun: before, afterRun: after, scenarioHash: 's', ruleSetHash: 'r' }),
    repository: 'repo', commit: 'commit', runtimeVersion: 'monad-10143', journeyHashes: { auction: 'j1' }, issuer: 'issuer', privateKeyPem
  });
  const intent = runCREVerificationWorkflow({ passport, registryUri: 'https://example.test/passport' });
  assert.equal(intent.status, 'ready-for-attestation');
  assert.equal(intent.registry.functionName, 'registerPassport');
  assert.equal(intent.registry.args[2], '1.0.0');
});

test('CRE workflow rejects malformed Passport input', () => {
  assert.equal(runCREVerificationWorkflow({ passport: {}, registryUri: 'https://example.test/passport' }).status, 'rejected');
});
