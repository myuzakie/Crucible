import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

import { detectCapabilities } from '../capabilities/detect.js';
import { CrucibleConfigSchema, type CrucibleConfig } from './schema.js';

const DEFAULT_SCENARIO = {
  schemaVersion: '0.1',
  name: 'crucible-smoke',
  network: 'local',
  actors: {
    deployer: 'env:DEPLOYER_PRIVATE_KEY',
    alice: 'env:ALICE_PRIVATE_KEY'
  },
  nodes: [
    {
      id: 'deploy',
      type: 'deploy',
      contract: 'Token',
      args: [],
      after: []
    },
    {
      id: 'mint',
      type: 'call',
      from: 'deployer',
      to: 'deploy',
      fn: 'mint',
      args: ['alice', '1000'],
      after: ['deploy']
    },
    {
      id: 'balance',
      type: 'assert',
      check: { fn: 'balanceOf', args: ['alice'], eq: '1000' },
      after: ['mint']
    }
  ]
} as const;

export type InitResult = {
  root: string;
  created: string[];
  skipped: string[];
  config: CrucibleConfig;
  nextSteps: string[];
};

function rel(root: string, path: string): string {
  return relative(root, path).split('\\').join('/');
}

function pickFoundryRoot(root: string): string {
  const report = detectCapabilities(root);
  const first = report.toolchain.foundry.configPaths[0];
  if (!first) return '.';
  const dir = dirname(first);
  return dir === '.' ? '.' : dir;
}

function pickScenarioPath(root: string): { path: string; writeTemplate: boolean } {
  const report = detectCapabilities(root);
  if (report.scenarios.candidates[0]) {
    return { path: report.scenarios.candidates[0], writeTemplate: false };
  }
  return { path: 'scenarios/crucible-smoke.json', writeTemplate: true };
}

export function initCrucible(rootInput = process.cwd()): InitResult {
  const root = resolve(rootInput);
  const created: string[] = [];
  const skipped: string[] = [];

  if (!existsSync(root)) {
    throw new Error(`Repository root does not exist: ${root}`);
  }

  const foundryRoot = pickFoundryRoot(root);
  const scenarioChoice = pickScenarioPath(root);
  const scenarioAbs = join(root, scenarioChoice.path);
  const configAbs = join(root, 'crucible.config.json');

  if (scenarioChoice.writeTemplate) {
    if (existsSync(scenarioAbs)) {
      skipped.push(rel(root, scenarioAbs));
    } else {
      mkdirSync(dirname(scenarioAbs), { recursive: true });
      writeFileSync(scenarioAbs, `${JSON.stringify(DEFAULT_SCENARIO, null, 2)}\n`);
      created.push(rel(root, scenarioAbs));
    }
  } else {
    skipped.push(scenarioChoice.path);
  }

  const config = CrucibleConfigSchema.parse({
    schemaVersion: '0.1',
    toolchain: 'foundry',
    foundryRoot,
    artifactDir: 'out',
    scenario: scenarioChoice.path,
    network: 'local',
    rpcUrl: 'http://127.0.0.1:8545'
  });

  if (existsSync(configAbs)) {
    skipped.push('crucible.config.json');
  } else {
    writeFileSync(configAbs, `${JSON.stringify(config, null, 2)}\n`);
    created.push('crucible.config.json');
  }

  const nextSteps =
    created.length === 0
      ? [
          'Config and scenario already present; nothing was overwritten.',
          'Run crucible doctor, then crucible test --local.'
        ]
      : [
          'Inspect crucible.config.json and the scenario template.',
          'Run crucible doctor, then crucible test --local (builds + fresh Anvil; no user keys).',
          'Do not commit private keys; actors keep env: references for run/testnet only.'
        ];

  return { root, created, skipped, config, nextSteps };
}

export function formatInitResult(result: InitResult): string {
  const lines = [
    result.created.length ? 'INIT: wrote new Crucible files' : 'INIT: idempotent — no files overwritten',
    '',
    `Created: ${result.created.length ? result.created.join(', ') : '(none)'}`,
    `Skipped: ${result.skipped.length ? result.skipped.join(', ') : '(none)'}`,
    `foundryRoot: ${result.config.foundryRoot}`,
    `scenario: ${result.config.scenario}`,
    '',
    'Next steps:'
  ];
  for (const step of result.nextSteps) lines.push(`- ${step}`);
  return lines.join('\n');
}
