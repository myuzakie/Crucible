import type { Hex } from 'viem';

export const MONAD_TESTNET = {
  chainId: 10143,
  name: 'Monad Testnet',
  rpcUrl: 'https://testnet-rpc.monad.xyz/',
  explorerUrl: 'https://testnet.monadexplorer.com/',
  faucetUrl: 'https://faucet.monad.xyz/'
} as const;

export function parsePrivateKey(value: string | undefined, name: string): Hex {
  if (!value || !/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`${name} must be a 32-byte hex private key from a test-only wallet.`);
  }
  return value as Hex;
}

export function explorerLinks(baseUrl: string, txHashes: string[], contractAddress?: string) {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return {
    transactions: txHashes.map((hash) => `${base}tx/${hash}`),
    contract: contractAddress ? `${base}address/${contractAddress}` : undefined
  };
}
