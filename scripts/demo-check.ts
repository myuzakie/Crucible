import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { validateDiagnosisForResult } from '../packages/ai/src/index.js';
import { verifyCertificate } from '../packages/certificate/src/index.js';
import { RunResultSchema, ScenarioSchema } from '../packages/core/src/schema/index.js';

const root = resolve('.');

async function json(path: string) {
  return JSON.parse(await readFile(resolve(root, path), 'utf8')) as unknown;
}

async function main() {
  const happyScenario = ScenarioSchema.parse(await json('examples/monad-erc20-demo/scenarios/happy-path.json'));
  const buggyScenario = ScenarioSchema.parse(await json('examples/monad-erc20-demo/scenarios/buggy-mint.json'));
  const happyResult = RunResultSchema.parse(await json('fixtures/result/happy-path.json'));
  const buggyResult = RunResultSchema.parse(await json('fixtures/result/buggy-mint.json'));
  const publicBefore = RunResultSchema.parse(await json('apps/web/public/results/monad-runtime-vulnerable.json'));
  const publicAfter = RunResultSchema.parse(await json('apps/web/public/results/monad-runtime-fixed.json'));
  const diagnosis = validateDiagnosisForResult(await json('fixtures/diagnosis/buggy-mint.json'), buggyResult);
  const certificate = verifyCertificate(await json('fixtures/certificate/buggy-mint.json'));

  if (happyScenario.name !== happyResult.scenario || buggyScenario.name !== buggyResult.scenario) {
    throw new Error('Scenario and RunResult fixture names do not match.');
  }
  if (certificate.runResult.runId !== buggyResult.runId || diagnosis.runId !== buggyResult.runId) {
    throw new Error('Diagnosis, certificate, and RunResult fixture IDs do not match.');
  }
  if (publicBefore.verifiedReplay?.status !== 'runtime-verified' || publicBefore.verifiedReplay.afterRunId !== publicAfter.runId || publicAfter.verifiedReplay?.status !== 'runtime-verified') {
    throw new Error('Public demo fixtures do not expose a verified before/after replay.');
  }

  for (const path of [
    'apps/web/public/results/happy-path.json',
    'apps/web/public/results/erc721-happy.json',
    'apps/web/public/results/buggy-mint.json',
    'apps/web/public/results/skipped.json',
    'apps/web/public/results/malformed.json',
    'apps/web/public/diagnosis/buggy-mint.json',
    'apps/web/public/certificate/buggy-mint.json'
  ]) await readFile(resolve(root, path));

  try {
    RunResultSchema.parse(await json('apps/web/public/results/malformed.json'));
    throw new Error('Malformed Web fixture was unexpectedly accepted.');
  } catch (error) {
    if (error instanceof Error && error.message === 'Malformed Web fixture was unexpectedly accepted.') throw error;
  }

  const serialized = JSON.stringify({ happyScenario, buggyScenario, happyResult, buggyResult, diagnosis, certificate });
  if (/BEGIN (?:OPENSSH )?PRIVATE KEY/.test(serialized)) throw new Error('Demo fixtures contain private key material.');

  console.log('Offline fixtures: PASSED');
  console.log('Diagnosis evidence: VALID');
  console.log('Certificate fixture: VALID');
  console.log('OFFLINE DEMO: PASSED');
}

main().catch((error: unknown) => {
  console.error(`OFFLINE DEMO: FAILED\n${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
