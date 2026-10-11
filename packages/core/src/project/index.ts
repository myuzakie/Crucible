import { resolve } from 'node:path';

import { detectCapabilities, type CapabilityReport } from '../capabilities/index.js';
import { listScenarioContracts, type ScenarioContract } from '../scenario-create/index.js';

export type ProjectContract = Pick<ScenarioContract, 'name' | 'artifactPath' | 'functions' | 'constructors' | 'selectionReason'>;

export type ProjectSnapshot = {
  schemaVersion: '0.1';
  project: { name: string; root: string };
  detection: CapabilityReport;
  contracts: ProjectContract[];
  contractExplorer: { available: boolean; reason?: string };
};

function projectName(root: string): string {
  return root.split(/[\\/]/).filter(Boolean).at(-1) ?? 'Crucible project';
}

export function inspectProject(rootInput = process.cwd(), name?: string): ProjectSnapshot {
  const root = resolve(rootInput);
  const detection = detectCapabilities(root);
  const foundryRoot = detection.toolchain.foundry.configPaths[0]?.split('/').slice(0, -1).join('/') || '.';
  let contracts: ProjectContract[] = [];
  let reason: string | undefined;
  try {
    contracts = listScenarioContracts(root, foundryRoot).map(({ name: contractName, artifactPath, functions, constructors, selectionReason }) => ({
      name: contractName,
      artifactPath,
      functions,
      constructors,
      selectionReason
    }));
  } catch (error) {
    reason = error instanceof Error ? error.message : String(error);
  }
  return {
    schemaVersion: '0.1',
    project: { name: name?.trim() || projectName(root), root },
    detection,
    contracts,
    contractExplorer: contracts.length ? { available: true } : { available: false, reason }
  };
}
