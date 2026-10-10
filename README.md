# Crucible

Crucible adalah platform pengujian end-to-end dApp/smart contract di Monad: scenario JSON dijalankan sebagai execution flow, hasil divisualisasikan, failure didiagnosis AI, dan report dapat disertifikasi.

## Development

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Local runner

Build the demo contracts, start Anvil, then run a scenario with test-only keys from Anvil:

```bash
forge build --root examples/monad-erc20-demo
anvil
DEPLOYER_PRIVATE_KEY=<anvil-key> ALICE_PRIVATE_KEY=<anvil-key> \
  pnpm crucible run examples/monad-erc20-demo/scenarios/happy-path.json \
  --network local --out result.json
```

Use `--rpc <url>` or `LOCAL_RPC_URL` when Anvil runs on another port. The buggy scenario exits non-zero after writing its failed `RunResult`.

## Repository flow

```text
feature/fix branch -> PR ke dev -> staging -> main
```

Gunakan `CONTRIBUTING.md` untuk branch, commit, Issue, dan Pull Request.

## Environment

Salin `.env.example` ke `.env` hanya jika menjalankan Monad Testnet. Private key testnet tidak boleh masuk Git.

Project memory lokal berada di `CRUCIBLE_context_project/` dan sengaja tidak ditrack.
