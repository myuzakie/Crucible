import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Abi,
  type Address,
  type Hex
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import type { NodeResult, Scenario, ScenarioNode, RunResult } from '../schema/index.js';

type Artifact = { abi: Abi; bytecode: Hex };

export type RunScenarioOptions = {
  scenario: Scenario;
  artifacts: Record<string, Artifact>;
  accounts: Record<string, Hex>;
  rpcUrl?: string;
  chainId?: number;
  networkName?: string;
};

function localChain(rpcUrl: string, chainId: number) {
  return defineChain({
    id: chainId,
    name: chainId === 31337 ? 'Anvil' : 'Monad Testnet',
    nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } }
  });
}

function topologicalOrder(nodes: ScenarioNode[]): ScenarioNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const ordered: ScenarioNode[] = [];

  function visit(id: string) {
    if (visited.has(id)) return;
    if (visiting.has(id)) throw new Error(`Scenario dependency cycle at ${id}`);
    const node = byId.get(id);
    if (!node) throw new Error(`Unknown dependency ${id}`);
    visiting.add(id);
    for (const dependency of node.after) visit(dependency);
    visiting.delete(id);
    visited.add(id);
    ordered.push(node);
  }

  for (const node of nodes) visit(node.id);
  return ordered;
}

function resolveValue(value: unknown, addresses: Record<string, Address>, nodeAddresses: Record<string, Address>): unknown {
  if (typeof value !== 'string') return value;
  if (addresses[value]) return addresses[value];
  if (nodeAddresses[value]) return nodeAddresses[value];
  if (/^\d+$/.test(value)) return BigInt(value);
  return value;
}

function receiptSummary(receipt: { status: string; blockNumber: bigint; gasUsed: bigint }) {
  return {
    status: receipt.status,
    blockNumber: receipt.blockNumber.toString(),
    gasUsed: receipt.gasUsed.toString()
  };
}

export async function runScenario(options: RunScenarioOptions): Promise<RunResult> {
  const rpcUrl = options.rpcUrl ?? 'http://127.0.0.1:8545';
  const chainId = options.chainId ?? 31337;
  const chain = localChain(rpcUrl, chainId);
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const accounts = Object.fromEntries(
    Object.entries(options.accounts).map(([name, key]) => [name, privateKeyToAccount(key)])
  );
  const addresses = Object.fromEntries(Object.entries(accounts).map(([name, account]) => [name, account.address]));
  const nodeAddresses: Record<string, Address> = {};
  const nodeArtifacts: Record<string, Artifact> = {};
  const results: NodeResult[] = [];
  const byId = new Map(options.scenario.nodes.map((node) => [node.id, node]));

  for (const node of topologicalOrder(options.scenario.nodes)) {
    const started = Date.now();
    const dependencyFailed = node.after.some((id) => results.find((result) => result.id === id)?.status !== 'passed');
    if (dependencyFailed) {
      results.push({ id: node.id, status: 'skipped', durationMs: 0 });
      continue;
    }

    try {
      if (node.type === 'deploy') {
        const artifact = options.artifacts[node.contract];
        const account = accounts[Object.keys(accounts)[0]];
        if (!artifact || !account) throw new Error(`Missing artifact or account for deploy node ${node.id}`);
        const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });
        const hash = await walletClient.deployContract({
          abi: artifact.abi,
          bytecode: artifact.bytecode,
          args: node.args.map((value) => resolveValue(value, addresses, nodeAddresses)) as never[],
          account
        });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (!receipt.contractAddress) throw new Error(`Deploy ${node.id} returned no contract address`);
        nodeAddresses[node.id] = receipt.contractAddress;
        nodeArtifacts[node.id] = artifact;
        results.push({ id: node.id, status: 'passed', durationMs: Date.now() - started, txHash: hash, receipt: receiptSummary(receipt) });
      } else if (node.type === 'call') {
        const address = nodeAddresses[node.to] ?? (node.to as Address);
        const artifact = nodeArtifacts[node.to];
        const account = accounts[node.from];
        if (!artifact || !account) throw new Error(`Missing target artifact or actor for call node ${node.id}`);
        const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });
        const hash = await walletClient.writeContract({
          address,
          abi: artifact.abi,
          functionName: node.fn,
          args: node.args.map((value) => resolveValue(value, addresses, nodeAddresses)) as never[],
          account
        });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        nodeAddresses[node.id] = address;
        nodeArtifacts[node.id] = artifact;
        results.push({ id: node.id, status: 'passed', durationMs: Date.now() - started, txHash: hash, receipt: receiptSummary(receipt) });
      } else {
        const targetId = node.after.at(-1);
        const address = targetId ? nodeAddresses[targetId] : undefined;
        const artifact = targetId ? nodeArtifacts[targetId] : undefined;
        if (!address || !artifact) throw new Error(`Missing assertion target for node ${node.id}`);
        const actual = await publicClient.readContract({
          address,
          abi: artifact.abi,
          functionName: node.check.fn,
          args: node.check.args.map((value) => resolveValue(value, addresses, nodeAddresses)) as never[]
        });
        const expected = node.check.eq;
        if (expected !== undefined && String(actual) !== String(resolveValue(expected, addresses, nodeAddresses))) {
          results.push({
            id: node.id,
            status: 'failed',
            durationMs: Date.now() - started,
            error: { kind: 'assertion', expected, actual: String(actual), message: `Expected ${String(expected)}, got ${String(actual)}` }
          });
        } else {
          results.push({ id: node.id, status: 'passed', durationMs: Date.now() - started });
        }
      }
    } catch (error) {
      results.push({
        id: node.id,
        status: 'failed',
        durationMs: Date.now() - started,
        error: { kind: 'rpc', message: error instanceof Error ? error.message : String(error) }
      });
    }
  }

  const summary = {
    passed: results.filter((result) => result.status === 'passed').length,
    failed: results.filter((result) => result.status === 'failed').length,
    skipped: results.filter((result) => result.status === 'skipped').length
  };
  return {
    schemaVersion: '0.1',
    runId: `run-${Date.now()}`,
    scenario: options.scenario.name,
    status: summary.failed ? 'failed' : 'passed',
    score: Math.round((summary.passed / results.length) * 100),
    network: { name: options.networkName ?? 'local', chainId },
    startedAt: new Date(Date.now() - results.reduce((total, result) => total + result.durationMs, 0)).toISOString(),
    finishedAt: new Date().toISOString(),
    nodes: results,
    summary
  };
}

export { topologicalOrder };
