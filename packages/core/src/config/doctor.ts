import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { detectCapabilities } from '../capabilities/detect.js';
import { missingToolMessage, probeTool } from '../tooling.js';
import { DoctorReportSchema, type DoctorReport } from './schema.js';

export type DoctorOptions = {
  root?: string;
  rpcUrl?: string;
  env?: NodeJS.ProcessEnv;
  probeRpc?: (url: string) => Promise<{ reachable: boolean; chainId?: number }>;
};

const DEFAULT_RPC = 'http://127.0.0.1:8545';

async function defaultProbeRpc(url: string): Promise<{ reachable: boolean; chainId?: number }> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
      signal: AbortSignal.timeout(1500)
    });
    if (!response.ok) return { reachable: false };
    const body = (await response.json()) as { result?: string };
    if (typeof body.result !== 'string') return { reachable: false };
    return { reachable: true, chainId: Number.parseInt(body.result, 16) };
  } catch {
    return { reachable: false };
  }
}

function collectFixtureCandidates(root: string): string[] {
  const dir = join(root, 'fixtures', 'result');
  try {
    if (!statSync(dir).isDirectory()) return [];
    return readdirSync(dir)
      .filter((name) => name.endsWith('.json'))
      .map((name) => `fixtures/result/${name}`)
      .sort();
  } catch {
    return [];
  }
}

function walletMode(env: NodeJS.ProcessEnv): DoctorReport['walletMode'] {
  const hasDeployer = Boolean(env.DEPLOYER_PRIVATE_KEY);
  const hasAlice = Boolean(env.ALICE_PRIVATE_KEY);
  if (hasDeployer && hasAlice) return 'env-keys';
  if (hasDeployer || hasAlice) return 'missing';
  return 'fixture';
}

function nodeOk(version: string): boolean {
  const major = Number.parseInt(version.replace(/^v/, '').split('.')[0] ?? '0', 10);
  return major >= 20;
}

export async function runDoctor(options: DoctorOptions = {}): Promise<DoctorReport> {
  const root = resolve(options.root ?? process.cwd());
  const env = options.env ?? process.env;
  const capabilities = detectCapabilities(root);
  const rpcUrl = options.rpcUrl ?? env.LOCAL_RPC_URL ?? DEFAULT_RPC;
  const probe = options.probeRpc ?? defaultProbeRpc;
  const localRpc = existsSync(root) ? await probe(rpcUrl) : { reachable: false };
  const fixtures = collectFixtureCandidates(root);
  const mode = walletMode(env);
  const tools = {
    forge: probeTool('forge', env),
    anvil: probeTool('anvil', env)
  };
  const version = process.version;
  const okNode = nodeOk(version);

  let status: DoctorReport['status'] = capabilities.status as DoctorReport['status'];
  if (
    capabilities.toolchain.foundry.detected &&
    !localRpc.reachable &&
    (status === 'SUPPORTED' || status === 'SUPPORTED_WITH_CONFIG')
  ) {
    status = 'MISSING_LOCAL_CHAIN';
  }
  if (capabilities.toolchain.foundry.detected && (!tools.forge.available || !tools.anvil.available)) {
    status = 'MISSING_TOOL';
  }

  const nextSteps: string[] = [];
  if (!okNode) nextSteps.push('Upgrade Node.js to v20 or newer.');
  if (!capabilities.toolchain.foundry.detected) {
    nextSteps.push('Add or open a Foundry package (foundry.toml), then re-run doctor.');
  } else if (!capabilities.config.present) {
    nextSteps.push('Run crucible init to create crucible.config.json and a scenario template.');
  }
  if (capabilities.toolchain.foundry.detected && !tools.forge.available) {
    nextSteps.push(missingToolMessage('forge', tools.forge));
  }
  if (capabilities.toolchain.foundry.detected && !tools.anvil.available) {
    nextSteps.push(missingToolMessage('anvil', tools.anvil));
  }
  if (!capabilities.artifacts.present && capabilities.toolchain.foundry.detected) {
    nextSteps.push('Build contracts (forge build or the repo compile script).');
  }
  if (!localRpc.reachable && tools.anvil.available) {
    nextSteps.push(
      `Run crucible test --local (starts a fresh Anvil), or start Anvil on ${rpcUrl} for crucible run.`
    );
  }
  if (mode === 'missing') {
    nextSteps.push(
      'Use crucible test --local (Anvil default accounts), or set DEPLOYER_PRIVATE_KEY and ALICE_PRIVATE_KEY for crucible run / testnet.'
    );
  } else if (mode === 'fixture') {
    nextSteps.push(
      fixtures.length
        ? 'Wallet keys absent; offline fixture fallback is available under fixtures/result/.'
        : 'Wallet keys absent; add fixtures/result/*.json for offline demo or run crucible test --local.'
    );
  }
  if (nextSteps.length === 0) {
    nextSteps.push('Environment looks ready. Run crucible test --local.');
  }

  const summary =
    status === 'MISSING_LOCAL_CHAIN'
      ? `Foundry project detected, but local RPC at ${rpcUrl} is not reachable.`
      : status === 'MISSING_TOOL'
        ? 'Foundry project detected, but required local tools are missing.'
        : capabilities.summary;

  return DoctorReportSchema.parse({
    root,
    status,
    summary,
    node: { version, ok: okNode },
    packageManager: capabilities.packageManager,
    toolchain: {
      foundry: capabilities.toolchain.foundry,
      hardhat: capabilities.toolchain.hardhat
    },
    tools,
    artifacts: capabilities.artifacts,
    scenarios: capabilities.scenarios,
    config: {
      present: capabilities.config.present,
      path: capabilities.config.candidates[0]
    },
    localRpc: {
      url: rpcUrl,
      reachable: localRpc.reachable,
      chainId: localRpc.chainId
    },
    walletMode: mode,
    fixtureFallback: {
      available: fixtures.length > 0,
      candidates: fixtures.slice(0, 10)
    },
    nextSteps
  });
}

