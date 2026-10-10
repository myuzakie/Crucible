import { readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';

import { AdapterError } from '../adapters/index.js';
import { detectCapabilities } from '../capabilities/detect.js';
import { CrucibleConfigSchema, type CrucibleConfig } from '../config/schema.js';
import { initCrucible, listDetectedContracts } from '../config/init.js';
import { resolveScenarioDocument } from '../templates/index.js';
import { missingToolMessage, probeTool } from '../tooling.js';
import type { RunResult, Scenario } from '../schema/index.js';
import { runLocalTest } from '../runner/local.js';

export type OnboardingStatus =
  | 'PASSED'
  | 'SCENARIO_FAILED'
  | 'MISSING_SCENARIO'
  | 'MISSING_TOOL'
  | 'MISSING_ARTIFACT'
  | 'UNSUPPORTED_TOOLCHAIN'
  | 'BUILD_FAILED'
  | 'SUPPORTED_WITH_CONFIG';

export type OnboardingLocalResult = {
  status: OnboardingStatus;
  root: string;
  summary: string;
  nextSteps: string[];
  detectedContracts: string[];
  scenarioPath?: string;
  foundryRoot?: string;
  resultPath?: string;
  webPath?: string;
  runResult?: RunResult;
};

export type OnboardingLocalOptions = {
  root?: string;
  scenarioPath?: string;
  foundryRoot?: string;
  artifactDir?: string;
  outPath?: string;
  /** When true (default), write minimal config if missing. Never invents a scenario. */
  autoInit?: boolean;
};

async function loadConfig(root: string): Promise<CrucibleConfig | undefined> {
  try {
    const raw = JSON.parse(await readFile(resolve(root, 'crucible.config.json'), 'utf8')) as unknown;
    return CrucibleConfigSchema.parse(raw);
  } catch {
    return undefined;
  }
}

async function loadScenario(path: string): Promise<Scenario> {
  return resolveScenarioDocument(JSON.parse(await readFile(resolve(path), 'utf8')) as unknown);
}

function pickFoundryRoot(
  root: string,
  explicit: string | undefined,
  config: CrucibleConfig | undefined,
  detectFoundryPaths: string[]
): string | undefined {
  if (explicit) return resolve(root, explicit);
  if (config?.foundryRoot) return resolve(root, config.foundryRoot);
  const first = detectFoundryPaths[0];
  if (!first) return undefined;
  const dir = dirname(first);
  return resolve(root, dir === '.' ? '.' : dir);
}

function pickScenarioPath(
  root: string,
  explicit: string | undefined,
  config: CrucibleConfig | undefined,
  candidates: string[]
): string | undefined {
  if (explicit) return resolve(root, explicit);
  if (config?.scenario) return resolve(root, config.scenario);
  if (candidates[0]) return resolve(root, candidates[0]);
  return undefined;
}

export async function runOnboardingLocalTest(
  options: OnboardingLocalOptions = {}
): Promise<OnboardingLocalResult> {
  const root = resolve(options.root ?? process.cwd());
  const autoInit = options.autoInit !== false;

  let report = detectCapabilities(root);
  if (!report.toolchain.foundry.detected) {
    return {
      status: 'UNSUPPORTED_TOOLCHAIN',
      root,
      summary: report.summary,
      nextSteps: report.nextSteps,
      detectedContracts: []
    };
  }

  const forge = probeTool('forge');
  const anvil = probeTool('anvil');
  if (!forge.available || !anvil.available) {
    const missing = !forge.available ? 'forge' : 'anvil';
    const probe = missing === 'forge' ? forge : anvil;
    return {
      status: 'MISSING_TOOL',
      root,
      summary: `Foundry ${missing} is required for local test but was not found.`,
      nextSteps: [missingToolMessage(missing, probe)],
      detectedContracts: []
    };
  }

  let config = await loadConfig(root);
  if (!config && autoInit) {
    const init = initCrucible(root);
    config = init.config;
    report = detectCapabilities(root);
    if (init.status === 'MISSING_SCENARIO' && !options.scenarioPath && !report.scenarios.candidates[0]) {
      return {
        status: 'MISSING_SCENARIO',
        root,
        summary: 'Repository is Foundry-ready, but no Crucible scenario is configured yet.',
        nextSteps: init.nextSteps,
        detectedContracts: init.detectedContracts,
        foundryRoot: resolve(root, config.foundryRoot)
      };
    }
  }

  const detectedContracts = listDetectedContracts(root, report);

  const foundryRoot = pickFoundryRoot(
    root,
    options.foundryRoot,
    config,
    report.toolchain.foundry.configPaths
  );
  if (!foundryRoot) {
    return {
      status: 'UNSUPPORTED_TOOLCHAIN',
      root,
      summary: 'Foundry root could not be resolved.',
      nextSteps: ['Pass --foundry-root <path> or add foundry.toml, then re-run crucible test.'],
      detectedContracts
    };
  }

  const scenarioPath = pickScenarioPath(
    root,
    options.scenarioPath,
    config,
    report.scenarios.candidates
  );
  if (!scenarioPath) {
    return {
      status: 'MISSING_SCENARIO',
      root,
      summary: 'No scenario selected. Crucible will not invent deploy/call/assert steps.',
      nextSteps: [
        detectedContracts.length
          ? `Detected contract(s): ${detectedContracts.join(', ')}.`
          : 'No contract artifacts/sources detected yet — run forge build or add Solidity sources.',
        'Add scenarios/<name>.json for a real business flow, or pass --scenario <path>.',
        'Optional template: fixtures/scenarios/mint-nft.json (only if mint/ownerOf apply).'
      ],
      detectedContracts,
      foundryRoot
    };
  }

  let scenario: Scenario;
  try {
    scenario = await loadScenario(scenarioPath);
  } catch (error) {
    return {
      status: 'MISSING_SCENARIO',
      root,
      summary: error instanceof Error ? error.message : String(error),
      nextSteps: [
        `Fix or replace scenario file: ${scenarioPath}`,
        'Validate with: pnpm crucible validate <scenario.json>'
      ],
      detectedContracts,
      foundryRoot,
      scenarioPath
    };
  }

  const artifactDir = options.artifactDir ?? config?.artifactDir ?? 'out';
  const outPath = resolve(root, options.outPath ?? 'result.json');

  try {
    const runResult = await runLocalTest({ scenario, foundryRoot, artifactDir });
    await writeFile(outPath, `${JSON.stringify(runResult, null, 2)}\n`);
    const passed = runResult.status === 'passed';
    return {
      status: passed ? 'PASSED' : 'SCENARIO_FAILED',
      root,
      summary: passed
        ? `Scenario ${runResult.scenario} passed on a fresh local Anvil chain.`
        : `Scenario ${runResult.scenario} finished with status ${runResult.status}.`,
      nextSteps: passed
        ? [
            `Result written to ${outPath}.`,
            `Copy into apps/web/public/results/${basename(outPath)} and run pnpm --filter @crucible/web dev.`
          ]
        : [
            `Inspect failed nodes in ${outPath}.`,
            'Fix the contract or assertions, then re-run crucible test.'
          ],
      detectedContracts,
      scenarioPath,
      foundryRoot,
      resultPath: outPath,
      webPath: `/results/${basename(outPath)}`,
      runResult
    };
  } catch (error) {
    if (error instanceof AdapterError) {
      return {
        status: error.status as OnboardingStatus,
        root,
        summary: error.message,
        nextSteps:
          error.status === 'MISSING_TOOL'
            ? [error.message]
            : error.status === 'MISSING_ARTIFACT'
              ? [
                  'Run forge build in the Foundry package, or pass a contract that exists under out/.',
                  'Re-run crucible test after a successful build.'
                ]
              : [
                  'Fix the forge build error above, then re-run crucible test.',
                  `Foundry root: ${foundryRoot}`
                ],
        detectedContracts,
        scenarioPath,
        foundryRoot
      };
    }
    throw error;
  }
}

export function formatOnboardingLocalResult(result: OnboardingLocalResult): string {
  const lines = [
    `STATUS: ${result.status}`,
    result.summary,
    '',
    `Root: ${result.root}`,
    `Contracts: ${result.detectedContracts.length ? result.detectedContracts.join(', ') : '(none)'}`,
    `Scenario: ${result.scenarioPath ?? '(none)'}`,
    `Foundry: ${result.foundryRoot ?? '(none)'}`
  ];
  if (result.resultPath) lines.push(`Result: ${result.resultPath}`);
  if (result.webPath) lines.push(`Web path: ${result.webPath}`);
  lines.push('', 'Next steps:');
  for (const step of result.nextSteps) lines.push(`- ${step}`);
  return lines.join('\n');
}

export function onboardingExitCode(status: OnboardingStatus): number {
  return status === 'PASSED' ? 0 : 1;
}
