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

## External repo onboarding (local)

Untuk repository Foundry eksternal (target pertama: `monad-developers/scaffold-monad-foundry`):

```bash
pnpm crucible doctor --root /path/to/repo
pnpm crucible init --root /path/to/repo
pnpm crucible test --local --root /path/to/repo
```

- `doctor` hanya membaca: Node, package manager, toolchain, artifact/scenario/config, local RPC, wallet mode, dan fixture fallback.
- `init` menulis `crucible.config.json` + template `scenarios/crucible-smoke.json` bila belum ada; tidak menimpa file user dan tidak menulis secret.
- `test --local` menjalankan `forge build`, spawn Anvil fresh (port ephemeral), eksekusi scenario, tulis RunResult, lalu kill Anvil — tanpa faucet, Monad RPC, atau private key user (akun Anvil default).
- Artifact Foundry dimuat lewat adapter eksplisit (`--foundry-root` atau `crucible.config.json`); tidak menebak contract/network.
- Template bisnis pertama: `mint NFT` (`fixtures/scenarios/mint-nft.json`) → expand ke `deploy -> mint -> ownerOf`.

```bash
pnpm crucible validate fixtures/scenarios/mint-nft.json
pnpm crucible test --local \
  --scenario examples/monad-erc721-demo/scenarios/mint-nft.json \
  --foundry-root examples/monad-erc721-demo \
  --out result.json
```

## Demo freeze / final check

Run the deterministic gate before a demo:

```bash
pnpm demo:check
```

It validates the happy/buggy scenarios, RunResult fixtures, diagnosis evidence, offline certificate, Web assets, and the malformed-result fallback. It does not call Monad or require a wallet.

Recommended demo order:

1. `pnpm demo:check` — offline gate.
2. `pnpm --filter @crucible/web dev` — open the fixture viewer and select Buggy mint.
3. `pnpm test` — unit, schema, certificate, and Anvil integration checks.
4. `pnpm test:smoke:monad` — optional live testnet run with faucet-funded `.env`.
5. GitHub Actions `Monad Smoke` — manual/nightly testnet run with repository Secrets.

Known limits: the AI panel uses a deterministic cached diagnosis; live testnet depends on RPC/faucet availability and GitHub Secrets; certificate signing remains off-chain.

## Live AI diagnosis (optional)

The Web tries `/api/diagnose` for a configured server-side provider and falls back to the cached diagnosis when the endpoint is unavailable. Configure `AI_API_KEY`, `AI_MODEL`, and optional `AI_API_URL` only in the server/hosting environment; never use `VITE_*` variables for these values. The endpoint validates every model response against the RunResult evidence contract and applies an 8-second timeout.

## Hosted Web (Vercel)

`vercel.json` contains the monorepo build settings. When importing `myuzakie/Crucible` into Vercel, set **Root Directory** to the repository root (`.`), not `apps/web`; the root also contains `vercel.json` and the `/api/diagnose` function. Use the Vite preset, `pnpm install --frozen-lockfile`, build command `pnpm --filter @crucible/web build`, and output directory `apps/web/dist`. Vercel Git integration provides a Preview deployment for each pull request and a Production deployment from `main`; no Vercel token is stored in GitHub Actions.

Set `AI_API_KEY`, `AI_MODEL`, and optional `AI_API_URL` as Vercel server environment variables when live diagnosis is wanted. Do not create `VITE_*` versions of these variables. The public Web bundle is checked by `pnpm web:check` and must contain no RPC endpoint or private-key marker. Fixture diagnosis remains available if the API is not configured.

Do not import `.env.example` wholesale into Vercel. The Web viewer does not need `MONAD_TESTNET_RPC_URL`, `MONAD_CHAIN_ID`, `DEPLOYER_PRIVATE_KEY`, or `ALICE_PRIVATE_KEY`; remove those variables from the Vercel project. They belong only to the local/Monad Smoke workflow, never to the public Web deployment.

## Runtime modes

| Mode | Command / entry | Needs secrets? |
|---|---|---|
| `unit` | `pnpm test` | No |
| `local` | `pnpm crucible test --local` (or `run --network local`) | No user keys for `test --local` |
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
