# Crucible

Crucible adalah platform pengujian end-to-end dApp/smart contract di Monad: scenario JSON dijalankan sebagai execution flow, hasil divisualisasikan, failure didiagnosis AI, dan report dapat disertifikasi.

## Quick start (clean clone)

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Tidak membutuhkan RPC, wallet, atau secret.

## Runtime modes

| Mode | Command / entry | Needs secrets? |
|---|---|---|
| `unit` | `pnpm test` | No |
| `local` | Anvil + `pnpm crucible run … --network local` | Anvil test keys only |
| `fixture` | `pnpm --filter @crucible/web dev` | No |
| `monad-testnet` | `pnpm test:smoke:monad` | Yes (manual/nightly) |

## Fixture / offline demo

```bash
pnpm --filter @crucible/web dev
```

Web memuat `apps/web/public/results/*.json` dan diagnosis cache. Tidak memanggil RPC dan tidak memakai private key. Fixture RunResult juga ada di `fixtures/result/`; diagnosis di `fixtures/diagnosis/`; certificate di `fixtures/certificate/`.

## Local runner

```bash
forge build --root examples/monad-erc20-demo
anvil
DEPLOYER_PRIVATE_KEY=<anvil-key> ALICE_PRIVATE_KEY=<anvil-key> \
  pnpm crucible run examples/monad-erc20-demo/scenarios/happy-path.json \
  --network local --out result.json
```

Gunakan `--rpc <url>` atau `LOCAL_RPC_URL` jika Anvil tidak di `8545`. Scenario buggy menulis `RunResult` gagal dan exit non-zero.

## Certificate (offline)

```bash
# generate a throwaway signing key (never commit the private key)
openssl genpkey -algorithm Ed25519 -out certificate-private.pem

pnpm crucible certify \
  examples/monad-erc20-demo/scenarios/buggy-mint.json \
  fixtures/result/buggy-mint.json \
  fixtures/diagnosis/buggy-mint.json \
  --key certificate-private.pem \
  --out certificate.json

pnpm crucible verify certificate.json
pnpm crucible verify fixtures/certificate/buggy-mint.json
```

Report berisi Scenario + RunResult + Diagnosis, `contentHash`, dan signature ed25519 + public key. Private key tidak boleh ada di report.

## Monad Testnet smoke (manual)

Salin `.env.example` ke `.env`, isi wallet faucet-funded, lalu:

```bash
pnpm test:smoke:monad
```

Validasi chain ID `10143`, deploy/call/assert, receipt, dan explorer link. Missing RPC/faucet dilaporkan sebagai `LIVE SMOKE: BLOCKED`. Jangan commit `.env`.

Workflow `Monad Smoke` berjalan manual dari GitHub Actions atau nightly. Set repository secrets `MONAD_TESTNET_RPC_URL`, `MONAD_CHAIN_ID` (`10143`), `DEPLOYER_PRIVATE_KEY`, dan `ALICE_PRIVATE_KEY`; result aman di-upload sebagai artifact. Workflow ini tidak dijalankan oleh pull request CI.

## Repository flow

```text
feature/fix branch -> PR ke dev -> staging -> main
```

Lihat `CONTRIBUTING.md` untuk branch, commit, Issue, dan Pull Request.

## Security notes

- Private key hanya dari environment / CI secret.
- Web dan fixture mode tidak boleh memegang private key atau mengirim transaksi.
- Jangan commit `.env`, `*.pem`, `result.json` hasil run, atau log yang berisi secret.
- Project memory lokal `CRUCIBLE_context_project/` sengaja di-ignore.
