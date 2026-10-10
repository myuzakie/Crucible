#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';

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
  createScenarioDraft,
  formatScenarioPreview,
  initCrucible,
  listScenarioContracts,
  onboardingExitCode,
  parsePrivateKey,
  resolveScenarioDocument,
  runDoctor,
  runOnboardingLocalTest,
  runScenario,
  RunResultSchema,
  writeScenario,
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
      '  pnpm crucible test [--local] [--scenario path] [--root path] [--foundry-root path] [--out path] [--verbose|--json]',
      '  pnpm crucible scenario create [--root path] [--foundry-root path] [--contract name] [--call fn] [--assert fn] [--yes]',
      '  pnpm crucible web --result <result.json> [--port 5173]',
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

function jsonFlag(args: string[], name: string, fallback: unknown[] = []): unknown[] {
  if (!args.includes(name)) return fallback;
  try {
    const value = JSON.parse(flag(args, name));
    if (!Array.isArray(value)) throw new Error('must be a JSON array');
    return value;
  } catch (error) {
    throw new Error(`Invalid ${name}; expected a JSON array (${error instanceof Error ? error.message : String(error)}).`);
  }
}

function scalarFlag(args: string[], name: string): string | number | boolean | undefined {
  if (!args.includes(name)) return undefined;
  const raw = flag(args, name);
  try {
    const value = JSON.parse(raw) as unknown;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  } catch {
    // A non-JSON value is treated as a string for convenient CLI use.
  }
  return raw;
}

async function ask(question: string, fallback = ''): Promise<string> {
  const answer = await prompt.question(`${question}${fallback ? ` [${fallback}]` : ''}: `);
  return answer.trim() || fallback;
}

const prompt = createInterface({ input: process.stdin, output: process.stdout });

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

async function runScenarioCreate(args: string[], root: string): Promise<void> {
  const config = await loadCrucibleConfig(root);
  const detected = detectCapabilities(root);
  const foundryRoot = args.includes('--foundry-root')
    ? flag(args, '--foundry-root')
    : config?.foundryRoot ?? detected.toolchain.foundry.configPaths[0]?.split('/').slice(0, -1).join('/') ?? '.';
  const contracts = listScenarioContracts(root, foundryRoot);
  if (!contracts.length) throw new Error('No contract with callable ABI functions was found. Run forge build first.');

  let contractName = args.includes('--contract') ? flag(args, '--contract') : '';
  if (!contractName) {
    console.log('Detected contracts:');
    contracts.forEach((contract, index) => console.log(`${index + 1}. ${contract.name}`));
    const choice = Number(await ask('Choose contract', '1')) - 1;
    contractName = contracts[choice]?.name ?? '';
  }
  const contract = contracts.find((candidate) => candidate.name === contractName);
  if (!contract) throw new Error(`Contract ${contractName} was not found in compiled artifacts.`);

  const writable = contract.functions.filter((fn) => fn.stateMutability !== 'view' && fn.stateMutability !== 'pure');
  const readable = contract.functions.filter((fn) => fn.stateMutability === 'view' || fn.stateMutability === 'pure');
  if (!writable.length || !readable.length) {
    throw new Error(`Contract ${contract.name} needs at least one write function and one view/pure function.`);
  }
  const chooseFunction = async (label: string, functions: typeof contract.functions, selected?: string) => {
    if (selected) return selected;
    console.log(`${label} functions:`);
    functions.forEach((fn, index) => console.log(`${index + 1}. ${fn.name}(${fn.inputs.map((input) => input.type).join(', ')})`));
    const choice = Number(await ask(`Choose ${label.toLowerCase()} function`, '1')) - 1;
    return functions[choice]?.name ?? '';
  };
  const call = await chooseFunction('Write', writable, args.includes('--call') ? flag(args, '--call') : undefined);
  const assertion = await chooseFunction('Read/assertion', readable, args.includes('--assert') ? flag(args, '--assert') : undefined);
  if (!call || !assertion) throw new Error('A call and an assertion function are required.');

  const name = args.includes('--name')
    ? flag(args, '--name')
    : await ask('Scenario name', `${contract.name.toLowerCase()}-${call.toLowerCase()}`);
  const constructorArgs = args.includes('--constructor-args-json')
    ? jsonFlag(args, '--constructor-args-json')
    : args.includes('--yes')
      ? []
      : JSON.parse((await ask('Constructor args as JSON', '[]')) || '[]');
  const callArgs = args.includes('--call-args-json')
    ? jsonFlag(args, '--call-args-json')
    : args.includes('--yes')
      ? []
      : JSON.parse((await ask('Call args as JSON', '[]')) || '[]');
  const assertionArgs = args.includes('--assert-args-json')
    ? jsonFlag(args, '--assert-args-json')
    : args.includes('--yes')
      ? []
      : JSON.parse((await ask('Assertion args as JSON', '[]')) || '[]');
  const expected = scalarFlag(args, '--expected') ?? (args.includes('--yes') ? undefined : scalarFlag([ '--expected', await ask('Expected value as JSON', '') ], '--expected'));
  const result = createScenarioDraft({
    root,
    foundryRoot,
    artifactDir: config?.artifactDir,
    contract: contract.name,
    name,
    constructorArgs,
    call,
    callArgs,
    assertion,
    assertionArgs,
    expected
  });
  console.log(formatScenarioPreview(result));
  const shouldWrite = args.includes('--yes') || (await ask('Write this scenario? (y/N)', 'N')).toLowerCase() === 'y';
  if (!shouldWrite) {
    console.log('Cancelled. No file was written.');
    return;
  }
  const path = writeScenario(result, args.includes('--overwrite'));
  console.log(`Created: ${path}`);
  prompt.close();
}

const [command, ...rest] = process.argv.slice(2);
if (!command) usage();

try {
  if (command === 'scenario' && rest[0] === 'create') {
    const root = rest.includes('--root') ? resolve(flag(rest, '--root')) : process.cwd();
    await runScenarioCreate(rest.slice(1), root);
    process.exit(0);
  }

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
      console.log(formatOnboardingLocalResult(result, { verbose: rest.includes('--verbose') }));
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
