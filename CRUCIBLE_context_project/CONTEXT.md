# CRUCIBLE — Project Context

Status: `PHASE 3 — M23 Local-First Product Topology`
Last updated: 2026-10-13

## Agent resume state

Last completed: `P0.0–P8.1, P9.1–P9.5, P10.1–P10.5, P10.5-U1–U5, P10.6–P10.10, P10.11–P10.16, P10.17–P10.24, M21-B, M21-C, M21-D, M21-A UX follow-up, M23.0, M23.1, M23.2, M23.3, M23.4`.
Last merged to `main`: P9.5 release `9cfcf17`; P9.4 release `332cd24`; P9.3 release `5bb15d0`.
Next action: `M23.5` — serve the Local Web build from the workspace server; never use a personal wallet or paste keys into chat.
Current local environment: Node 24, pnpm 12.4.1, TypeScript, Zod, Foundry 1.8.5; root checks, `forge build/test`, and Anvil integration pass. Ensure `~/.foundry/bin` is on `PATH` for local Anvil tests.
Blockchain tools: Foundry, forge, cast, and Anvil are installed. Local runner uses `http://127.0.0.1:8545` by default or `--rpc`/`LOCAL_RPC_URL`. `crucible test --local` spawns a fresh Anvil on an ephemeral port and kills it on exit.
Memory rule: after every task update `PLAN.md`, `CHANGELOG.md`, and `FIX_LOG.md` when a bug or process miss occurred.

Web state: `apps/web` is a Vite/React fixture viewer. It loads `public/results/*.json`; it must not hold private keys or call RPC. P4.1 was intentionally delivered fixture-first so UX can be tested before the runner exists.

M21-D state: the local runner can generate a signed Passport from a verified before/after replay, persist non-secret state under `crucible/results/m21d-state.json`, recover it through `GET /state`, and publish through `POST /passport/publish`. Passport signing and registry keys remain environment-only on the runner. The Web retries runner requests once and exposes generation/download/local publish controls only after `runtime-verified` replay.

Contract state: `examples/monad-erc20-demo` contains `Token.sol` and `BuggyToken.sol`; `examples/monad-erc721-demo` contains `Collectible.sol`; `examples/monad-certificate-registry` contains the immutable certificate registry. CI builds/tests all three.

Scenario state: `examples/monad-erc20-demo/scenarios/{happy-path,buggy-mint}.json` are schema-valid deploy→call→assert flows. Offline RunResult fixtures live in `fixtures/result/`.

Runner state: `packages/core/src/runner` executes deploy/call/assert through viem and skips nodes whose dependencies failed. `packages/core/src/runner/local.integration.test.ts` starts fresh Anvil chains and is included in `pnpm test`. User CLI usage is `pnpm dlx @ohmuzakie/crucible-cli@latest test`; advanced `run` flags remain supported and actor keys are read only from scenario-referenced environment variables.

Monad smoke state: `pnpm test:smoke:monad` passed live with chain ID 10143, faucet-funded wallets, deploy/call/assert, receipts, and explorer links. Never paste keys into chat or commit them.

Web UX state: `apps/web` remains offline and fixture-only. P4.2 adds replay that stops at the first failed node, click-to-select detail, loading/empty/error states, and responsive controls. It does not call RPC or require private keys.

## M23 — Local-First Product Topology

M23 freezes the product boundary without changing Scenario, RunResult,
RuntimeFinding, Replay, Passport, Monad rules, Foundry adapter, or runtime
verification semantics.

Current architecture before M23:

```text
Hosted Vercel Web -> browser fetches localhost runner
Local CLI         -> runner API only
Local Web         -> separately served workspace/fixture app
```

Target architecture:

```text
Public Vercel Web -> landing + deterministic demo + install/docs
                   (never a real repository workspace or localhost client)

Local CLI/Runner  -> execution plane on localhost
Local Web         -> actual developer workspace on the same localhost origin
                    http://127.0.0.1:<port>/
                    http://127.0.0.1:<port>/api/*
```

