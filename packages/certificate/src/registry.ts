import type { Abi } from 'viem';

export const CertificateRegistryAbi = [
  {
    type: 'function',
    name: 'register',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'contentHash', type: 'bytes32' },
      { name: 'uri', type: 'string' }
    ],
    outputs: []
  },
  {
    type: 'function',
    name: 'registerPassport',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'passportHash', type: 'bytes32' },
      { name: 'uri', type: 'string' },
      { name: 'suiteVersion', type: 'string' }
    ],
    outputs: []
  },
  {
    type: 'function',
    name: 'get',
    stateMutability: 'view',
    inputs: [{ name: 'contentHash', type: 'bytes32' }],
    outputs: [{
      name: 'record',
      type: 'tuple',
      components: [
        { name: 'issuer', type: 'address' },
        { name: 'timestamp', type: 'uint64' },
        { name: 'uri', type: 'string' },
        { name: 'suiteVersion', type: 'string' },
        { name: 'exists', type: 'bool' }
      ]
    }]
  }
] as const satisfies Abi;

export type OnChainCertificate = {
  chainId: number;
  registryAddress: `0x${string}`;
  transactionHash: `0x${string}`;
  explorerUrl?: string;
};

export type OnChainPassportAttestation = OnChainCertificate & {
  suiteVersion: string;
};
