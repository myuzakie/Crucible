import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { CertificateRegistryAbi, verifyCertificate } from '@crucible/certificate';
import { createPublicClient, createWalletClient, http, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const rpcUrl = process.env.LOCAL_RPC_URL ?? 'http://127.0.0.1:8545';
const privateKey = (process.env.DEPLOYER_PRIVATE_KEY ??
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80') as Hex;

async function main() {
  const artifact = JSON.parse(
    await readFile(resolve('examples/monad-certificate-registry/out/CertificateRegistry.sol/CertificateRegistry.json'), 'utf8')
  );
  const report = verifyCertificate(
    JSON.parse(await readFile(resolve('fixtures/certificate/buggy-mint.json'), 'utf8'))
  );
  const account = privateKeyToAccount(privateKey);
  const transport = http(rpcUrl);
  const publicClient = createPublicClient({ transport });
  const walletClient = createWalletClient({ account, transport });
  const chainId = await publicClient.getChainId();
  const registry = await walletClient.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode.object as Hex
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: registry });
  if (!receipt.contractAddress) throw new Error('Registry deployment did not return an address.');
  const contentHash = `0x${report.contentHash}` as Hex;
  const transactionHash = await walletClient.writeContract({
    address: receipt.contractAddress,
    abi: CertificateRegistryAbi,
    functionName: 'register',
    args: [contentHash, `crucible://certificate/${report.reportId}`]
  });
  await publicClient.waitForTransactionReceipt({ hash: transactionHash });
  const record = await publicClient.readContract({
    address: receipt.contractAddress,
    abi: CertificateRegistryAbi,
    functionName: 'get',
    args: [contentHash]
  });
  if (!record[3] || record[0].toLowerCase() !== account.address.toLowerCase()) {
    throw new Error('Registry read-back did not match the publishing wallet.');
  }
  console.log(`CERTIFICATE REGISTRY: PASSED (chain ${chainId}, ${receipt.contractAddress}, ${transactionHash})`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
