import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import type { Abi, Hex } from 'viem';

import { AdapterError, type ContractAdapter, type ContractArtifact } from '../types.js';

export type FoundryAdapterOptions = {
  /** Repository or package root that contains foundry.toml (absolute or relative). */
  foundryRoot: string;
  artifactDir?: string;
};

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

export function parseFoundryArtifact(raw: unknown, path: string, contract: string): ContractArtifact {
  if (!raw || typeof raw !== 'object') {
    throw new AdapterError('BUILD_FAILED', `Artifact JSON is not an object for ${contract}.`, { contract, path });
  }
  const value = raw as { abi?: unknown; bytecode?: { object?: unknown } | string };
  if (!Array.isArray(value.abi)) {
    throw new AdapterError('BUILD_FAILED', `Artifact for ${contract} is missing abi. Re-run forge build.`, {
      contract,
      path
    });
  }
  const bytecodeObject =
    typeof value.bytecode === 'string'
      ? value.bytecode
      : typeof value.bytecode?.object === 'string'
        ? value.bytecode.object
        : undefined;
  if (!bytecodeObject || bytecodeObject === '0x') {
    throw new AdapterError(
      'BUILD_FAILED',
      `Artifact for ${contract} is missing bytecode. Re-run forge build in the Foundry root.`,
      { contract, path }
    );
  }
  return { abi: value.abi as Abi, bytecode: bytecodeObject as Hex };
}

/**
 * Resolve Foundry artifacts from an explicit foundry root.
 * Path is deterministic: `<foundryRoot>/<artifactDir>/<Contract>.sol/<Contract>.json`.
 * Does not guess alternate contract names, networks, or deployment addresses.
 */
export function createFoundryAdapter(options: FoundryAdapterOptions): ContractAdapter {
  const foundryRoot = resolve(options.foundryRoot);
  const artifactDir = options.artifactDir ?? 'out';

  if (!existsSync(join(foundryRoot, 'foundry.toml'))) {
    throw new AdapterError(
      'UNSUPPORTED_TOOLCHAIN',
      `No foundry.toml at ${foundryRoot}. Pass an explicit Foundry root or run crucible init.`,
      { path: foundryRoot }
    );
  }

  function resolveArtifactPath(contract: string): string {
    if (!contract || contract.includes('/') || contract.includes('\\') || contract.includes('..')) {
      throw new AdapterError('MISSING_ARTIFACT', `Invalid contract name: ${contract}`, { contract });
    }
    return join(foundryRoot, artifactDir, `${contract}.sol`, `${contract}.json`);
  }

  function loadArtifact(contract: string): ContractArtifact {
    const path = resolveArtifactPath(contract);
    if (!isFile(path)) {
      throw new AdapterError(
        'MISSING_ARTIFACT',
        `Missing artifact for ${contract} at ${path}. Run forge build --root ${foundryRoot}.`,
        { contract, path }
      );
    }
    try {
      return parseFoundryArtifact(JSON.parse(readFileSync(path, 'utf8')), path, contract);
    } catch (error) {
      if (error instanceof AdapterError) throw error;
      throw new AdapterError('BUILD_FAILED', `Failed to parse artifact for ${contract}. Re-run forge build.`, {
        contract,
        path
      });
    }
  }

  function loadArtifacts(contracts: string[]): Record<string, ContractArtifact> {
    const unique = [...new Set(contracts)];
    return Object.fromEntries(unique.map((contract) => [contract, loadArtifact(contract)]));
  }

  return {
    kind: 'foundry',
    foundryRoot,
    artifactDir,
    resolveArtifactPath,
    loadArtifact,
    loadArtifacts
  };
}

export function deployContractsFromScenario(nodes: Array<{ type: string; contract?: string }>): string[] {
  return nodes.filter((node) => node.type === 'deploy' && node.contract).map((node) => node.contract as string);
}
