import { createServer } from 'node:net';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';

import type { Hex } from 'viem';

import { AdapterError, createFoundryAdapter, deployContractsFromScenario } from '../adapters/index.js';
import { missingToolMessage, probeTool, toolExecutable } from '../tooling.js';
import type { RunResult, Scenario } from '../schema/index.js';
import { RunResultSchema } from '../schema/index.js';
import { runScenario } from './index.js';

/** Anvil account #0 / #1 — same keys as local.integration.test.ts. */
export const ANVIL_DEFAULT_KEYS = [
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'
] as const satisfies readonly Hex[];

const NAMED_ANVIL_KEYS: Record<string, Hex> = {
  deployer: ANVIL_DEFAULT_KEYS[0],
  alice: ANVIL_DEFAULT_KEYS[1]
};

export function mapAnvilAccounts(actors: Record<string, string>): Record<string, Hex> {
  const names = Object.keys(actors);
  if (names.length > ANVIL_DEFAULT_KEYS.length) {
    throw new Error(
      `Local mode supports up to ${ANVIL_DEFAULT_KEYS.length} Anvil default actors; scenario has ${names.length}.`
    );
  }
  return Object.fromEntries(
    names.map((name, index) => [name, NAMED_ANVIL_KEYS[name] ?? ANVIL_DEFAULT_KEYS[index]!])
  );
}

export async function waitForRpc(url: string, attempts = 40): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] })
      });
      if (response.ok) return;
    } catch {
      // Anvil is still starting.
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Anvil did not become ready at ${url}.`);
}

async function ephemeralPort(): Promise<number> {
  // shortcut: brief bind/close race before Anvil listens; upgrade if flaky under parallel CI load
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        server.close(() => reject(new Error('Failed to allocate ephemeral port.')));
        return;
      }
      const port = addr.port;
      server.close((error) => (error ? reject(error) : resolvePort(port)));
    });
    server.on('error', reject);
  });
}

export function forgeBuild(foundryRoot: string): void {
  const root = resolve(foundryRoot);
  const forgeProbe = probeTool('forge');
  if (!forgeProbe.available) {
    throw new AdapterError('MISSING_TOOL', missingToolMessage('forge', forgeProbe), { path: root });
  }
  const forge = toolExecutable('forge');
  const result = spawnSync(forge, ['build', '--root', root], { encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    const detail = (result.stderr || result.stdout || 'forge build failed').trim();
    throw new AdapterError('BUILD_FAILED', `forge build --root ${root} failed.\n${detail}`, {
      path: root
    });
  }
}

export type FreshAnvilHandle = {
  rpcUrl: string;
  process: ChildProcess;
  stop: () => Promise<void>;
};

export async function startFreshAnvil(accounts = 2): Promise<FreshAnvilHandle> {
  const port = await ephemeralPort();
  const anvilProbe = probeTool('anvil');
  if (!anvilProbe.available) {
    throw new AdapterError('MISSING_TOOL', missingToolMessage('anvil', anvilProbe));
  }
  const anvil = toolExecutable('anvil');
  const child = spawn(anvil, ['--silent', '--port', String(port), '--accounts', String(accounts)], {
    stdio: 'ignore'
  });
  const rpcUrl = `http://127.0.0.1:${port}`;
  const stop = async () => {
    if (!child.killed) child.kill('SIGTERM');
    await new Promise<void>((resolveStop) => child.once('exit', () => resolveStop()));
  };
  try {
    await waitForRpc(rpcUrl);
  } catch (error) {
    await stop();
    throw error;
  }
  return { rpcUrl, process: child, stop };
}

export type RunLocalTestOptions = {
  scenario: Scenario;
  foundryRoot: string;
  artifactDir?: string;
};

/**
 * Build artifacts, spawn a fresh Anvil on an ephemeral port, run the scenario
 * with Anvil default accounts (no faucet / Monad RPC / user keys), kill Anvil.
 */
export async function runLocalTest(options: RunLocalTestOptions): Promise<RunResult> {
  forgeBuild(options.foundryRoot);
  const adapter = createFoundryAdapter({
    foundryRoot: options.foundryRoot,
    artifactDir: options.artifactDir
  });
  const artifacts = adapter.loadArtifacts(deployContractsFromScenario(options.scenario.nodes));
  const accounts = mapAnvilAccounts(options.scenario.actors);
  const anvil = await startFreshAnvil(Math.max(2, Object.keys(accounts).length));
  try {
    const result = await runScenario({
      scenario: options.scenario,
      artifacts,
      accounts,
      rpcUrl: anvil.rpcUrl
    });
    return RunResultSchema.parse(result);
  } finally {
    await anvil.stop();
  }
}
