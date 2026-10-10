#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { runScenario, ScenarioSchema } from '@crucible/core';
import type { Hex } from 'viem';

function usage(): never {
  console.error('Usage: pnpm crucible validate <scenario.json> | run <scenario.json> --network local [--out result.json]');
  process.exit(1);
}

function flag(args: string[], name: string, fallback: string): string {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1] ?? usage();
}

async function loadScenario(path: string) {
  const value = JSON.parse(await readFile(resolve(path), 'utf8'));
  return ScenarioSchema.parse(value);
}

async function loadArtifact(contract: string) {
  const path = resolve(`examples/monad-erc20-demo/out/${contract}.sol/${contract}.json`);
  const artifact = JSON.parse(await readFile(path, 'utf8'));
  return { abi: artifact.abi, bytecode: artifact.bytecode.object as Hex };
}

const [command, scenarioPath, ...args] = process.argv.slice(2);
if (!command || !scenarioPath) usage();

try {
  const scenario = await loadScenario(scenarioPath);
  if (command === 'validate') {
    console.log(`Valid scenario: ${scenario.name} (${scenario.nodes.length} nodes)`);
    process.exit(0);
  }
  if (command !== 'run') usage();

  const network = flag(args, '--network', 'local');
  if (network !== 'local') throw new Error('Only --network local is available in P2.3.');
  const rpcUrl = flag(args, '--rpc', process.env.LOCAL_RPC_URL ?? 'http://127.0.0.1:8545');
  const artifacts = Object.fromEntries(
    await Promise.all(
      [...new Set(scenario.nodes.filter((node) => node.type === 'deploy').map((node) => node.contract))]
        .map(async (contract) => [contract, await loadArtifact(contract)] as const)
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
