import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  AdapterError,
  MONAD_TESTNET,
  createFoundryAdapter,
  deployContractsFromScenario,
  forgeBuild,
  preflightMonadTestnet,
  runScenario,
  type RunResult,
  type Scenario
} from '@crucible/core';
import { createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

export type TestnetCommandResult = {
  status: string;
  message: string;
  rpcUrl: string;
  chainId?: number;
  walletAddresses?: Record<string, string>;
  resultPath?: string;
  runResult?: RunResult;
  nextSteps: string[];
};

function isGuardFailure(status: string): boolean {
  return status !== 'READY' && status !== 'TESTNET_DRY_RUN';
}

/** Run one explicit, guarded Monad Testnet scenario. No private key is accepted via CLI. */
export async function runMonadTestnetTest(options: {
  scenario: Scenario;
  foundryRoot: string;
  artifactDir?: string;
  rpcUrl?: string;
  outPath?: string;
  confirmed: boolean;
  dryRun: boolean;
}): Promise<TestnetCommandResult> {
  const rpcUrl = options.rpcUrl ?? process.env.MONAD_TESTNET_RPC_URL ?? MONAD_TESTNET.rpcUrl;
  let chainId: number;
  try {
    chainId = await createPublicClient({ transport: http(rpcUrl) }).getChainId();
  } catch {
    return {
      status: 'TESTNET_RPC_UNREACHABLE',
      message: `Could not reach the Monad Testnet RPC at ${rpcUrl}.`,
      rpcUrl,
      nextSteps: ['Check MONAD_TESTNET_RPC_URL or your network connection, then retry.']
    };
  }

  let preflight;
  try {
    preflight = preflightMonadTestnet({
      chainId,
      rpcUrl,
      actorRefs: options.scenario.actors,
      env: process.env,
      confirmed: options.confirmed,
      dryRun: options.dryRun
    });
  } catch (error) {
    return {
      status: 'MISSING_TESTNET_KEY',
      message: error instanceof Error ? error.message : String(error),
      rpcUrl,
      chainId,
      nextSteps: ['Use a valid test-only 32-byte key in the environment named by the scenario actor.']
    };
  }

  if (preflight.status === 'TESTNET_DRY_RUN') {
    return {
      status: preflight.status,
      message: preflight.message,
      rpcUrl,
      chainId,
      nextSteps: ['Review the chain ID, then add --confirm-testnet for a state-changing run.']
    };
  }
  if (isGuardFailure(preflight.status)) {
    return {
      status: preflight.status,
      message: preflight.message,
      rpcUrl,
      chainId,
      nextSteps:
        preflight.status === 'TESTNET_CONFIRMATION_REQUIRED'
          ? ['Re-run with --confirm-testnet only when you intend to spend testnet gas.']
          : preflight.status === 'WRONG_CHAIN'
            ? [`Use Monad Testnet chain ${MONAD_TESTNET.chainId}; do not send transactions to another network.`]
            : ['Set the required test-only actor key environment variables; never commit them.'],
    };
  }

  try {
    forgeBuild(options.foundryRoot);
    const adapter = createFoundryAdapter({ foundryRoot: options.foundryRoot, artifactDir: options.artifactDir });
    const artifacts = adapter.loadArtifacts(deployContractsFromScenario(options.scenario.nodes));
    const runResult = await runScenario({
      scenario: options.scenario,
      artifacts,
      accounts: preflight.actorKeys,
      rpcUrl,
      chainId,
      networkName: MONAD_TESTNET.name,
      explorerUrl: MONAD_TESTNET.explorerUrl
    });
    const resultPath = resolve(options.outPath ?? 'crucible/results/monad-testnet-result.json');
    await mkdir(resolve(resultPath, '..'), { recursive: true });
    await writeFile(resultPath, `${JSON.stringify(runResult, null, 2)}\n`);
    return {
      status: runResult.status === 'passed' ? 'PASSED' : 'SCENARIO_FAILED',
      message: runResult.status === 'passed' ? 'Monad Testnet scenario passed.' : 'Monad Testnet scenario failed.',
      rpcUrl,
      chainId,
      walletAddresses: Object.fromEntries(Object.entries(preflight.actorKeys).map(([name, key]) => [name, privateKeyToAccount(key).address])),
      resultPath,
      runResult,
      nextSteps: [`Result written to ${resultPath}.`, 'Review transaction links in the result and web viewer.']
    };
  } catch (error) {
    if (error instanceof AdapterError) {
      return { status: error.status, message: error.message, rpcUrl, chainId, nextSteps: ['Fix the reported build or artifact issue, then retry.'] };
    }
    return {
      status: 'TESTNET_RUN_FAILED',
      message: error instanceof Error ? error.message : String(error),
      rpcUrl,
      chainId,
      nextSteps: ['Inspect the transaction/RPC message, then retry only after confirming the target and wallet.']
    };
  }
}

export function formatTestnetResult(result: TestnetCommandResult): string {
  const lines = [
    result.status === 'PASSED' ? 'CRUCIBLE MONAD TESTNET TEST' : 'CRUCIBLE TESTNET GUARD',
    '',
    'What we found:',
    `✓ RPC: ${result.rpcUrl}`,
    result.chainId ? `✓ Chain ID: ${result.chainId}` : '✗ RPC unavailable',
    `✓ Faucet: ${MONAD_TESTNET.faucetUrl}`,
    '✓ Funding: use a dedicated test wallet and fund it before confirmed execution.',
    '',
    'Status:',
    result.status,
    '',
    result.message,
    '',
    'Next step:'
  ];
  if (result.walletAddresses) {
    lines.splice(4, 0, ...Object.entries(result.walletAddresses).map(([name, address]) => `✓ Wallet ${name}: ${address}`));
  }
  lines.push(...result.nextSteps.map((step) => `- ${step}`));
  if (result.runResult) {
    lines.push('', 'Running:');
    for (const node of result.runResult.nodes) lines.push(`${node.status === 'passed' ? '✓' : '✗'} ${node.id}`);
    if (result.resultPath) lines.push('', `Result: ${result.resultPath}`);
  }
  return lines.join('\n');
}