M23.0, M23.1, M23.2, M23.3, and M23.4 are complete. The next active task is M23.5. Web builds now
require explicit `VITE_CRUCIBLE_MODE=public` or `VITE_CRUCIBLE_MODE=local`;
missing and unknown values fail during Vite build/dev configuration loading.
Public builds select a minimal `PublicApp` surface, while local builds reuse
the existing `ProjectOnboarding` workspace. The public fixture query remains
available for the transition until M23.9.
Normal Local Web requests now use relative canonical `/api/*` paths through a
single API client. The M23.4 workspace server composes a dedicated runner API
handler with a static Web handler on one localhost origin; explicit runner URLs
remain only as legacy/development compatibility overrides.
Local signing/private keys remain environment-only, and the local workspace
remains localhost-only.

AI state: `packages/ai` defines `DiagnosisRequestSchema`, `DiagnosisSchema`, and exact evidence validation against `RunResult`. `fixtures/diagnosis/buggy-mint.json` and `apps/web/public/diagnosis/buggy-mint.json` are deterministic offline cache. Web keeps the RunResult visible when diagnosis is unavailable.

Certificate state: `@crucible/certificate` hashes Scenario + RunResult + Diagnosis, signs with ed25519, verifies offline, and exports the registry ABI. CLI: `pnpm crucible certify|verify|publish`; `publish` verifies first, checks chain ID, and adds optional on-chain transaction metadata without private keys. Registry has fresh-Anvil CI coverage; Monad publication is opt-in/manual.

Workflow state: `.github/workflows/monad-smoke.yml` is not part of pull request CI. It runs on `workflow_dispatch` or nightly, validates `MONAD_TESTNET_RPC_URL`, `MONAD_CHAIN_ID`, `DEPLOYER_PRIVATE_KEY`, and `ALICE_PRIVATE_KEY` without printing values, then uploads the safe smoke result artifact.

Capability state: `packages/core/src/capabilities` detects Foundry/Hardhat/Scaffold-ETH hints, package manager, artifact/scenario/config candidates, and returns schema-valid statuses. CLI: `pnpm crucible detect [--root path] [--json]`. Hardhat is detected but unsupported. Fixtures live in `fixtures/capabilities/`.

Config/onboarding state: `packages/core/src/config` owns `CrucibleConfigSchema` (`scenario` optional), `initCrucible` (idempotent, no overwrite, no secrets, no hardcoded Token scenario), and `runDoctor` (Node, PM, toolchain, artifacts, local RPC probe, wallet mode, fixture fallback). Init returns `MISSING_SCENARIO` + detected contracts when no scenario exists. CLI: `pnpm crucible doctor|init [--root] [--json]`. README has external-repo onboarding section.

Adapter state: `packages/core/src/adapters` — Foundry-only `createFoundryAdapter`; path deterministic `<foundryRoot>/out/<Contract>.sol/<Contract>.json`; `AdapterError` statuses `MISSING_ARTIFACT` | `BUILD_FAILED` | `UNSUPPORTED_TOOLCHAIN`. CLI `run` requires `--foundry-root` or `crucible.config.json`.

Template state: optional `scenario.metadata.{businessFlow,label}`; `mint NFT` template expands to deploy→mint→ownerOf; fixtures at `fixtures/scenarios/mint-nft.json` and `examples/monad-erc721-demo/scenarios/mint-nft.json`.

Local test state: `pnpm dlx @ohmuzakie/crucible-cli@latest test` — auto-detects config/Foundry root/artifacts, runs preflight, forge build, fresh Anvil, and Anvil default accounts (no faucet/Monad RPC/user keys), then writes `crucible/results/latest.json`. `--root`, `--foundry-root`, `--scenario`, and `--out` remain advanced options; no scenario is invented.

