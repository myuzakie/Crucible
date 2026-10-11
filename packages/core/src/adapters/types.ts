import type { Abi, Hex } from 'viem';

export type ContractArtifact = {
  abi: Abi;
  bytecode: Hex;
};

export type AdapterStatus = 'MISSING_ARTIFACT' | 'BUILD_FAILED' | 'UNSUPPORTED_TOOLCHAIN' | 'MISSING_TOOL';

export class AdapterError extends Error {
  readonly status: AdapterStatus;
  readonly contract?: string;
  readonly path?: string;

  constructor(status: AdapterStatus, message: string, details?: { contract?: string; path?: string }) {
    super(message);
    this.name = 'AdapterError';
    this.status = status;
    this.contract = details?.contract;
    this.path = details?.path;
  }
}

export type ContractAdapter = {
  readonly kind: 'foundry';
  readonly foundryRoot: string;
  readonly artifactDir: string;
  resolveArtifactPath(contract: string): string;
  loadArtifact(contract: string): ContractArtifact;
  loadArtifacts(contracts: string[]): Record<string, ContractArtifact>;
};