export function formatDoctorReport(report: DoctorReport): string {
  const lines = [
    `STATUS: ${report.status}`,
    report.summary,
    '',
    `Node: ${report.node.version}${report.node.ok ? '' : ' (upgrade recommended)'}`,
    `Package manager: ${report.packageManager.name}${report.packageManager.monorepo ? ' (monorepo)' : ''}`,
    `Foundry: ${report.toolchain.foundry.detected ? report.toolchain.foundry.configPaths.join(', ') : 'not detected'}`,
    `Hardhat: ${
      report.toolchain.hardhat.detected
        ? `${report.toolchain.hardhat.configPaths.join(', ')} (unsupported)`
        : 'not detected'
    }`,
    `Forge: ${report.tools.forge.available ? `${report.tools.forge.executable}${report.tools.forge.version ? ` (${report.tools.forge.version})` : ''}` : `${report.tools.forge.executable} unavailable`}`,
    `Anvil: ${report.tools.anvil.available ? `${report.tools.anvil.executable}${report.tools.anvil.version ? ` (${report.tools.anvil.version})` : ''}` : `${report.tools.anvil.executable} unavailable`}`,
    `Artifacts: ${report.artifacts.present ? `${report.artifacts.candidates.length} candidate(s)` : 'missing'}`,
    `Scenarios: ${report.scenarios.present ? report.scenarios.candidates.join(', ') : 'missing'}`,
    `Config: ${report.config.present ? report.config.path : 'missing'}`,
    `Local RPC: ${report.localRpc.reachable ? `ok (chainId ${report.localRpc.chainId})` : `unreachable (${report.localRpc.url})`}`,
    `Wallet mode: ${report.walletMode}`,
    `Fixture fallback: ${
      report.fixtureFallback.available ? report.fixtureFallback.candidates.join(', ') : 'none'
    }`,
    '',
    'Next steps:'
  ];
  for (const step of report.nextSteps) lines.push(`- ${step}`);
  return lines.join('\n');
}