CLI UI state: `packages/cli/src/ui.ts` and `packages/cli/logo.txt` provide an interactive monochrome landing launcher, immutable logo asset, compact no-gutter layout, right-column menu on wide terminals, stacked fallback on narrow terminals, keyboard navigation with in-place selection updates, explicit Enter-to-return command lifecycle, single failure-state handling for pre-RunResult errors, help layout, question prompts, URL/result panel, TTY-only spinner, and alternate-screen lifecycle restoration. `--json` remains machine-readable without UI decoration; `NO_COLOR=1` disables terminal styling while retaining layout. `--json`/interactive command output does not attempt to load a result file unless a successful run produced one; long-running commands remain active until they exit.

Demo freeze state: `pnpm demo:check` validates scenarios, RunResult fixtures, diagnosis evidence, certificate fixture, Web assets, and malformed-result fallback without RPC/wallet. Full local verification passes. GitHub Monad Smoke run `38079491346` succeeded and uploaded its artifact.

External acceptance state: `/tmp/scaffold-monad-foundry` was cloned and built with `forge build`; published `@ohmuzakie/crucible-cli@0.2.2` selects `YourContract`, creates a human-friendly greeting scenario, local `test` passes deploy→call→assert, writes `crucible/results/latest.json`, and `web` loads it. Port `5173` must be free for the default viewer. PR #55 merged to `dev`, PR #54 promoted to `staging`, and PR #56 promoted to `main`. Monad Testnet dry-run passed with RPC `https://testnet-rpc.monad.xyz/` and chain ID `10143`; no build, deployment, transaction, or key was used.

Viewer UX follow-up state: CLI `web` now auto-falls back from occupied port `5173` to an ephemeral port, attaches the matching scenario business flow, and verifies/downloads an optional offline certificate report. The public launcher is `pnpm dlx @ohmuzakie/crucible-cli@latest`; `pnpm crucible` remains available only when the target repository defines a local script/dependency.

Release state: P9.3 merged via PR #39 and promotions #40/#41; P9.4 via #43/#44/#45; P9.5 via #47/#48/#49. All required CI, Vercel, contract tests, and fresh-Anvil checks passed. `main` is the public default branch. Branch protection is enabled on `dev`, `staging`, and `main` with required `checks`, no force-push/deletion, and PR-only changes. Current remote release commit: `main=9cfcf17`.

Phase 2 state: P9.1–P9.5 and P10.1–P10.5 engine work are complete. P10.5-U1–U5 are complete: local test default, actionable preflight, safe init, one-command orchestration, and friendly output/JSON/docs.

Phase 3 state: P10.6–P10.10 implementation complete. P10.10 adds opt-in guarded Monad Testnet mode with dry-run, chain verification, explicit confirmation, environment-only keys, and redacted actionable statuses. Full local suite and typecheck pass. Live testnet smoke remains a manual funded-wallet gate.

Phase 2 sequence:

```text
P10.1 capability detector
  -> P10.2 doctor and init
  -> P10.3 Foundry adapter
  -> P10.4 one business-flow scenario
  -> P10.5 one-command local test
  -> P10.5-U1..U5 onboarding UX improvement
  -> P10.6 public CLI package
  -> P10.7 scenario create wizard
  -> P10.8 local web viewer command
  -> P10.9 three-repository acceptance automation
  -> P10.10 guarded Monad testnet
```

## P10.10 operator contract

Local mode remains the default and is safe to run on a clone:

```bash
pnpm crucible test --root <repo>
```

Monad Testnet must be explicit. First run a read-only check:

```bash
pnpm crucible test --network monad-testnet --dry-run \
  --root <repo> --foundry-root <foundry-package> --scenario <scenario.json>
```

Only a developer who intentionally wants to spend testnet gas may run with `--confirm-testnet` and environment keys referenced by the scenario. Keys must never appear in CLI arguments, scenario files, result files, logs, or chat.

