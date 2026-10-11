import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';

import { CapabilityReportSchema, type CapabilityReport, type CapabilityStatus } from './schema.js';

const IGNORE_DIRS = new Set([
  '.git',
  '.yarn',
  'node_modules',
  'dist',
  'build',
  'cache',
  'broadcast',
  'coverage',
  '.next',
  'lib'
]);

const MAX_DEPTH = 4;
const BUILD_SCRIPT_HINTS = [
  'compile',
  'build',
  'foundry:compile',
  'forge',
  'contracts',
  'hardhat:compile'
];

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function walkFiles(root: string, depth = 0): string[] {
  if (depth > MAX_DEPTH || !isDir(root)) return [];
  const entries = readdirSync(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    if (IGNORE_DIRS.has(entry.name)) continue;
    const full = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(full, depth + 1));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

function rel(root: string, path: string): string {
  return relative(root, path).split('\\').join('/');
}

function readJson(path: string): Record<string, unknown> | undefined {
  try {
    const value = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

function detectPackageManager(root: string, packageJson?: Record<string, unknown>) {
  if (isFile(join(root, 'pnpm-lock.yaml')) || isFile(join(root, 'pnpm-workspace.yaml'))) {
    return {
      name: 'pnpm' as const,
      lockfile: isFile(join(root, 'pnpm-lock.yaml')) ? 'pnpm-lock.yaml' : undefined,
      monorepo: isFile(join(root, 'pnpm-workspace.yaml'))
    };
  }
  if (isFile(join(root, 'yarn.lock')) || isFile(join(root, '.yarnrc.yml'))) {
    return {
      name: 'yarn' as const,
      lockfile: isFile(join(root, 'yarn.lock')) ? 'yarn.lock' : '.yarnrc.yml',
      monorepo: Boolean(packageJson?.workspaces) || isDir(join(root, 'packages'))
    };
  }
  if (isFile(join(root, 'package-lock.json'))) {
    return {
      name: 'npm' as const,
      lockfile: 'package-lock.json',
      monorepo: Boolean(packageJson?.workspaces)
    };
  }
  const declared = typeof packageJson?.packageManager === 'string' ? packageJson.packageManager : '';
  if (declared.startsWith('pnpm@')) return { name: 'pnpm' as const, monorepo: Boolean(packageJson?.workspaces) };
  if (declared.startsWith('yarn@')) return { name: 'yarn' as const, monorepo: Boolean(packageJson?.workspaces) };
  if (declared.startsWith('npm@')) return { name: 'npm' as const, monorepo: Boolean(packageJson?.workspaces) };
  return { name: 'unknown' as const, monorepo: Boolean(packageJson?.workspaces) || isDir(join(root, 'packages')) };
}

function collectArtifactCandidates(root: string, foundryRoots: string[]): string[] {
  const candidates = new Set<string>();
  for (const foundryRoot of foundryRoots) {
    const outDir = join(foundryRoot, 'out');
    if (!isDir(outDir)) continue;
    for (const contractDir of readdirSync(outDir, { withFileTypes: true })) {
      if (!contractDir.isDirectory() || contractDir.name === 'build-info') continue;
      const nested = join(outDir, contractDir.name);
      for (const file of readdirSync(nested, { withFileTypes: true })) {
        if (file.isFile() && file.name.endsWith('.json')) {
          candidates.add(rel(root, join(nested, file.name)));
        }
      }
    }
  }
  return [...candidates].sort();
}

function collectScenarioCandidates(files: string[], root: string): string[] {
  return files
    .filter((file) => {
      const path = rel(root, file);
      return /(^|\/)scenarios\/.+\.json$/.test(path);
    })
    .map((file) => rel(root, file))
    .sort();
}

function collectBuildScripts(packageJson?: Record<string, unknown>): string[] {
  const scripts = packageJson?.scripts;
  if (!scripts || typeof scripts !== 'object') return [];
  return Object.keys(scripts as Record<string, string>)
    .filter((name) => BUILD_SCRIPT_HINTS.some((hint) => name.includes(hint)))
    .sort();
}

function classify(input: {
  foundry: boolean;
  hardhat: boolean;
  artifacts: boolean;
  scenarios: boolean;
  config: boolean;
}): { status: CapabilityStatus; summary: string; nextSteps: string[] } {
  if (!input.foundry) {
    if (input.hardhat) {
      return {
        status: 'UNSUPPORTED_TOOLCHAIN',
        summary: 'Hardhat detected, but Crucible only supports Foundry adapters today.',
        nextSteps: [
          'Use a Foundry-based contract package, or wait for a Hardhat adapter.',
          'If this repo has a Foundry package, run detect from that package root.'
        ]
      };
    }
    return {
      status: 'UNSUPPORTED_TOOLCHAIN',
      summary: 'No supported contract toolchain found (expected foundry.toml).',
      nextSteps: [
        'Add a Foundry project with foundry.toml, or clone a Foundry scaffold.',
        'Then run crucible detect again from the repository root.'
      ]
    };
  }

  if (!input.scenarios && !input.config) {
    return {
      status: 'SUPPORTED_WITH_CONFIG',
      summary: 'Foundry detected. Crucible config and scenarios are still missing.',
      nextSteps: [
        'Run crucible init to create crucible.config.json and a scenario template.',
        input.artifacts
          ? 'Artifacts are present; choose a contract explicitly in the config.'
          : 'Build contracts with forge build (or the repo compile script) before running scenarios.'
      ]
    };
  }

  if (!input.artifacts) {
    return {
      status: 'MISSING_ARTIFACT',
      summary: 'Foundry detected, but no compiled artifact JSON was found under out/.',
      nextSteps: [
        'Run forge build in the Foundry package, or the repository compile script.',
        'Re-run crucible detect after a successful build.'
      ]
    };
  }

  if (!input.scenarios) {
    return {
      status: 'MISSING_SCENARIO',
      summary: 'Foundry artifacts are present, but no Crucible scenario JSON was found.',
      nextSteps: [
        'Add a scenarios/*.json file or run crucible init.',
        'Validate with crucible validate <scenario.json>.'
      ]
    };
  }

  if (!input.config) {
    return {
      status: 'SUPPORTED_WITH_CONFIG',
      summary: 'Foundry, artifacts, and scenarios are present. Add crucible.config.json to pin paths.',
      nextSteps: [
        'Run crucible init to write crucible.config.json without overwriting scenarios.',
        'Then run crucible doctor to check local chain readiness.'
      ]
    };
  }

  return {
    status: 'SUPPORTED',
    summary: 'Foundry repository looks ready for local Crucible runs.',
    nextSteps: ['Run crucible doctor, then crucible test --local.']
  };
}

export function detectCapabilities(rootInput = process.cwd()): CapabilityReport {
  const root = resolve(rootInput);
  if (!existsSync(root) || !isDir(root)) {
    return CapabilityReportSchema.parse({
      root,
      status: 'UNSUPPORTED_TOOLCHAIN',
      summary: 'Repository root does not exist or is not a directory.',
      toolchain: {
        foundry: { detected: false, configPaths: [] },
        hardhat: { detected: false, supported: false, configPaths: [] },
        scaffoldEth: { detected: false, hints: [] }
      },
      packageManager: { name: 'unknown', monorepo: false },
      artifacts: { present: false, candidates: [] },
      scenarios: { present: false, candidates: [] },
      config: { present: false, candidates: [] },
      buildScripts: [],
      nextSteps: ['Pass an existing repository directory to crucible detect --root <path>.']
    });
  }

  const files = walkFiles(root);
  const foundryConfigPaths = files
    .filter((file) => basename(file) === 'foundry.toml')
    .map((file) => rel(root, file))
    .sort();
  const hardhatConfigPaths = files
    .filter((file) => /hardhat\.config\.(js|ts|mjs|cjs)$/.test(basename(file)))
    .map((file) => rel(root, file))
    .sort();

  const packageJsonPath = join(root, 'package.json');
  const packageJson = isFile(packageJsonPath) ? readJson(packageJsonPath) : undefined;
  const packageManager = detectPackageManager(root, packageJson);

  const scaffoldHints: string[] = [];
  if (packageJson?.name === 'se-2') scaffoldHints.push('package.json name is se-2');
  if (isDir(join(root, 'packages', 'foundry')) && isDir(join(root, 'packages', 'nextjs'))) {
    scaffoldHints.push('packages/foundry and packages/nextjs layout');
  }
  const deps = {
    ...(typeof packageJson?.dependencies === 'object' && packageJson.dependencies ? packageJson.dependencies : {}),
    ...(typeof packageJson?.devDependencies === 'object' && packageJson.devDependencies
      ? packageJson.devDependencies
      : {})
  } as Record<string, unknown>;
  if (Object.keys(deps).some((name) => name.includes('scaffold-eth') || name.startsWith('@se-2/'))) {
    scaffoldHints.push('scaffold-eth or @se-2 dependency');
  }
  if (foundryConfigPaths.some((path) => path.startsWith('packages/foundry/'))) {
    scaffoldHints.push('foundry.toml under packages/foundry');
  }

  const foundryRoots = foundryConfigPaths.map((path) => dirname(join(root, path)));
  const artifactCandidates = collectArtifactCandidates(root, foundryRoots);
  const scenarioCandidates = collectScenarioCandidates(files, root);
  const configCandidates = files
    .filter((file) => basename(file) === 'crucible.config.json')
    .map((file) => rel(root, file))
    .sort();
  const buildScripts = collectBuildScripts(packageJson);

  const foundryDetected = foundryConfigPaths.length > 0;
  const hardhatDetected = hardhatConfigPaths.length > 0;
  const decision = classify({
    foundry: foundryDetected,
    hardhat: hardhatDetected,
    artifacts: artifactCandidates.length > 0,
    scenarios: scenarioCandidates.length > 0,
    config: configCandidates.length > 0
  });

  return CapabilityReportSchema.parse({
    root,
    status: decision.status,
    summary: decision.summary,
    toolchain: {
      foundry: { detected: foundryDetected, configPaths: foundryConfigPaths },
      hardhat: { detected: hardhatDetected, supported: false, configPaths: hardhatConfigPaths },
      scaffoldEth: { detected: scaffoldHints.length > 0, hints: [...new Set(scaffoldHints)].sort() }
    },
    packageManager,
    artifacts: { present: artifactCandidates.length > 0, candidates: artifactCandidates.slice(0, 20) },
    scenarios: { present: scenarioCandidates.length > 0, candidates: scenarioCandidates },
    config: { present: configCandidates.length > 0, candidates: configCandidates },
    buildScripts,
    nextSteps: decision.nextSteps
  });
}

export function formatCapabilityReport(report: CapabilityReport): string {
  const lines = [
    `STATUS: ${report.status}`,
    report.summary,
    '',
    `Foundry: ${report.toolchain.foundry.detected ? report.toolchain.foundry.configPaths.join(', ') : 'not detected'}`,
    `Hardhat: ${
      report.toolchain.hardhat.detected
        ? `${report.toolchain.hardhat.configPaths.join(', ')} (unsupported)`
        : 'not detected'
    }`,
    `Scaffold-ETH: ${
      report.toolchain.scaffoldEth.detected ? report.toolchain.scaffoldEth.hints.join('; ') : 'not detected'
    }`,
    `Package manager: ${report.packageManager.name}${report.packageManager.monorepo ? ' (monorepo)' : ''}`,
    `Artifacts: ${report.artifacts.present ? `${report.artifacts.candidates.length} candidate(s)` : 'missing'}`,
    `Scenarios: ${report.scenarios.present ? report.scenarios.candidates.join(', ') : 'missing'}`,
    `Config: ${report.config.present ? report.config.candidates.join(', ') : 'missing'}`,
    `Build scripts: ${report.buildScripts.length ? report.buildScripts.join(', ') : 'none matched'}`,
    '',
    'Next steps:'
  ];
  for (const step of report.nextSteps) lines.push(`- ${step}`);
  return lines.join('\n');
}
