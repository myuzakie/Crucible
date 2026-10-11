import { RuntimeEvidenceSchema, type RuntimeEvidence } from './index.js';

export type EnvioBlock = {
  number: number;
  timestamp: number;
  hash?: string;
};

export type EnvioBlockFetcher = (fromBlock: number, toBlock: number) => Promise<EnvioBlock[]>;

export function normalizeEnvioBlockEvidence(blocks: EnvioBlock[]): RuntimeEvidence[] {
  return blocks
    .sort((left, right) => left.number - right.number)
    .map((block) => RuntimeEvidenceSchema.parse({
      type: 'block',
      source: 'rpc',
      observed: { number: block.number, timestamp: block.timestamp, ...(block.hash ? { hash: block.hash } : {}) },
      blockNumber: block.number,
      blockTimestamp: block.timestamp,
      metadata: { provider: 'envio' }
    }));
}

export async function fetchEnvioBlockEvidence(
  fetchBlocks: EnvioBlockFetcher,
  fromBlock: number,
  toBlock: number
): Promise<RuntimeEvidence[]> {
  return normalizeEnvioBlockEvidence(await fetchBlocks(fromBlock, toBlock));
}

export function buildEnvioTimestampObservation(blocks: EnvioBlock[]) {
  const ordered = [...blocks].sort((left, right) => left.number - right.number);
  if (ordered.length < 2) throw new Error('Envio timestamp verification requires at least two blocks.');
  const previous = ordered.at(-2);
  const current = ordered.at(-1);
  if (!previous || !current) throw new Error('Envio returned no adjacent blocks.');
  return {
    previousBlock: previous.number,
    previousTimestamp: previous.timestamp,
    currentBlock: current.number,
    currentTimestamp: current.timestamp
  };
}
