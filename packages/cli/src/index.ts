#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { createCertificate, verifyCertificate } from '@crucible/certificate';
import { DiagnosisSchema } from '@crucible/ai';
import { runScenario, ScenarioSchema, RunResultSchema } from '@crucible/core';
import type { Hex } from 'viem';

function usage(): never {
  console.error(
    [
      'Usage:',
      '  pnpm crucible validate <scenario.json>',
      '  pnpm crucible run <scenario.json> --network local [--rpc url] [--out result.json]',
      '  pnpm crucible certify <scenario.json> <result.json> <diagnosis.json> [--key key.pem] [--out certificate.json]',
      '  pnpm crucible verify <certificate.json>'
    ].join('\n')
  );
  process.exit(1);
}

function flag(args: string[], name: string, fallback?: string): string {
  const index = args.indexOf(name);
  if (index === -1) {
    if (fallback !== undefined) return fallback;
    usage();
  }
  return args[index + 1] ?? usage();
}

async function loadJson(path: string) {
  return JSON.parse(await readFile(resolve(path), 'utf8'));
}

async function loadScenario(path: string) {
  return ScenarioSchema.parse(await loadJson(path));
}

async function loadArtifact(contract: string) {
  const path = resolve(`examples/monad-erc20-demo/out/${contract}.sol/${contract}.json`);
  const artifact = JSON.parse(await readFile(path, 'utf8'));
  return { abi: artifact.abi, bytecode: artifact.bytecode.object as Hex };
}

const [command, ...rest] = process.argv.slice(2);
if (!command) usage();

try {
  if (command === 'verify') {
    const certificatePath = rest[0] ?? usage();
    const report = verifyCertificate(await loadJson(certificatePath));
    console.log(`VALID: ${report.reportId} (${report.contentHash.slice(0, 12)}…)`);
    process.exit(0);
  }

  if (command === 'certify') {
    const [scenarioPath, resultPath, diagnosisPath, ...args] = rest;
    if (!scenarioPath || !resultPath || !diagnosisPath) usage();
    const keyPath = flag(args, '--key', process.env.CERTIFICATE_PRIVATE_KEY_PATH ?? '');
    if (!keyPath) throw new Error('Missing --key <private.pem> or CERTIFICATE_PRIVATE_KEY_PATH');
    const privateKeyPem = await readFile(resolve(keyPath), 'utf8');
    const report = createCertificate({
      scenario: await loadScenario(scenarioPath),
      runResult: RunResultSchema.parse(await loadJson(resultPath)),
      diagnosis: DiagnosisSchema.parse(await loadJson(diagnosisPath)),
      privateKeyPem
    });
    const outputPath = flag(args, '--out', 'certificate.json');
    await writeFile(resolve(outputPath), `${JSON.stringify(report, null, 2)}\n`);
    console.log(`SIGNED: ${report.reportId} — ${outputPath}`);
    process.exit(0);
  }

  const scenarioPath = rest[0] ?? usage();
  const args = rest.slice(1);
  const scenario = await loadScenario(scenarioPath);

  if (command === 'validate') {
    console.log(`Valid scenario: ${scenario.name} (${scenario.nodes.length} nodes)`);
    process.exit(0);
  }
  if (command !== 'run') usage();

  const network = flag(args, '--network', 'local');
  if (network !== 'local') throw new Error('Only --network local is available.');
  const rpcUrl = flag(args, '--rpc', process.env.LOCAL_RPC_URL ?? 'http://127.0.0.1:8545');
  const artifacts = Object.fromEntries(
    await Promise.all(
      [...new Set(scenario.nodes.filter((node) => node.type === 'deploy').map((node) => node.contract))].map(
        async (contract) => [contract, await loadArtifact(contract)] as const
      )
    )
  );
  const accounts = Object.fromEntries(
    Object.entries(scenario.actors).map(([name, reference]) => {
      const envName = reference.replace(/^env:/, '');
      const key = process.env[envName];
      if (!key) throw new Error(`Missing environment variable ${envName}`);
      return [name, key as Hex];
    })
  );
  const result = await runScenario({ scenario, artifacts, accounts, rpcUrl });
  const outputPath = flag(args, '--out', 'result.json');
  await writeFile(resolve(outputPath), `${JSON.stringify(result, null, 2)}\n`);
  console.log(`${result.status.toUpperCase()}: ${result.scenario} — ${outputPath}`);
  process.exit(result.status === 'passed' ? 0 : 1);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
