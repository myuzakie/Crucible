import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';

import { detectCapabilities, type CapabilityReport } from '../capabilities/index.js';
import { CrucibleConfigSchema, type CrucibleConfig } from './schema.js';

export type InitStatus = 'READY' | 'MISSING_SCENARIO';

export type InitResult = {
  root: string;
  status: InitStatus;
  created: string[];
  skipped: string[];
  config: CrucibleConfig;
  detectedContracts: string[];
  nextSteps: string[];
};

const IGNORE_DIRS = new Set(['.git', 'node_modules', 'lib', 'out', 'cache', 'broadcast', 'dist']);

function rel(root: string, path: string): string {
  return relative(root, path).split('\\').join('/');
}

function pickFoundryRoot(root: string, report: CapabilityReport): string {
  const first = report.toolchain.foundry.configPaths[0];
  if (!first) return '.';
  const dir = dirname(first);
  return dir === '.' ? '.' : dir;
}

function contractsFromArtifacts(candidates: string[]): string[] {
  const names = new Set<string>();
  for (const candidate of candidates) {
    const normalized = candidate.replace(/\\/g, '/');
    const name = basename(candidate, '.json');
    if (
      name &&
      !/(^|\/)(lib|script|test|interfaces|base)\.sol\//i.test(normalized) &&
      !/\.(?:s|t)\.sol\//i.test(normalized) &&
      !name.endsWith('.t') &&
      !name.endsWith('.s') &&
      !/^deploy/i.test(name) &&
      !/(?:deploy|verify|test|mock|fixture|helper)$/i.test(name) &&
      !/^(?:std|lib|vm|console|safeconsole|byteslib|I[A-Z])/i.test(name) &&
      !/helper/i.test(name)
    ) names.add(name);
  }
  return [...names].sort();
}

function artifactCandidatesFromRoot(foundryAbs: string): string[] {
  const outDir = join(foundryAbs, 'out');
  if (!existsSync(outDir)) return [];
  const candidates: string[] = [];
  for (const contractDir of readdirSync(outDir, { withFileTypes: true })) {
    if (!contractDir.isDirectory() || contractDir.name === 'build-info') continue;
    const nested = join(outDir, contractDir.name);
    for (const file of readdirSync(nested, { withFileTypes: true })) {
      if (file.isFile() && file.name.endsWith('.json')) candidates.push(join(nested, file.name));
    }
  }
  return candidates;
}

function walkSolFiles(dir: string, depth = 0): string[] {
  if (depth > 4 || !existsSync(dir)) return [];
  try {
    if (!statSync(dir).isDirectory()) return [];
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || IGNORE_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walkSolFiles(full, depth + 1));
    else if (entry.isFile() && entry.name.endsWith('.sol') && !entry.name.endsWith('.t.sol')) {
      files.push(full);
    }
  }
  return files;
}

function contractsFromSources(foundryAbs: string): string[] {
  const names = new Set<string>();
  for (const file of walkSolFiles(foundryAbs)) {
    let source: string;
    try {
      source = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const match of source.matchAll(/\bcontract\s+([A-Za-z_][A-Za-z0-9_]*)\b/g)) {
      const name = match[1];
      if (name && /^[A-Z]/.test(name) && !/^deploy/i.test(name) && !/(?:deploy|verify|test|mock|fixture|helper)$/i.test(name) && !/^(?:std|lib|vm|console|safeconsole|byteslib|I[A-Z])/i.test(name)) names.add(name);
    }
  }
  return [...names].sort();
}

export function listDetectedContracts(
  rootInput = process.cwd(),
  reportInput?: CapabilityReport
): string[] {
  const root = resolve(rootInput);
  const report = reportInput ?? detectCapabilities(root);
  const foundryRoot = pickFoundryRoot(root, report);
  const fromArtifacts = contractsFromArtifacts([
    ...report.artifacts.candidates,
    ...artifactCandidatesFromRoot(resolve(root, foundryRoot)).map((path) => rel(root, path))
  ]);
  if (fromArtifacts.length > 0) return fromArtifacts;
  return contractsFromSources(resolve(root, foundryRoot));
}

export function initCrucible(rootInput = process.cwd()): InitResult {
  const root = resolve(rootInput);
  const created: string[] = [];
  const skipped: string[] = [];

  if (!existsSync(root)) {
    throw new Error(`Repository root does not exist: ${root}`);
  }

  const report = detectCapabilities(root);
  const foundryRoot = pickFoundryRoot(root, report);
  const detectedContracts = listDetectedContracts(root, report);
  const existingScenario = report.scenarios.candidates[0];
  const configAbs = join(root, 'crucible.config.json');

  const configInput: Record<string, unknown> = {
    schemaVersion: '0.1',
    toolchain: 'foundry',
    foundryRoot,
    artifactDir: 'out',
    network: 'local',
    rpcUrl: 'http://127.0.0.1:8545'
  };
  if (existingScenario) {
    configInput.scenario = existingScenario;
    skipped.push(existingScenario);
  }

  const config = CrucibleConfigSchema.parse(configInput);

  if (existsSync(configAbs)) {
    skipped.push('crucible.config.json');
  } else {
    // Ensure parent exists for nested roots that already exist as dirs.
    mkdirSync(dirname(configAbs), { recursive: true });
    writeFileSync(configAbs, `${JSON.stringify(config, null, 2)}\n`);
    created.push('crucible.config.json');
  }

  const status: InitStatus = existingScenario ? 'READY' : 'MISSING_SCENARIO';
  const contractSummary =
    detectedContracts.length > 0
      ? `Detected contract(s): ${detectedContracts.join(', ')}.`
      : 'No contract artifacts or Solidity sources were detected yet.';

  const nextSteps =
    status === 'READY'
      ? created.length === 0
        ? [
            'Config and scenario already present; nothing was overwritten.',
            'Run crucible doctor, then crucible test.'
          ]
        : [
            `Pinned existing scenario ${existingScenario}.`,
            contractSummary,
            'Run crucible doctor, then crucible test.'
          ]
      : [
          'MISSING_SCENARIO: no Crucible scenario JSON was found.',
          contractSummary,
          'Run pnpm dlx @ohmuzakie/crucible-cli scenario create to create a business scenario from the contract ABI.',
          'The wizard asks human-friendly questions and will not invent deploy/call/assert steps.',
          'Optional template: fixtures/scenarios/mint-nft.json (only when the contract actually matches mint/ownerOf).',
          'Then run pnpm dlx @ohmuzakie/crucible-cli test.'
        ];

  return { root, status, created, skipped, config, detectedContracts, nextSteps };
}

export function formatInitResult(result: InitResult): string {
  const lines = [
    `STATUS: ${result.status}`,
    result.created.length ? 'INIT: wrote new Crucible files' : 'INIT: idempotent — no files overwritten',
    '',
    `Created: ${result.created.length ? result.created.join(', ') : '(none)'}`,
    `Skipped: ${result.skipped.length ? result.skipped.join(', ') : '(none)'}`,
    `foundryRoot: ${result.config.foundryRoot}`,
    `scenario: ${result.config.scenario ?? '(none — MISSING_SCENARIO)'}`,
    `contracts: ${result.detectedContracts.length ? result.detectedContracts.join(', ') : '(none)'}`,
    '',
    'Next steps:'
  ];
  for (const step of result.nextSteps) lines.push(`- ${step}`);
  return lines.join('\n');
}
