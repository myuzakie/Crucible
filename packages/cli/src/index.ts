#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { CertificateRegistryAbi, createCertificate, verifyCertificate } from '@crucible/certificate';
import { DiagnosisSchema } from '@crucible/ai';
import {
  AdapterError,
  CrucibleConfigSchema,
  createFoundryAdapter,
  deployContractsFromScenario,
  detectCapabilities,
  formatCapabilityReport,
  formatDoctorReport,
  formatInitResult,
  formatOnboardingLocalResult,
  initCrucible,
  onboardingExitCode,
  parsePrivateKey,
  resolveScenarioDocument,
  runDoctor,
  runOnboardingLocalTest,
  runScenario,
  RunResultSchema,
  type Scenario
} from '@crucible/core';
import { createPublicClient, createWalletClient, http, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { isLocalTestCommand, localTestUsage } from './command-contract.js';

function usage(): never {
  console.error(
    [
      'Usage:',
      '  pnpm crucible detect [--root path] [--json]',
      '  pnpm crucible doctor [--root path] [--json]',
      '  pnpm crucible init [--root path] [--json]',
      '  pnpm crucible test [--local] [--scenario path] [--root path] [--foundry-root path] [--out path]',
      '  pnpm crucible validate <scenario-or-template.json>',
      '  pnpm crucible run <scenario.json> --network local [--foundry-root path] [--rpc url] [--out result.json]',
      '  pnpm crucible certify <scenario.json> <result.json> <diagnosis.json> [--key key.pem] [--out certificate.json]',
      '  pnpm crucible verify <certificate.json>',
      '  pnpm crucible publish <certificate.json> --rpc url --registry 0x… [--key-env ENV] [--uri url] [--out certificate.json]'
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

async function loadScenario(path: string): Promise<Scenario> {
  return resolveScenarioDocument(await loadJson(path));
}

async function loadCrucibleConfig(cwd: string) {
  try {
    return CrucibleConfigSchema.parse(await loadJson(resolve(cwd, 'crucible.config.json')));
  } catch {
    return undefined;
  }
}

async function resolveFoundryRoot(args: string[], cwd = process.cwd()): Promise<{ foundryRoot: string; artifactDir: string }> {
  if (args.includes('--foundry-root')) {
    return { foundryRoot: resolve(cwd, flag(args, '--foundry-root')), artifactDir: 'out' };
  }
  const config = await loadCrucibleConfig(cwd);
  if (config) {
    return { foundryRoot: resolve(cwd, config.foundryRoot), artifactDir: config.artifactDir };
  }
  throw new Error(
    'Missing Foundry root. Pass --foundry-root <path> or run crucible init to create crucible.config.json.'
  );
}

const [command, ...rest] = process.argv.slice(2);
if (!command) usage();

try {
  if (command === 'detect') {
    const root = rest.includes('--root') ? flag(rest, '--root') : process.cwd();
    const report = detectCapabilities(root);
    if (rest.includes('--json')) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(formatCapabilityReport(report));
    }
    process.exit(0);
  }

  if (command === 'doctor') {
    const root = rest.includes('--root') ? flag(rest, '--root') : process.cwd();
    const report = await runDoctor({ root });
    if (rest.includes('--json')) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(formatDoctorReport(report));
    }
    process.exit(0);
  }

  if (command === 'init') {
    const root = rest.includes('--root') ? flag(rest, '--root') : process.cwd();
    const result = initCrucible(root);
    if (rest.includes('--json')) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(formatInitResult(result));
    }
    process.exit(0);
  }

  if (command === 'test') {
    if (!isLocalTestCommand(rest)) {
      throw new Error(`Only local testing is available. ${localTestUsage()}`);
    }
    const root = rest.includes('--root') ? resolve(flag(rest, '--root')) : process.cwd();
    const result = await runOnboardingLocalTest({
      root,
      scenarioPath: rest.includes('--scenario') ? flag(rest, '--scenario') : undefined,
      foundryRoot: rest.includes('--foundry-root') ? flag(rest, '--foundry-root') : undefined,
      outPath: flag(rest, '--out', 'result.json'),
      autoInit: true
    });
    if (rest.includes('--json')) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(formatOnboardingLocalResult(result));
    }
    process.exit(onboardingExitCode(result.status));
  }

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

  if (command === 'publish') {
    const certificatePath = rest[0] ?? usage();
    const args = rest.slice(1);
    const report = verifyCertificate(await loadJson(certificatePath));
    const rpcUrl = flag(args, '--rpc', process.env.LOCAL_RPC_URL ?? 'http://127.0.0.1:8545');
    const registry = flag(args, '--registry');
    if (!/^0x[a-fA-F0-9]{40}$/.test(registry)) throw new Error('Invalid --registry address.');
    const keyEnv = flag(args, '--key-env', 'DEPLOYER_PRIVATE_KEY');
    const account = privateKeyToAccount(parsePrivateKey(process.env[keyEnv], keyEnv));
    const publicClient = createPublicClient({ transport: http(rpcUrl) });
    const walletClient = createWalletClient({ account, transport: http(rpcUrl) });
    const chainId = await publicClient.getChainId();
    const expectedChainId = Number(flag(args, '--chain-id', String(chainId)));
    if (chainId !== expectedChainId) throw new Error(`RPC chain ID ${chainId} does not match expected ${expectedChainId}.`);
    const uri = flag(args, '--uri', `crucible://certificate/${report.reportId}`);
    const transactionHash = await walletClient.writeContract({
      chain: null,
      address: registry as `0x${string}`,
      abi: CertificateRegistryAbi,
      functionName: 'register',
      args: [`0x${report.contentHash}` as `0x${string}`, uri]
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: transactionHash });
    if (receipt.status !== 'success') throw new Error('Certificate registry transaction failed.');
    const explorerBase = process.env.MONAD_EXPLORER_URL;
    const published = {
      ...report,
      onChain: {
        chainId,
        registryAddress: registry,
        transactionHash,
        ...(explorerBase ? { explorerUrl: `${explorerBase.replace(/\/$/, '')}/tx/${transactionHash}` } : {})
      }
    };
    const outputPath = flag(args, '--out', certificatePath);
    await writeFile(resolve(outputPath), `${JSON.stringify(published, null, 2)}\n`);
    console.log(`PUBLISHED: ${report.contentHash} — ${transactionHash}`);
    process.exit(0);
  }

  const scenarioPath = rest[0] ?? usage();
  const args = rest.slice(1);
  const scenario = await loadScenario(scenarioPath);

  if (command === 'validate') {
    const flow = scenario.metadata?.label ?? scenario.metadata?.businessFlow;
    const graph = scenario.nodes.map((node) => node.id).join(' -> ');
    console.log(
      flow
        ? `Valid scenario: ${scenario.name} [${flow}] (${graph})`
        : `Valid scenario: ${scenario.name} (${scenario.nodes.length} nodes)`
    );
    process.exit(0);
  }
  if (command !== 'run') usage();

  const network = flag(args, '--network', 'local');
  if (network !== 'local') throw new Error('Only --network local is available.');
  const rpcUrl = flag(args, '--rpc', process.env.LOCAL_RPC_URL ?? 'http://127.0.0.1:8545');
  const { foundryRoot, artifactDir } = await resolveFoundryRoot(args);
  const adapter = createFoundryAdapter({ foundryRoot, artifactDir });
  const artifacts = adapter.loadArtifacts(deployContractsFromScenario(scenario.nodes));
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
  if (error instanceof AdapterError) {
    console.error(`${error.status}: ${error.message}`);
    process.exit(1);
  }
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
