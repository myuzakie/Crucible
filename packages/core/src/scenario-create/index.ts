import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

import type { Abi } from 'viem';

import { detectCapabilities } from '../capabilities/index.js';
import { parseFoundryArtifact } from '../adapters/foundry/index.js';
import { ScenarioSchema, type Scenario } from '../schema/index.js';

type AbiEntry = {
  type?: string;
  name?: string;
  stateMutability?: string;
  inputs?: Array<{ name?: string; type?: string }>;
  outputs?: Array<{ name?: string; type?: string }>;
};

export type ScenarioContract = {
  name: string;
  artifactPath: string;
  abi: Abi;
  functions: ScenarioFunction[];
  constructors: ScenarioConstructor[];
};

export type ScenarioFunction = {
  name: string;
  stateMutability: string;
  inputs: Array<{ name: string; type: string }>;
  outputs: Array<{ name: string; type: string }>;
};

export type ScenarioConstructor = {
  inputs: Array<{ name: string; type: string }>;
};

export type CreateScenarioOptions = {
  root: string;
  foundryRoot: string;
  artifactDir?: string;
  contract: string;
  name: string;
  constructorArgs?: unknown[];
  call: string;
  callArgs?: unknown[];
  assertion: string;
  assertionArgs?: unknown[];
  expected?: string | number | boolean;
};

export type ScenarioCreateResult = {
  scenario: Scenario;
  path: string;
  contract: ScenarioContract;
};

function normalizeEntries(entries: Array<{ name?: string; type?: string }> | undefined) {
  return (entries ?? []).map((entry, index) => ({
    name: entry.name || `arg${index + 1}`,
    type: entry.type || 'unknown'
  }));
}

function artifactPath(root: string, foundryRoot: string, artifactDir: string, contract: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(contract)) throw new Error(`Invalid contract name: ${contract}`);
  return resolve(root, foundryRoot, artifactDir, `${contract}.sol`, `${contract}.json`);
}

function readContractArtifact(path: string, name: string): ScenarioContract {
  if (!existsSync(path)) throw new Error(`Missing artifact for ${name} at ${path}. Run forge build first.`);
  const artifact = parseFoundryArtifact(JSON.parse(readFileSync(path, 'utf8')) as unknown, path, name);
  const entries = artifact.abi as AbiEntry[];
  const functions = entries
    .filter((entry) => entry.type === 'function' && entry.name)
    .map((entry) => ({
      name: entry.name!,
      stateMutability: entry.stateMutability ?? 'nonpayable',
      inputs: normalizeEntries(entry.inputs),
      outputs: normalizeEntries(entry.outputs)
    }));
  const constructors = entries
    .filter((entry) => entry.type === 'constructor')
    .map((entry) => ({ inputs: normalizeEntries(entry.inputs) }));
  return { name, artifactPath: path, abi: artifact.abi, functions, constructors };
}

export function listScenarioContracts(rootInput = process.cwd(), foundryRootInput?: string): ScenarioContract[] {
  const root = resolve(rootInput);
  const report = detectCapabilities(root);
  const foundryRoot = foundryRootInput ?? (report.toolchain.foundry.configPaths[0]?.split('/').slice(0, -1).join('/') || '.');
  const contracts: ScenarioContract[] = [];
  for (const candidate of report.artifacts.candidates) {
    const name = basename(candidate, '.json');
    try {
      const contract = readContractArtifact(resolve(root, candidate), name);
      if (contract.functions.length > 0) contracts.push(contract);
    } catch {
      // Library/test artifacts are intentionally skipped from the wizard list.
    }
  }
  if (!contracts.length && report.artifacts.candidates.length === 0) {
    throw new Error(`No compiled contract artifacts found. Run forge build in ${resolve(root, foundryRoot)} first.`);
  }
  return contracts.sort((a, b) => a.name.localeCompare(b.name));
}

function findFunction(contract: ScenarioContract, name: string, label: string): ScenarioFunction {
  const fn = contract.functions.find((candidate) => candidate.name === name);
  if (!fn) throw new Error(`Function ${name} was not found on ${contract.name} for ${label}.`);
  return fn;
}

export function createScenarioDraft(options: CreateScenarioOptions): ScenarioCreateResult {
  const root = resolve(options.root);
  const contract = readContractArtifact(
    artifactPath(root, options.foundryRoot, options.artifactDir ?? 'out', options.contract),
    options.contract
  );
  const call = findFunction(contract, options.call, 'call');
  const assertion = findFunction(contract, options.assertion, 'assertion');
  if (assertion.stateMutability === 'nonpayable' || assertion.stateMutability === 'payable') {
    throw new Error(`Assertion ${assertion.name} must be a read function (view or pure).`);
  }

  const scenario = ScenarioSchema.parse({
    schemaVersion: '0.1',
    name: options.name,
    network: 'local',
    actors: { deployer: 'fixture:deployer' },
    metadata: { label: `${options.contract} ${options.call} flow`, businessFlow: 'Generated from ABI with developer confirmation' },
    nodes: [
      { id: 'deploy', type: 'deploy', contract: options.contract, args: options.constructorArgs ?? [], after: [] },
      { id: 'call', type: 'call', from: 'deployer', to: 'deploy', fn: call.name, args: options.callArgs ?? [], after: ['deploy'] },
      {
        id: 'assert',
        type: 'assert',
        check: { fn: assertion.name, args: options.assertionArgs ?? [], ...(options.expected !== undefined ? { eq: options.expected } : {}) },
        after: ['call']
      }
    ]
  });
  const path = join(root, 'scenarios', `${options.name}.json`);
  return { scenario, path, contract };
}

export function writeScenario(result: ScenarioCreateResult, overwrite = false): string {
  if (existsSync(result.path) && !overwrite) throw new Error(`Scenario already exists at ${result.path}. Choose another name.`);
  mkdirSync(dirname(result.path), { recursive: true });
  writeFileSync(result.path, `${JSON.stringify(result.scenario, null, 2)}\n`);
  return result.path;
}

export function formatScenarioPreview(result: ScenarioCreateResult): string {
  const { scenario, contract } = result;
  const call = scenario.nodes.find((node) => node.type === 'call');
  const assertion = scenario.nodes.find((node) => node.type === 'assert');
  return [
    'CRUCIBLE SCENARIO PREVIEW',
    '',
    `Contract: ${contract.name}`,
    `Scenario: ${scenario.name}`,
    `Flow: deploy ${contract.name} → call ${call?.type === 'call' ? call.fn : '(none)'} → assert ${assertion?.type === 'assert' ? assertion.check.fn : '(none)'}`,
    `Output: ${result.path}`,
    '',
    'No file has been written yet.'
  ].join('\n');
}