The first manual acceptance target is `monad-developers/scaffold-monad-foundry`. Do not start with all three repositories, frontend click automation, Hardhat support, or Monad Testnet writes. The first proof is that a developer can clone one repository and understand its Crucible status and local scenario result.

## Phase 3 target

The intended public flow is:

```bash
cd <dapp-repository>
pnpm dlx @ohmuzakie/crucible-cli test
```

If no business scenario exists:

```bash
pnpm dlx @ohmuzakie/crucible-cli scenario create
pnpm dlx @ohmuzakie/crucible-cli test
  pnpm dlx @ohmuzakie/crucible-cli web
```

During development, npm publication is not required. The same flow must first work from a packed `.tgz` package or a local workspace package. Public npm publishing is a release step after package smoke tests, not a dependency for implementation.

## Phase 2 UX target

The intended first-run experience is:

```bash
cd <dapp-repository>
pnpm dlx crucible test
```

The developer should not need to edit JSON, know artifact paths, know the internal contract name `Token`, or understand `foundryRoot`. Advanced flags remain available for debugging, but the happy path must detect the toolchain, validate prerequisites, explain missing business scenarios, and never generate a misleading runnable scenario.

## Product

Crucible adalah platform pengujian end-to-end dApp/smart contract di Monad. Developer menulis scenario sebagai execution flow, Crucible menjalankan deploy/call/assert, menampilkan hasil secara visual, memberi diagnosis dan saran patch dari AI, lalu membuat certificate report.

Prioritas produk: **UX yang jelas** dan **AI-assisted debugging**.

Graf hanya visualisasi hasil eksekusi. Crucible bukan workflow builder drag-and-drop seperti n8n.

## Target vertical slice

```text
scenario.json -> validate -> deploy -> call -> assert -> result.json
             -> Web result viewer -> AI diagnosis -> signed certificate report
```

Demo pertama memakai dua target dengan ABI serupa:

- `Token.sol`: implementasi benar, scenario lulus.
- `BuggyToken.sol`: `mint` tidak mengubah saldo, scenario gagal deterministik.

Cerita demo: jalankan scenario buggy, graf berhenti pada node merah, AI menunjukkan evidence dari assertion, patch diterapkan, lalu run ulang menjadi hijau.

## Repository boundary

Repository utama berada di `/home/muzakie/Workspace/projects/hackaton/monad`.

Folder `CRUCIBLE_context_project` hanya untuk memori dan instruksi proyek. Kode aplikasi nanti berada di root repository:

```text
packages/core         # schema, runner, assertion, report
packages/ai           # diagnosis contract + evidence guardrail
packages/certificate  # signed offline certificate report
packages/cli          # crucible validate|run|certify|verify
apps/web              # viewer result.json + diagnosis/certificate download
examples/             # target demo yang berpura-pura sebagai proyek pengguna eksternal
```

`examples/monad-erc20-demo` diperlakukan seperti consumer eksternal: core tidak boleh mengimpor implementasi internal demo.

## Runtime modes

1. `unit`: schema, ordering, assertion, report; tanpa blockchain.
2. `local`: Anvil; development dan CI pull request.
3. `monad-testnet`: RPC nyata; manual/nightly, membutuhkan wallet testnet.
4. `fixture`: result.json dan diagnosis cache; fallback saat RPC/AI bermasalah.

Monad Testnet:

```text
RPC: https://testnet-rpc.monad.xyz/
Chain ID: 10143
Currency: MON
Explorer: https://testnet.monadexplorer.com/
```

Private key hanya dari environment/CI secret. Jangan masuk source, fixture, result, atau log.

## Scope

### Must

