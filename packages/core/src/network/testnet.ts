import type { Hex } from 'viem';

import { MONAD_TESTNET, parsePrivateKey } from './monad.js';

export type TestnetGuardStatus =
  | 'TESTNET_DRY_RUN'
  | 'TESTNET_CONFIRMATION_REQUIRED'
  | 'MISSING_TESTNET_KEY'
  | 'WRONG_CHAIN'
  | 'TESTNET_RPC_UNREACHABLE';

export type TestnetPreflight = {
  status: TestnetGuardStatus | 'READY';
  chainId: number;
  expectedChainId: number;
  rpcUrl: string;
  actorKeys: Record<string, Hex>;
  missingActors: string[];
  message: string;
};

/**
 * Pure guard used by the CLI before any state-changing testnet transaction.
 * It intentionally accepts environment values, not raw CLI private keys.
 */
export function preflightMonadTestnet(options: {
  chainId: number;
  rpcUrl: string;
  actorRefs: Record<string, string>;
  env: Record<string, string | undefined>;
  confirmed: boolean;
  dryRun: boolean;
  expectedChainId?: number;
}): TestnetPreflight {
  const expectedChainId = options.expectedChainId ?? MONAD_TESTNET.chainId;
  const actorKeys: Record<string, Hex> = {};
  const missingActors: string[] = [];

  for (const [actor, reference] of Object.entries(options.actorRefs)) {
    const envName = reference.startsWith('env:') ? reference.slice(4) : reference;
    const raw = options.env[envName];
    if (!raw) {
      missingActors.push(`${actor} (${envName})`);
      continue;
    }
    if (options.confirmed && !options.dryRun) actorKeys[actor] = parsePrivateKey(raw, envName);
  }

  if (options.chainId !== expectedChainId) {
    return {
      status: 'WRONG_CHAIN', chainId: options.chainId, expectedChainId, rpcUrl: options.rpcUrl,
      actorKeys, missingActors,
      message: `Connected RPC reports chain ID ${options.chainId}; Monad Testnet requires ${expectedChainId}.`
    };
  }
  if (options.dryRun) {
    return {
      status: 'TESTNET_DRY_RUN', chainId: options.chainId, expectedChainId, rpcUrl: options.rpcUrl,
      actorKeys: {}, missingActors,
      message: 'Read-only preflight completed. No build, deployment, or transaction was started.'
    };
  }
  if (!options.confirmed) {
    return {
      status: 'TESTNET_CONFIRMATION_REQUIRED', chainId: options.chainId, expectedChainId, rpcUrl: options.rpcUrl,
      actorKeys: {}, missingActors,
      message: 'Testnet mode is guarded. Add --confirm-testnet to allow state-changing transactions.'
    };
  }
  if (missingActors.length) {
    return {
      status: 'MISSING_TESTNET_KEY', chainId: options.chainId, expectedChainId, rpcUrl: options.rpcUrl,
      actorKeys, missingActors,
      message: `Missing test-only private key environment variable for: ${missingActors.join(', ')}.`
    };
  }
  return {
    status: 'READY', chainId: options.chainId, expectedChainId, rpcUrl: options.rpcUrl,
    actorKeys, missingActors,
    message: 'Monad Testnet preflight passed. Transactions are permitted by explicit confirmation.'
  };
}
