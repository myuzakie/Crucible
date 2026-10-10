# Certificate registry

This minimal registry anchors a Crucible certificate `contentHash` on-chain. It
records the publishing wallet, timestamp, and optional URI. Ed25519 report
verification remains an offline concern; the registry is an attestation trail,
not a claim that the contract inspected the report.

```bash
forge test
forge build
```

For a testnet deployment, deploy this contract with a funded dedicated wallet,
then publish an already verified report:

```bash
forge create --root examples/monad-certificate-registry \
  --rpc-url "$MONAD_TESTNET_RPC_URL" \
  --private-key "$DEPLOYER_PRIVATE_KEY" \
  src/CertificateRegistry.sol:CertificateRegistry
pnpm crucible publish fixtures/certificate/buggy-mint.json \
  --rpc "$MONAD_TESTNET_RPC_URL" \
  --registry 0xYOUR_REGISTRY \
  --chain-id 10143 \
  --key-env DEPLOYER_PRIVATE_KEY \
  --uri https://your-public-host/certificate/buggy-mint.json
```
