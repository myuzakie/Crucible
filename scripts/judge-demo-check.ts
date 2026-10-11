import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { createVerifiedReplay, RunResultSchema, ScenarioSchema } from '../packages/core/src/index.js';
import {
  createRuntimePassport,
  generateSigningKeyPair,
  runCREVerificationWorkflow,
  verifyRuntimePassport
} from '../packages/certificate/src/index.js';

const root = resolve('.');

async function json(path: string): Promise<unknown> {
  return JSON.parse(await readFile(resolve(root, path), 'utf8')) as unknown;
}

async function requireFile(path: string): Promise<void> {
  await readFile(resolve(root, path), 'utf8');
}

async function main() {
  const journeys = [
    ['New User Purchase', 'examples/monad-runtime-demo/scenarios/new-user-purchase.json'],
    ['Settlement', 'examples/monad-runtime-demo/scenarios/settlement.json'],
    ['Auction', 'examples/monad-runtime-demo/scenarios/auction.json']
  ] as const;
  for (const [, path] of journeys) ScenarioSchema.parse(await json(path));

  const before = RunResultSchema.parse(await json('apps/web/public/results/monad-runtime-vulnerable.json'));
  const after = RunResultSchema.parse(await json('apps/web/public/results/monad-runtime-fixed.json'));
  if (before.runtimeVerification?.findings.length !== 3) throw new Error('Judge demo needs three runtime findings.');
  if (before.runtimeVerification.findings.some((finding) => finding.status !== 'failed')) throw new Error('Vulnerable fixture must fail all three runtime rules.');
  if (after.runtimeVerification?.findings.some((finding) => finding.status !== 'passed')) throw new Error('Fixed fixture must pass all three runtime rules.');

  const replay = createVerifiedReplay({ beforeRun: before, afterRun: after, scenarioHash: 'judge-demo-scenario-v1', ruleSetHash: 'judge-demo-rules-v1' });
  const { privateKeyPem } = generateSigningKeyPair();
  const passport = createRuntimePassport({
    runResult: after,
    replay,
    repository: 'github.com/myuzakie/Crucible',
    commit: 'judge-demo-fixture',
    runtimeVersion: 'monad-testnet-10143',
    journeyHashes: { 'new-user-purchase': 'purchase-v1', settlement: 'settlement-v1', auction: 'auction-v1' },
    issuer: 'judge-demo-issuer',
    privateKeyPem,
    passportId: 'judge-demo-passport',
    issuedAt: '2026-10-11T10:00:00.000Z'
  });
  verifyRuntimePassport(passport);
  const intent = runCREVerificationWorkflow({ passport, registryUri: 'https://example.test/passport/judge-demo-passport' });
  if (intent.status !== 'ready-for-attestation') throw new Error('CRE attestation intent was not ready.');

  for (const path of [
    'apps/web/public/results/monad-runtime-vulnerable.json',
    'apps/web/public/results/monad-runtime-fixed.json',
    'fixtures/runtime/monad-runtime-vulnerable.json',
    'fixtures/runtime/monad-runtime-fixed.json',
    'examples/monad-runtime-demo/README.md',
    'JUDGE_README.md',
    'SUBMISSION_FREEZE.md'
  ]) await requireFile(path);

  const serialized = JSON.stringify({ before, after, replay, passport, intent });
  if (/-----BEGIN(?: [A-Z]+)? PRIVATE KEY-----/.test(serialized)) throw new Error('Judge artifacts contain private key material.');

  console.log('Judge journeys: 3');
  console.log('Monad findings: 3 failed before → 3 passed after');
  console.log('Verified replay: PASSED');
  console.log('Runtime Passport: VALID');
  console.log('CRE attestation intent: READY');
  console.log('JUDGE DEMO: PASSED');
}

main().catch((error: unknown) => {
  console.error(`JUDGE DEMO: FAILED\n${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
