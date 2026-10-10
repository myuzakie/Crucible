import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  runScenario,
  explorerLinks,
  MONAD_TESTNET,
  parsePrivateKey,
  ScenarioSchema,
  RunResultSchema
} from '../packages/core/src/index.js';
import { privateKeyToAccount } from 'viem/accounts';
import { createPublicClient, defineChain, formatEther, http, type Hex } from 'viem';

const resultPath = process.env.MONAD_SMOKE_RESULT_PATH ?? '/tmp/crucible-monad-smoke-result.json';
const minimumGasBalance = 1_000_000_000_000_000n;

function artifact(contract: string) {
  return readFile(resolve(`examples/monad-erc20-demo/out/${contract}.sol/${contract}.json`), 'utf8')
    .then((value) => JSON.parse(value))
    .then((value) => ({ abi: value.abi, bytecode: value.bytecode.object as Hex }));
}

function chain(rpcUrl: string) {
  return defineChain({
    id: MONAD_TESTNET.chainId,
    name: MONAD_TESTNET.name,
    nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } }
  });
}

async function main() {
  const rpcUrl = process.env.MONAD_TESTNET_RPC_URL || MONAD_TESTNET.rpcUrl;
  const configuredChainId = Number(process.env.MONAD_CHAIN_ID || MONAD_TESTNET.chainId);
  if (configuredChainId !== MONAD_TESTNET.chainId) {
    throw new Error(`Expected Monad chain ID ${MONAD_TESTNET.chainId} but MONAD_CHAIN_ID is ${configuredChainId}`);
  }

  const deployer = privateKeyToAccount(parsePrivateKey(process.env.DEPLOYER_PRIVATE_KEY, 'DEPLOYER_PRIVATE_KEY'));
  const alice = privateKeyToAccount(parsePrivateKey(process.env.ALICE_PRIVATE_KEY, 'ALICE_PRIVATE_KEY'));
  const publicClient = createPublicClient({ chain: chain(rpcUrl), transport: http(rpcUrl) });

  const actualChainId = await publicClient.getChainId();
  if (actualChainId !== MONAD_TESTNET.chainId) {
    throw new Error(`Expected Monad chain ID ${MONAD_TESTNET.chainId} but RPC returned ${actualChainId}`);
  }
  console.log('RPC OK');
  console.log(`Chain ID: ${actualChainId}`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Alice: ${alice.address}`);

  const balances = await Promise.all([
    publicClient.getBalance({ address: deployer.address }),
    publicClient.getBalance({ address: alice.address })
  ]);
  console.log(`Deployer balance: ${formatEther(balances[0])} MON`);
  console.log(`Alice balance: ${formatEther(balances[1])} MON`);

  const scenario = ScenarioSchema.parse(JSON.parse(await readFile(resolve('examples/monad-erc20-demo/scenarios/happy-path.json'), 'utf8')));
  const stateChangingActors = scenario.nodes.filter((node) => node.type === 'call').map((node) => node.from);
  const requiredBalances = new Set(['deployer', ...stateChangingActors]);
  const accountBalances = { deployer: balances[0], alice: balances[1] };
  for (const actor of requiredBalances) {
    if ((accountBalances[actor as keyof typeof accountBalances] ?? 0n) < minimumGasBalance) {
      const address = actor === 'deployer' ? deployer.address : alice.address;
      throw new Error(`Monad smoke test blocked: ${actor} wallet has insufficient MON for gas. Fund address: ${address}`);
    }
  }

  const result = RunResultSchema.parse(await runScenario({
    scenario,
    rpcUrl,
    chainId: MONAD_TESTNET.chainId,
    networkName: 'monad-testnet',
    explorerUrl: MONAD_TESTNET.explorerUrl,
    accounts: { deployer: parsePrivateKey(process.env.DEPLOYER_PRIVATE_KEY, 'DEPLOYER_PRIVATE_KEY'), alice: parsePrivateKey(process.env.ALICE_PRIVATE_KEY, 'ALICE_PRIVATE_KEY') },
    artifacts: { Token: await artifact('Token') }
  }));
  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`);

  if (result.status !== 'passed') {
    console.log(`LIVE SMOKE: FAILED\nResult: ${resultPath}`);
    process.exitCode = 1;
    return;
  }

  const deployment = result.nodes.find((node) => node.id === 'deploy');
  const deploymentAddress = typeof deployment?.receipt === 'object' && deployment.receipt !== null && 'contractAddress' in deployment.receipt
    ? String(deployment.receipt.contractAddress)
    : undefined;
  const hashes = result.nodes.flatMap((node) => node.txHash ? [node.txHash] : []);
  const links = explorerLinks(MONAD_TESTNET.explorerUrl, hashes, deploymentAddress);
  console.log(`Deploy transaction: ${hashes[0]}`);
  console.log(`Contract: ${deploymentAddress}`);
  console.log('Deployment receipt: success');
  console.log(`Call transaction: ${hashes[1]}`);
  console.log('Call receipt: success');
  console.log('Assertion: passed');
  console.log(`Explorer: ${JSON.stringify(links)}`);
  console.log(`Result: ${resultPath}`);
  console.log('LIVE SMOKE: PASSED');
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  const blocked = message.includes('RPC') || message.includes('fetch') || message.includes('ECONN') || message.includes('insufficient') || message.includes('private key');
  console.error(`${blocked ? 'LIVE SMOKE: BLOCKED' : 'LIVE SMOKE: FAILED'}\n${message}`);
  process.exitCode = blocked ? 2 : 1;
});
