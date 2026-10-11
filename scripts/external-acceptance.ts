import { cp, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

type Target = { name: string; path?: string; url: string };
type Result = {
  name: string;
  status: string;
  exitCode: number | null;
  accepted: boolean;
  root: string;
  summary?: string;
  nextSteps?: string[];
  output: string;
};

const targets: Target[] = [
  { name: 'scaffold-monad-foundry', url: 'https://github.com/monad-developers/scaffold-monad-foundry.git' },
  { name: 'scaffold-eth-2', url: 'https://github.com/scaffold-eth/scaffold-eth-2.git' },
  { name: 'se-2-challenges', url: 'https://github.com/scaffold-eth/se-2-challenges.git' }
];

const acceptedStatuses = new Set([
  'PASSED',
  'MISSING_SCENARIO',
  'MISSING_ARTIFACT',
  'MISSING_TOOL',
  'UNSUPPORTED_TOOLCHAIN',
  'BUILD_FAILED',
  'SCENARIO_FAILED'
]);

function value(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function targetOverrides(args: string[]): Map<string, string> {
  const overrides = new Map<string, string>();
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== '--target') continue;
    const pair = args[index + 1] ?? '';
    const separator = pair.indexOf('=');
    if (separator <= 0) throw new Error('--target expects name=path.');
    overrides.set(pair.slice(0, separator), resolve(pair.slice(separator + 1)));
    index += 1;
  }
  return overrides;
}

function parseOutput(output: string): { status: string; summary?: string; nextSteps?: string[] } {
  try {
    const parsed = JSON.parse(output) as { status?: string; summary?: string; nextSteps?: string[] };
    return {
      status: parsed.status ?? 'UNKNOWN',
      summary: parsed.summary,
      nextSteps: parsed.nextSteps
    };
  } catch {
    return { status: 'CLI_OUTPUT_INVALID' };
  }
}

async function preparePackedCli(workspace: string): Promise<string> {
  const packageDir = join(workspace, 'package');
  const output = join(workspace, 'tarball');
  const result = execFileSync('pnpm', ['--filter', '@ohmuzakie/crucible-cli', 'pack', '--pack-destination', output], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });
  void result;
  const files = await readdir(output);
  const tarball = files.find((file) => file.endsWith('.tgz'));
  if (!tarball) throw new Error('CLI package tarball was not produced.');
  execFileSync('tar', ['-xzf', join(output, tarball), '-C', workspace], { encoding: 'utf8' });
  const cliPath = join(packageDir, 'dist', 'index.js');
  await readFile(cliPath);
  return cliPath;
}

async function prepareTarget(target: Target, root: string, override?: string): Promise<string> {
  if (override) {
    const destination = join(root, target.name);
    await cp(override, destination, { recursive: true, filter: (source) => !source.split('/').includes('.git') });
    return destination;
  }
  const destination = join(root, target.name);
  execFileSync('git', ['clone', '--depth', '1', target.url, destination], { stdio: 'pipe', encoding: 'utf8' });
  return destination;
}

async function main() {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const overrides = targetOverrides(args);
  const workspace = await mkdtemp(join(tmpdir(), 'crucible-external-acceptance-'));
  const results: Result[] = [];
  try {
    const cliPath = await preparePackedCli(workspace);
    const reportRoot = await mkdtemp(join(tmpdir(), 'crucible-external-targets-'));
    try {
      for (const target of targets) {
        let targetRoot: string;
        try {
          targetRoot = await prepareTarget(target, reportRoot, overrides.get(target.name));
          const run = spawnSync(process.execPath, [cliPath, 'test', '--root', targetRoot, '--json'], {
            cwd: targetRoot,
            encoding: 'utf8',
            env: { ...process.env, PATH: process.env.PATH }
          });
          const output = (run.stdout ?? '').trim();
          const parsed = parseOutput(output);
          const hasRawError = /ENOENT|Cannot find module|stack trace/i.test(output);
          results.push({
            name: target.name,
            status: parsed.status,
            exitCode: run.status,
            accepted: acceptedStatuses.has(parsed.status) && !hasRawError,
            root: targetRoot,
            summary: parsed.summary,
            nextSteps: parsed.nextSteps,
            output
          });
        } catch (error) {
          results.push({
            name: target.name,
            status: 'ACCEPTANCE_ERROR',
            exitCode: 1,
            accepted: false,
            root: join(reportRoot, target.name),
            output: error instanceof Error ? error.message : String(error)
          });
        }
      }
    } finally {
      await rm(reportRoot, { recursive: true, force: true });
    }
    const report = {
      schemaVersion: '0.1',
      package: '@ohmuzakie/crucible-cli',
      repositories: results,
      accepted: results.length === targets.length && results.every((result) => result.accepted)
    };
    if (json) console.log(JSON.stringify(report, null, 2));
    else {
      console.log('CRUCIBLE EXTERNAL ACCEPTANCE');
      for (const result of results) console.log(`${result.accepted ? '✓' : '✗'} ${result.name}: ${result.status} (exit ${result.exitCode})`);
      console.log(`Status: ${report.accepted ? 'PASSED' : 'FAILED'}`);
    }
    if (!report.accepted) process.exitCode = 1;
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
