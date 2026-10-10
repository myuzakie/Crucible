import { fileURLToPath } from 'node:url';

const required = [
  'MONAD_TESTNET_RPC_URL',
  'MONAD_CHAIN_ID',
  'DEPLOYER_PRIVATE_KEY',
  'ALICE_PRIVATE_KEY'
];

export function validateMonadEnvironment(env: Record<string, string | undefined> = process.env) {
  const missing = required.filter((name) => !env[name]);
  if (missing.length) throw new Error(`Missing Monad smoke secrets: ${missing.join(', ')}`);
  if (env.MONAD_CHAIN_ID !== '10143') {
    throw new Error(`Expected MONAD_CHAIN_ID 10143 but received ${env.MONAD_CHAIN_ID}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    validateMonadEnvironment();
    console.log('Monad smoke environment is configured.');
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