- Scenario JSON dengan node `deploy`, `call`, `assert`.
- Runner dengan dependency `after` dan status `passed|failed|skipped`.
- RunResult JSON tervalidasi.
- CLI yang menulis result dan ringkasan terminal.
- Happy path dan buggy path.
- Local integration test dan Monad smoke test.
- Web graf hasil dan detail node.
- AI diagnosis berbasis evidence dari RunResult.
- Signed off-chain certificate report.

### Deferred

- Multi-chain, auth, billing.
- Drag-drop scenario builder.
- Riwayat run dan perbandingan advanced.

## Non-negotiable engineering decisions

- `RunResult` adalah kontrak antar core, CLI, Web, AI, dan certificate.
- Schema memiliki `schemaVersion`.
- Web membaca result; Web tidak memegang private key dan tidak mengirim transaksi.
- CI pull request tidak membutuhkan secret atau akses Monad.
- Monad smoke test gagal dengan pesan jelas jika env belum tersedia.
- Jika trace tidak tersedia, gunakan receipt, revert reason, dan event logs.
- Setiap perubahan besar dicatat di `CHANGELOG.md`; setiap bug/fix di `FIX_LOG.md`.

## Known risks and fallback

- RPC/faucet bermasalah: jalankan local/fixture mode dan simpan hasil testnet terakhir.
- AI output tidak valid: schema parser + cached diagnosis.
- Trace tidak tersedia: receipt, revert reason, dan event logs.
- Scope melebar: prioritaskan vertical slice; on-chain certificate dan builder tetap deferred.

## Source of truth rule

Jika instruksi chat bertentangan dengan file ini, agent harus menyebutkan konflik sebelum coding. Keputusan baru harus mengubah `CONTEXT.md`, menambah entry `CHANGELOG.md`, dan bila berupa bug menambah `FIX_LOG.md`.

## Short-prompt execution rule

User may invoke a task with only its ID, for example `Kerjakan P10.1`. The agent must use `PLAN.md` and this file as the complete specification. The agent must not ask the user to repeat scope, target files, tests, or acceptance criteria that are already documented here.

For every task:

1. Read this file and the requested task in `PLAN.md`.
2. Inspect repository state and preserve unrelated changes.
3. Change only the task scope unless a documented dependency requires a small adjacent change.
4. Run every listed test, or record the exact blocker.
5. Update task status, checklist, `Last completed`, and `CHANGELOG.md`.
6. Update `FIX_LOG.md` only when a bug or process failure was actually fixed.
7. Report changed files, tests, result, and the next task in a compact handoff.

Implement the smallest vertical slice that proves the task. Do not expand from local mode to testnet, UI automation, or three-repository automation unless the active task explicitly requires it.

## Git workflow rule

- Remote utama: `origin` -> `https://github.com/myuzakie/Crucible.git`.
- Branch tetap: `main` untuk release, `staging` untuk kandidat demo, `dev` untuk integrasi harian.
- Semua pekerjaan memakai branch: `feat/<short-name>`, `fix/<short-name>`, `chore/<short-name>`, atau `docs/<short-name>`.
- Pull request diarahkan ke `dev`; promosi dilakukan `dev` -> `staging` -> `main`.
- Commit message singkat dan faktual, contoh: `Add runner schema`, `Fix skipped node status`.
- Jangan memasukkan `CRUCIBLE_context_project/` ke Git; folder itu memori lokal proyek.
- Jangan memasukkan nama AI, Cursor, ChatGPT, atau agent ke commit, author metadata, komentar source, atau tracking history.

## Environment map

```text
unit       -> pnpm test; no RPC, wallet, or secret
local      -> Anvil; deterministic deploy/call/assert
testnet    -> Monad RPC + GitHub/local secrets; manual/nightly only
fixture    -> committed result.json; offline Web/AI demo
```

Required names:

```text
MONAD_TESTNET_RPC_URL
MONAD_CHAIN_ID
DEPLOYER_PRIVATE_KEY
ALICE_PRIVATE_KEY
```

Never commit `.env`, private keys, RPC tokens, or generated result files containing secrets.
