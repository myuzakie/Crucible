# CRUCIBLE — Development Plan

Dokumen ini adalah antrean kerja utama. Setiap task memiliki ID stabil agar dapat dijalankan dengan prompt singkat, misalnya: **"Kerjakan task P0.1"**.

## Cara menggunakan plan

Agent wajib:

1. Baca `CONTEXT.md`.
2. Baca task ID yang diminta.
3. Cek status repository dan perubahan yang belum selesai.
4. Hanya mengubah `Target files` task tersebut.
5. Menjalankan semua `Tests`.
6. Mengubah status task dan menulis `CHANGELOG.md`.
7. Jika memperbaiki bug, menulis `FIX_LOG.md`.
8. Sebelum handoff, update checklist dan `Last completed` di `CONTEXT.md`.

Status task: `TODO`, `READY`, `IN_PROGRESS`, `BLOCKED`, `DONE`.

## Protokol eksekusi langsung dan analisis berbasis perubahan

Bagian ini menjadi aturan operasional ketika user memberikan perintah eksekusi
setelah context, fix log, dan plan sudah pernah dibaca. Tujuannya adalah menjaga
fokus pada task yang diminta tanpa mengulang analisis repository yang tidak
berubah, sekaligus mencegah tabrakan dengan agen lain.

### 1. Analisis awal satu kali

Sebelum task pertama dalam satu rangkaian eksekusi:

1. Baca `CONTEXT.md`, task terkait di `PLAN.md`, dan entry terbaru
   `CHANGELOG.md`/`FIX_LOG.md` bila tersedia.
2. Catat secara internal: task ID, status, target files, tests, acceptance
   criteria, branch, dan perubahan worktree yang sudah ada.
3. Tetapkan `execution snapshot` untuk rangkaian tersebut. Snapshot berisi
   commit/branch saat mulai, target task, dan daftar file yang sudah berubah.

Setelah snapshot terbentuk, prompt lanjutan seperti `eksekusi`, `lanjutkan`,
atau `fix sesuai task` langsung memakai snapshot. Jangan mengulang pembacaan
seluruh context atau eksplorasi repository bila tidak ada pemicu re-analisis.

### 2. Mode eksekusi fokus

Pada mode ini agent harus:

- mengerjakan hanya task ID yang diminta dan acceptance criteria-nya;
- mengubah target files yang tercantum di task;
- memakai dependency task yang sudah dinyatakan, tanpa membuka feature baru;
- menjalankan test yang tercantum setelah perubahan minimal selesai;
- memperbarui status/checklist dan memory docs setelah hasil terverifikasi;
- tidak melakukan refactor, routing rewrite, polish UX, atau release action yang
  tidak menjadi bagian task.

Jika task tidak memiliki ID tetapi memiliki deskripsi yang jelas, buat scope
eksekusi sementara dari deskripsi tersebut dan jangan memperluasnya. Jika
deskripsinya tidak cukup untuk menentukan file atau acceptance criteria, berhenti
sebelum coding dan minta task ID atau target yang tepat.

### 3. Kapan analisis wajib diulang

Ulangi analisis hanya jika salah satu kondisi berikut terjadi:

1. Perubahan yang diperlukan melewati satu file atau target files task tidak
   lagi mencakup file yang dibutuhkan.
2. Ada perubahan kode baru sejak snapshot, termasuk perubahan dari agen lain.
3. Test gagal dengan gejala yang menunjukkan dependency atau kontrak berbeda
   dari yang tercatat di task.
4. User mengubah acceptance criteria, task ID, branch, atau meminta fitur baru.
5. Perubahan menyentuh schema/RunResult, API publik, network/testnet, secret,
   database, migration, atau file yang berdampak lintas package.
6. Git conflict, generated file drift, atau file target ternyata sedang diubah
   agen lain.

Analisis ulang harus dibatasi pada file dan dependency yang memicu kondisi itu;
tidak perlu mengulang seluruh repository. Setelah analisis ulang, buat snapshot
baru sebelum melanjutkan.

### 4. Aturan perubahan satu file versus banyak file

Untuk task satu-file, lakukan patch langsung setelah collision check singkat.
Tidak perlu audit arsitektur ulang.

Untuk task multi-file, lakukan impact map ringkas sebelum patch:

```text
task -> source files -> contracts/types -> tests -> docs/logs
```

Pastikan setiap file tambahan punya alasan yang dapat ditulis dalam handoff.
Jangan memasukkan file yang hanya kebetulan berdekatan atau sudah berubah oleh
agen lain.

Perubahan pada `CONTEXT.md`, `PLAN.md`, `CHANGELOG.md`, atau `FIX_LOG.md` adalah
memory update, bukan izin untuk memperluas scope kode. Update hanya setelah
implementasi/test selesai, kecuali user secara khusus meminta plan-only.

### 5. Collision gate sebelum coding

Collision check harus singkat dan selalu dilakukan, meskipun analisis tidak
diulang:

```bash
git status --short --branch
git diff --name-only
```

Jika file target task sudah berubah sebelum sesi ini atau sedang berubah oleh
agen lain:

- jangan overwrite, reset, stash, atau checkout perubahan tersebut;
- kerjakan file non-overlap hanya bila acceptance criteria tetap terpenuhi;
- bila target utama overlap, laporkan collision dan tunggu arahan atau gunakan
  patch yang benar-benar terisolasi.

Status worktree yang sama dengan snapshot tidak dianggap sebagai alasan untuk
mengulang analisis penuh.

### 6. Urutan kerja standar saat user meminta eksekusi

```text
execution snapshot tersedia
        |
        v
collision check singkat
        |
        v
patch target task saja
        |
        v
run listed tests
        |
   +----+----+
   |         |
 pass      fail
   |         |
 update    targeted re-analysis
 docs      only when triggered
   |
 handoff singkat
```

Handoff wajib menyebutkan file berubah, test dan hasilnya, blocker bila ada,
serta task berikutnya. Handoff tidak perlu mengulang isi context atau alasan
arsitektur yang tidak berubah.

### 7. Prioritas ketika instruksi bertentangan

Urutan prioritas operasional adalah:

1. instruksi user terbaru yang eksplisit;
2. security dan perlindungan secret;
3. collision protection terhadap pekerjaan agen lain;
4. task/acceptance criteria di `PLAN.md`;
5. aturan umum di `CONTEXT.md` dan log proyek.

Jika instruksi user meminta langsung eksekusi tetapi target file bertabrakan,
agent boleh melakukan pemeriksaan read-only dan menyiapkan impact map, namun
tidak boleh menimpa kode agen lain tanpa arahan eksplisit.

## Milestone map

| Milestone | Goal | Exit criteria |
|---|---|---|
| M0 | Repository siap dikembangkan | install, lint, typecheck, test, build tersedia |
| M1 | Kontrak data beku | Scenario dan RunResult valid serta dites |
| M2 | Engine lokal berjalan | happy/buggy menghasilkan result.json valid |
| M3 | Monad siap diverifikasi | smoke deploy/call/assert atau fallback terdokumentasi |
| M4 | Web usable | graf dan detail menampilkan kedua result |
| M5 | AI debugging | failure menghasilkan diagnosis evidence-based |
| M6 | Certificate | report signed dan dapat diverifikasi |
| M7 | Public development ready | clone baru, CI PR, testnet manual workflow |
| M8 | Demo ready | vertical slice lengkap, fixture fallback, README |
| M9 | External repository onboarding | one manually cloned Foundry dApp can be diagnosed, configured, and tested locally through the Crucible CLI |
| M10 | Phase 2 onboarding UX | a developer can run one clear command and receive a truthful, actionable result without editing internal JSON |
| M21-D | Trust and acceptance | Web can generate a signed Passport through the local runner, persist/recover it, publish it locally, and pass external/production gates |

## Dependency order

```text
P0.1 -> P0.2 -> P0.3
             ├-> P1.1 -> P1.2
             ├-> P2.1 -> P2.2 -> P2.3
             └-> P3.1
P1.2 + P2.3 -> P3.2
P2.3 -> P4.1 -> P4.2
P2.3 + P4.2 -> P5.1 -> P5.2
P5.2 -> P6.1
semua -> P7.1 -> P7.2 -> P8.1
P10.1 -> P10.2 -> P10.3 -> P10.4 -> P10.5
P10.5 -> P10.5-U1 -> P10.5-U2 -> P10.5-U3 -> P10.5-U4 -> P10.5-U5
P10.5-U5 -> P10.6 -> P10.7 -> P10.8 -> P10.9 -> P10.10
```

## Task queue

### P0.0 — Repository governance baseline

Status: `DONE`

Output: remote `origin`, baseline branch `main`, workflow branch `staging` dan `dev`, branch naming, commit convention, issue/PR templates, `.cursor/rules/ponytail.mdc`, dan `.gitignore` untuk context lokal.

Validation:

```bash
git remote -v
git branch --list
git check-ignore CRUCIBLE_context_project/CONTEXT.md
```

### P0.0.1 — Solo developer pull request workflow

Status: `DONE` | Depends: `P0.0`

Untuk setiap feature/fix/chore/docs: buat branch dari `dev`, commit kecil, jalankan checks, buka PR ke `dev`, lalu merge/promote sesuai urutan. Gunakan GitHub Issue untuk bug dan feature yang lebih besar dari satu perubahan kecil.

Checklist:

- [x] Branch khusus untuk perubahan.
- [x] Issue dibuat untuk pekerjaan lintas task kecil.
- [x] PR diarahkan ke `dev`.
- [x] CI lulus sebelum merge.

Done when: perubahan tidak langsung masuk `main`; PR memiliki summary, checks, scope, dan risk.

### P0.1 — Initialize repository foundation

Status: `DONE`

Target files: `package.json`, `pnpm-workspace.yaml`, `tsconfig*.json`, lint/format config, `.gitignore`, empty package scaffolds.

Work: buat pnpm workspace TypeScript strict dengan commands root: `lint`, `typecheck`, `test`, `build`.

Tests:

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Done when: semua command exit 0 tanpa RPC, wallet, atau secret.

Checklist: [x] install [x] lint [x] typecheck [x] test [x] build.

Completed: baseline commit `Initialize repository foundation`; branch `main`, `staging`, `dev`; remote GitHub; local checks all pass.

### P0.2 — Add project structure and environment contract

Status: `DONE` | Depends: `P0.1`

Target files: `packages/core`, `packages/cli`, `apps/web`, `examples`, `.env.example`, root README.

Work: buat struktur package, document local/testnet/fixture mode, dan env names untuk Monad.

Tests: clean clone dapat menjalankan install dan checks dari P0.1.

Done when: struktur boundary jelas dan tidak ada secret tracked.

Checklist: [x] packages [x] apps/web [x] env example [x] README [x] context ignored.

Completed: workspace packages, `.env.example`, README, dan runtime boundary tersedia.

### P0.3 — Add public CI baseline

Status: `DONE` | Depends: `P0.2`

Target files: `.github/workflows/ci.yml`.

Work: workflow pull request untuk install, lint, typecheck, unit test, dan build tanpa secret.

Tests: validasi YAML dan jalankan command workflow secara lokal.

Done when: CI PR tidak memerlukan Monad RPC.

Checklist: [x] PR trigger [x] push trigger [x] frozen install [x] lint [x] typecheck [x] test [x] build.

Completed: `.github/workflows/ci.yml` menjalankan install, lint, typecheck, test, dan build.

### P1.1 — Define Scenario schema

Status: `DONE` | Depends: `P0.1`

Target files: `packages/core/src/schema` dan schema tests.

Work: Zod schema untuk metadata, actors, contract references, node deploy/call/assert, dan `after` dependency.

Tests: valid, missing field, duplicate id, unknown dependency, invalid node type.

Done when: scenario invalid ditolak dengan error yang dapat dibaca.

Checklist: [x] valid scenario [x] duplicate id [x] unknown dependency [x] invalid node type test.

Completed: `ScenarioSchema` dan `ScenarioNodeSchema` tersedia di `@crucible/core/schema`.

### P1.2 — Define RunResult schema

Status: `DONE` | Depends: `P1.1`

Target files: `packages/core/src/schema` dan fixtures.

Work: freeze `RunResult`, `NodeResult`, error kinds, receipt summary, score, timestamps, explorer URL, dan `schemaVersion`.

Tests: passed, failed, skipped, revert, assertion, RPC error, round-trip JSON.

Done when: Web/AI dapat bergantung pada schema ini tanpa membaca runner internals.

Checklist: [x] passed/failed/skipped fields [x] error kinds [x] timestamps [x] round-trip-compatible output.

Completed: `RunResultSchema`, `NodeResultSchema`, dan `ExecutionErrorSchema` tersedia dan dites.

### P2.1 — Create demo contracts

Status: `DONE` | Depends: `P0.2`

Target files: `examples/monad-erc20-demo`.

Work: Foundry project berisi Token benar, BuggyToken, ABI/artifact, dan contract tests.

Tests: `forge build`, `forge test`.

Done when: bug saldo terbukti oleh test dan artifact bisa dibaca TypeScript.

Checklist: [x] Foundry config [x] Token.sol [x] BuggyToken.sol [x] build [x] contract tests [x] artifact output.

Completed: Issue #6, branch `feat/demo-contracts`, `forge build` pass, 3 contract tests pass.

### P2.2 — Create scenarios and fixtures

Status: `DONE` | Depends: `P1.1`, `P2.1`

Target files: `examples/monad-erc20-demo/scenarios`, `fixtures/result`.

Work: happy-path dan buggy-mint dengan deploy -> call -> assert.

Tests: kedua file lolos schema; dependency order dapat dihitung.

Done when: fixture result untuk offline demo tersedia.

Checklist: [x] happy-path scenario [x] buggy-mint scenario [x] schema validation [x] dependency order [x] result fixtures.

Completed: Issue #8, branch `feat/scenarios-fixtures`; scenarios + `fixtures/result` validated by schema tests.

### P2.3 — Implement runner and CLI

Status: `DONE` | Depends: `P1.2`, `P2.2`

Target files: `packages/core/src/runner`, `assertions`, `report`, `packages/cli`.

Work: topological execution, skip dependency, deploy/call/assert via viem, report, CLI `validate` dan `run`.

Tests:

```bash
pnpm crucible validate <scenario>
pnpm crucible run <happy-scenario> --network local
pnpm crucible run <buggy-scenario> --network local
```

Done when: happy `passed`, buggy `failed`, result valid, rerun repeatable, no secret di output.

Checklist: [x] validate command [x] deploy/call/assert [x] dependency skip [x] RunResult output [x] configurable local RPC [x] happy passed [x] buggy failed.

Completed: runner `@crucible/core` dan CLI `crucible run` tersedia; output ditulis ke `result.json` dan exit code mengikuti status scenario.

### P3.1 — Local chain integration

Status: `DONE` | Depends: `P2.1`, `P2.3`

Target files: integration tests, local chain scripts.

Work: Anvil fresh-chain test untuk deploy/call/assert dan repeatability.

Tests: dua run dari chain bersih menghasilkan status yang sama.

Done when: CI dapat menjalankan integration tanpa Monad.

Checklist: [x] Anvil fresh chain [x] deploy/call/assert [x] happy dan buggy [x] dua run repeatable [x] CI Foundry setup [x] tanpa Monad RPC.

Completed: integration test menjalankan empat chain Anvil baru dan memverifikasi status happy `passed`, buggy `failed`, serta assertion buggy tetap `0`.

### P3.2 — Monad Testnet smoke test

Status: `DONE` | Depends: `P2.3`

Target files: `packages/cli` network adapter, `scripts/smoke-monad`, docs env.

Work: validasi RPC dan chain ID 10143, balance, deploy, call, receipt, assert, explorer URL.

Tests: `pnpm test:smoke:monad` dengan `MONAD_TESTNET_RPC_URL`, `DEPLOYER_PRIVATE_KEY`, `ALICE_PRIVATE_KEY`.

Done when: manual smoke berhasil atau blocker RPC/faucet tercatat dengan fixture fallback.

Checklist: [x] RPC connection [x] chain ID 10143 [x] key/address derivation [x] balance check [x] deploy/call/assert path [x] receipt validation [x] explorer links [x] secret-safe output [x] command `pnpm test:smoke:monad`.

Completed: live smoke berhasil dengan chain ID 10143, wallet faucet-funded, deploy/call/receipt/assert, dan explorer links. Tidak ada private key di output atau result.

### P4.1 — Web result viewer

Status: `DONE` | Depends: `P2.3` (fixture-first exception recorded in Issue #4)

Target files: `apps/web`.

Work: load fixture/result.json, overview, execution graph, node detail, status colors, tx/explorer link.

Tests: render happy, failed, skipped, malformed result state.

Done when: Web tidak butuh RPC atau private key.

Checklist: [x] happy fixture [x] failed fixture [x] skipped fixture [x] malformed state [x] overview [x] execution flow [x] node detail [x] explorer link [x] no RPC/private key.

Exception historis: P4.1 lebih dulu menggunakan frozen RunResult fixtures sebelum P2.3 selesai. P2.3 dan P3.2 kini selesai; fixture-first tetap dipertahankan agar Web tidak membutuhkan RPC/private key.

### P4.2 — UX replay and error states

Status: `DONE` | Depends: `P4.1`

Target files: `apps/web`.

Work: replay highlight, loading/empty/error state, responsive layout.

Tests: click node, replay stops at failure, fixture offline mode.

Done when: orang baru memahami status run dalam beberapa detik.

Checklist: [x] click node [x] replay flow [x] replay berhenti pada failure [x] loading state [x] empty state [x] malformed/error state [x] offline fixture mode [x] responsive layout.

Completed: viewer tetap fixture-only, menampilkan state yang aman saat fetch/parse gagal, dan replay memilih node satu per satu sampai failure pertama.

### P5.1 — AI diagnosis contract

Status: `DONE` | Depends: `P1.2`, `P2.3`

Target files: `packages/ai`, diagnosis schema/tests.

Work: input RunResult + scenario + source/ABI; output root cause, evidence, suggested fix, confidence, follow-up tests.

Tests: schema parse, missing AI response, invalid JSON, no-evidence guardrail.

Done when: AI tidak boleh mengarang tx hash atau evidence.

Checklist: [x] Diagnosis schema [x] RunResult + Scenario request [x] evidence field allowlist [x] runId match [x] exact evidence validation [x] invalid JSON/missing evidence tests.

Completed: `@crucible/ai` memvalidasi diagnosis terhadap fakta `RunResult`; evidence yang tidak tersedia atau nilainya berbeda ditolak.

### P5.2 — AI panel and deterministic fallback

Status: `DONE` | Depends: `P4.1`, `P5.1`

Target files: `apps/web`, `fixtures/diagnosis`.

Work: tampilkan diagnosis buggy mint dan cache response untuk offline demo.

Tests: AI unavailable tetap menampilkan RunResult; fixture diagnosis tetap valid.

Done when: failure -> evidence -> suggested patch terlihat di satu flow.

Checklist: [x] buggy-mint diagnosis fixture [x] Web diagnosis panel [x] evidence [x] suggested patch [x] follow-up tests [x] AI unavailable keeps RunResult [x] offline mode.

Completed: fixture diagnosis dimuat dan divalidasi offline; failure → evidence → suggested patch terlihat dalam satu halaman tanpa RPC/private key.

### P6.1 — Signed certificate report

Status: `DONE` | Depends: `P5.2`

Target files: certificate package/CLI/Web.

Work: hash Scenario + RunResult + Diagnosis, sign off-chain, verify, download report.

Tests: verify signature valid, report berubah jika result berubah, no private key in report.

Done when: certificate dapat diverifikasi offline.

Checklist: [x] `@crucible/certificate` [x] contentHash [x] ed25519 sign/verify [x] CLI certify/verify [x] Web download [x] offline fixture [x] no private key in report.

Completed: Issue #18, branch `feat/certificate-report`; fixture `fixtures/certificate/buggy-mint.json` verifies offline.

### P7.1 — Public repository readiness

Status: `DONE` | Depends: P0-P6 sesuai kebutuhan.

Target files: README, CI, `.env.example`, ignore rules.

Work: clone baru, local test, fixture mode, testnet manual workflow, security review.

Tests: clean checkout; `pnpm install`, test, build, local integration.

Done when: developer lain dapat mulai tanpa konteks chat.

Checklist: [x] README quick start [x] fixture/local/testnet modes [x] certificate docs [x] `.env.example` [x] ignore `*.pem`/`result.json` [x] CI tetap tanpa secret.

Completed: Issue #18; public clone path documented without chat context.

### P7.2 — Manual/nightly Monad workflow

Status: `DONE` | Depends: `P3.2`, `P7.1`

Target files: `.github/workflows/monad-smoke.yml`.

Work: workflow manual/nightly dengan GitHub Secrets dan upload result artifacts.

Tests: missing secret menghasilkan error aman dan jelas; configured run mengunggah report.

Done when: testnet tidak mengganggu PR workflow.

Checklist: [x] workflow dispatch [x] nightly schedule [x] GitHub Secrets [x] safe missing-secret validation [x] existing smoke command [x] result artifact upload [x] PR CI tetap offline.

Completed: `.github/workflows/monad-smoke.yml` menjalankan smoke test hanya manual/nightly, memakai concurrency guard, dan mengunggah `/tmp/crucible-monad-smoke-result.json` bila tersedia. P8.1 tetap terpisah.

### P8.1 — Demo freeze and 100% development-ready gate

Status: `DONE` | Depends: all required tasks.

Target files: README, context, logs, demo script.

Work: feature freeze, runbook demo, fixture fallback, known issues, final verification.

Tests: fresh clone local demo; testnet demo; offline demo.

Done when: seluruh M0-M8 exit criteria terpenuhi dan task queue tidak punya required task terbuka.

Checklist: [x] feature freeze [x] README runbook [x] offline fixture fallback [x] known limits [x] `pnpm demo:check` [x] local/Anvil suite [x] live Monad smoke [x] GitHub Monad Smoke with repository Secrets.

Completed: workflow dispatch `38079491346` succeeded on `dev` and uploaded artifact `monad-smoke-38079491346`. All required M0-M8 implementation gates are complete. Feature-frozen `dev` was promoted through PR #24 to `staging` and PR #25 to `main`; both promotion PRs passed CI.

Release gate: `DONE`. Branch protection is enabled on `dev`, `staging`, and `main`; future changes require a scoped Issue/PR and green `checks` before merge.

## Post-freeze backlog

Feature freeze remains active. The tasks below are optional follow-up work. Each task must start with a GitHub Issue, use a dedicated branch, open a PR to `dev`, pass CI, and be promoted through `staging` to `main` only after review/demo validation.

### P9.1 — Real AI diagnosis service

Status: `DONE` | Depends: `P5.1`, `P5.2`

Target files: `packages/ai`, server-side diagnosis endpoint, Web diagnosis client, `.env.example`.

Work: add one provider adapter behind the existing diagnosis contract; send Scenario + RunResult to a server-side endpoint; validate the model response against the evidence allowlist and `DiagnosisSchema`; preserve deterministic fixture fallback on timeout, missing key, provider error, or invalid output.

Guardrails: provider API keys stay server-side; redact private keys and unnecessary calldata; cap input/output size; set timeout; never allow the model to invent node IDs, tx hashes, expected values, or actual values; do not make model output executable automatically.

Tests: mocked provider success, timeout, unavailable key, malformed response, evidence mismatch, and Web fallback with no network.

Done when: buggy-mint shows live diagnosis when configured and the same offline demo remains fully usable when AI is unavailable.

Completed: Issue #26 / PR #27. Added server-side `/api/diagnose`, OpenAI-compatible adapter, 8-second timeout, source redaction, exact evidence validation, and Web fallback to `public/diagnosis/buggy-mint.json`. Local and GitHub CI checks passed.

### P9.2 — Hosted Web deployment

Status: `DONE` | Depends: `P4.2`, `P7.1`, `P9.1` (only for live AI)

Target files: `apps/web`, hosting config, deployment README/runbook, CI workflow.

Work: deploy the static viewer to one provider first (recommended: Vercel); add preview deployments for PRs and production deployment from `main`; configure only public-safe variables in the browser and server-only AI variables in the hosting environment.

Tests: clean production build, fixture viewer without RPC/private key, malformed-result state, preview deployment, production smoke check, and AI-disabled fallback.

Done when: a public URL loads happy/failed/skipped fixtures and does not require local RPC, wallet, or secret.

Completed: Issue #28 / PR #29 plus Issue #35 / PR #36. Added `vercel.json`, Vercel Git integration runbook, `pnpm web:check`, and Edge-safe AI imports. Vercel Preview passed and Production deployment for `main` commit `8a0124c` completed successfully.

### P9.3 — GitHub Actions runtime upgrade

Status: `DONE` | Depends: `P7.1`

Tracking: Issue #38, PR #39, promotions #40/#41. Runtime declarations use Node 24 action majors; CI and Monad Smoke passed.

Target files: `.github/workflows/ci.yml`, `.github/workflows/monad-smoke.yml`.

Work: move workflow actions to the currently supported Node runtime major, after checking the official action release notes; keep the same CI and Monad Smoke behavior.

Tests: CI on `dev`, `staging`, and `main`; manual Monad Smoke; no change to secret validation or uploaded artifact behavior.

Done when: GitHub runs no longer report the Node.js 20 deprecation warning and all required checks remain green.

### P9.4 — On-chain certificate registry

Status: `DONE` | Depends: `P3.1`, `P3.2`, `P6.1`

Target files: certificate package/CLI, Foundry contract example, local integration tests, Monad manual workflow, Web certificate link.

Work: add a minimal registry that stores the certificate hash, issuer, timestamp, and optional report URI; add an opt-in CLI publish flow; keep the signed report itself off-chain and verifiable offline; display the transaction/explorer link without putting a private key in Web or the report.

Tests: local Anvil publish/verify, changed report produces a different hash, repeatability from a clean chain, missing-key safety, and manual Monad Testnet publish.

Done when: a certificate can be verified both offline and against a recorded on-chain hash.

Completed: Issue #42, PR #43, promotions #44/#45. Registry, CLI publish, offline preservation, and fresh-Anvil smoke are complete. Monad Testnet publishing remains opt-in/manual using a funded wallet and deployed registry address.

### P9.5 — Additional contract/scenario support

Status: `DONE` | Depends: `P2.1`, `P2.3`, `P3.1`

Target files: `examples/`, scenario fixtures, schema/runner tests, Web fixtures.

Work: add one second contract family as an external consumer (recommended: ERC-721 mint/ownerOf) and one happy/failure scenario pair; extend only generic schema/runner behavior required by the new flow.

Tests: schema validation, local Anvil deploy/call/assert, repeatability, offline RunResult viewer, and CLI output.

Done when: the second contract family runs through the same Scenario → Runner → RunResult → Web path without special-casing the first ERC-20 demo.

Completed: Issue #46, PR #47, promotions #48/#49. Added Collectible mint/ownerOf, missing-owner failure scenario, generic artifact discovery, repeatable Anvil coverage, and offline Web fixture.

Recommended order: `P9.3 → P9.4 → P9.5`. P9.3 may be executed independently if the action upgrade is low-risk.

## P10 — Public repository onboarding and business-flow testing

Goal: developer dapat menguji repository dApp publik dengan satu alur yang jelas, tanpa harus memahami internal runner terlebih dahulu.

### Cara menjalankan P10 dengan prompt singkat

Agent dapat menerima prompt minimal seperti `Kerjakan P10.1`. Scope, target files, tests, checklist, dan exit criteria di bawah ini adalah spesifikasi lengkapnya.

Urutan aktif:

```text
P10.1 -> P10.2 -> P10.3 -> P10.4 -> P10.5
```

Tahap awal dilakukan manual terhadap satu repository: `monad-developers/scaffold-monad-foundry`. Automation clone tiga repository, Hardhat, frontend click flow, dan testnet berada setelah P10.5 dan bukan bagian dari vertical slice awal.

### Output wajib P10

Setiap run onboarding menghasilkan ringkasan terminal dan JSON machine-readable. Status yang valid:

```text
SUPPORTED
SUPPORTED_WITH_CONFIG
UNSUPPORTED_TOOLCHAIN
MISSING_ARTIFACT
MISSING_SCENARIO
MISSING_LOCAL_CHAIN
BUILD_FAILED
SCENARIO_FAILED
```

Raw `ENOENT`, stack trace, private key, dan calldata sensitif tidak boleh menjadi output utama developer.

### P10.1 — Repository capability detector

Status: `DONE` | Depends: `P8.1`, `P9.5`

Target files: `packages/core/src/capabilities`, `packages/cli`, detector tests, docs fixtures.

Work: implement a read-only detector for the current working directory. Detect Foundry, Hardhat hints, Scaffold-ETH hints, monorepo/package manager, contract artifact locations, build scripts, and missing prerequisites. Start with reliable Foundry detection; report Hardhat as detected but unsupported until a later adapter exists.

Output must classify the repository as `SUPPORTED`, `SUPPORTED_WITH_CONFIG`, or an explicit unsupported/missing status, with an actionable reason. Detector output must be deterministic, schema-valid, and safe to print.

Tests: `pnpm test`, `pnpm typecheck`, and detector unit/fixture tests. The `doctor` command is introduced in P10.2; P10.1 must keep its detector independently testable.

Done when: a manually cloned `scaffold-monad-foundry` is detected as Foundry and artifact/configuration gaps are explained without raw filesystem errors. No deployment or RPC is required yet.

Checklist: [x] toolchain detection [x] package manager detection [x] artifact candidates [x] config candidates [x] missing-prerequisite statuses [x] actionable messages [x] JSON output [x] fixture tests.

Completed: `@crucible/core` capability detector + `pnpm crucible detect [--root] [--json]`; scaffold-like fixture reports `SUPPORTED_WITH_CONFIG` without raw filesystem errors.

### P10.2 — `crucible init` and `crucible doctor`

Status: `DONE` | Depends: `P10.1`

Target files: `packages/cli`, `packages/core/src/config`, config schema/tests, README onboarding docs.

Work: add `crucible doctor` and `crucible init`. `doctor` reads only and reports Node, package manager, toolchain, artifact candidates, local RPC availability, wallet mode, and fixture fallback. `init` creates the smallest valid `crucible.config.json` and scenario template without overwriting existing user files.

Expected first-run flow:

```text
clone -> pnpm crucible doctor -> pnpm crucible init -> pnpm crucible test --local -> Web result
```

Tests: `pnpm crucible doctor`, `pnpm crucible init`, `pnpm crucible doctor --json`, and `pnpm test`.

Done when: a developer can clone the first target, run doctor, run init, inspect generated config, and receive actionable next steps. `init` is idempotent and never writes secrets.

Checklist: [x] doctor command [x] init command [x] config schema [x] idempotent init [x] no overwrite [x] human output [x] JSON output [x] safe missing-prerequisite errors.

Completed: `packages/core/src/config` + CLI `doctor`/`init`; README onboarding section; unit tests for idempotent init and safe doctor output.

### P10.3 — Contract adapter boundary

Status: `DONE` | Depends: `P10.2`

Target files: `packages/core/src/adapters/foundry`, adapter contract, artifact loader, runner integration tests.

Work: define an adapter boundary and implement Foundry artifact loading first. Resolve artifact paths from explicit config or deterministic candidates. Never silently guess a contract, deployment address, or network. Hardhat may be detected but remains unsupported.

Tests: `forge build --root examples/monad-erc721-demo`, `pnpm test`, and `pnpm typecheck`.

Done when: a Foundry fixture can expose ABI and bytecode to the existing runner, with clear `MISSING_ARTIFACT` and `BUILD_FAILED` results.

Checklist: [x] adapter interface [x] Foundry artifact parser [x] explicit config [x] deterministic resolution [x] missing artifact error [x] build error translation [x] no Hardhat special case.

Completed: `createFoundryAdapter` + `AdapterError` statuses; CLI `run` memakai `--foundry-root` atau `crucible.config.json` (tanpa tebak path contoh).

### P10.4 — Business-flow scenario templates

Status: `DONE` | Depends: `P10.3`

Target files: `packages/core/src/schema`, `packages/cli`, scenario templates, first external acceptance fixture.

Work: add the first business-flow template only: `mint NFT`. Keep the business label in scenario metadata and expand it into deploy, call, and assert nodes. Use `ownerOf(tokenId) == user` as the first assertion. Do not add the full template catalog yet.

Tests: `pnpm crucible validate <nft-mint-scenario>` and `pnpm test`.

Done when: a scenario can be selected by business name, remains compatible with the existing Scenario schema, and the graph can show `Mint NFT -> deploy -> mint -> ownerOf assertion`.

Checklist: [x] business-flow metadata [x] mint NFT template [x] actor mapping [x] deploy/call/assert expansion [x] owner assertion [x] schema tests [x] readable validation errors.

Completed: `metadata.businessFlow`/`label`, `expandMintNftTemplate`, fixture `fixtures/scenarios/mint-nft.json`, example expanded scenario, CLI validate menampilkan `Mint NFT -> deploy -> mint -> owner`.

### P10.5 — One-command local run

Status: `DONE` | Depends: `P10.4`

Target files: `packages/cli`, local process runner, result/report output, integration tests, onboarding README.

Work: add `crucible test --local` as the user-facing vertical slice. It must build artifacts, start or connect to an isolated Anvil, run the selected scenario, write a validated RunResult, print the result path and Web path, and return a meaningful exit code. Local mode must not need faucet credentials, Monad RPC, or user-provided private keys.

Tests: `pnpm crucible test --local --scenario <nft-mint-scenario>`, `pnpm test`, and `pnpm build`.

Done when: the first manually cloned repository can complete `doctor -> init -> test --local`, produce `result.json`, and show a passed or actionable failed business flow. Repeat execution starts from a clean local chain and is deterministic.

Checklist: [x] local Anvil lifecycle [x] artifact build [x] scenario selection [x] runner integration [x] RunResult validation [x] result path [x] Web path [x] exit codes [x] clean-chain repeatability [x] no testnet secrets.

Completed: `runLocalTest` (forge build + fresh Anvil ephemeral port + Anvil default accounts + `runScenario`); CLI `test --local`; unit test `mapAnvilAccounts`; README onboarding doctor→init→test --local.

## P10.5 UX improvement — onboarding reset

P10.1–P10.5 membuktikan engine lokal, tetapi acceptance terhadap repository publik menunjukkan UX masih terlalu teknis. Task UX berikut wajib selesai sebelum P10.6 atau P10.7.

### P10.5-U1 — Freeze the user-facing command contract

Status: `DONE` | Depends: `P10.5`

Branch: `feat/p10-5-u1-cli-contract`

Target files: `packages/cli`, CLI tests, root `package.json`, README onboarding docs.

Work: tetapkan satu happy-path command: `crucible test` berarti local test default. `crucible test --local` tetap kompatibel. Pertahankan flags advanced (`--root`, `--scenario`, `--foundry-root`, `--out`) untuk debugging, tetapi jangan jadikan flags tersebut wajib pada happy path.

Tests: command help, default command parsing, backward compatibility `test --local`, dan `pnpm test`.

Done when: README memiliki satu command utama yang dapat disalin developer; command tidak meminta pengetahuan internal Crucible.

Checklist: [x] default test command [x] advanced flags tetap tersedia [x] help singkat [x] CLI parsing tests [x] README quick path.

Completed: `crucible test` sekarang default ke local mode; `--local` tetap backward-compatible. Commit `6102985` pada branch `feat/p10-5-u1-cli-contract`.

### P10.5-U2 — Toolchain and prerequisite preflight

Status: `DONE` | Depends: `P10.5-U1`

Branch: `feat/p10-5-u2-preflight-errors`

Target files: `packages/core/src/config/doctor.ts`, `packages/core/src/runner/local.ts`, `packages/cli`, preflight tests.

Work: periksa executable `forge`/`anvil` sebelum menjalankan build. Jika tidak ditemukan, tampilkan status `MISSING_TOOL` dengan saran PATH yang jelas. Terjemahkan exit code, `spawn` error, dan missing dependency menjadi pesan manusiawi. Jangan menampilkan `ELIFECYCLE` sebagai error utama.

Tests: forge missing, anvil missing, forge build failure, successful preflight, no secret leakage.

Done when: developer mendapat instruksi perbaikan langsung, misalnya `export PATH="$HOME/.foundry/bin:$PATH"`, tanpa stack trace mentah.

Checklist: [x] forge preflight [x] anvil preflight [x] missing-tool status [x] build failure detail [x] safe output [x] regression tests.

Completed: Added safe `forge`/`anvil` probes, `MISSING_TOOL`, actionable PATH guidance, build/startup error translation, doctor tool details, and regression tests. Branch `feat/p10-5-u2-preflight-errors`; pending commit/PR handoff.

### P10.5-U3 — Safe config and scenario bootstrap

Status: `DONE` | Depends: `P10.5-U2`

Branch: `feat/p10-5-u3-safe-bootstrap`

Target files: `packages/core/src/config/init.ts`, config/schema tests, scenario discovery, README.

Work: hentikan pembuatan scenario runnable yang hardcode `Token`. Jika contract/business flow belum dapat ditentukan, buat config minimal dan status `MISSING_SCENARIO` dengan pilihan langkah berikutnya. Jika hanya ada `YourContract`, tampilkan contract yang terdeteksi tetapi jangan mengarang function atau assertion.

Tests: external-style repo dengan `YourContract`, repo dengan ERC-20, repo dengan ERC-721, repo tanpa artifact, idempotent init, no overwrite, no secrets.

Done when: `crucible init` tidak menghasilkan scenario palsu yang kemudian gagal karena artifact `Token` tidak ada.

Checklist: [x] no hardcoded Token [x] artifact-aware bootstrap [x] missing scenario status [x] detected contract summary [x] idempotency [x] fixture coverage.

Completed: `initCrucible` menulis config minimal saja; `scenario` opsional; status `MISSING_SCENARIO` + daftar contract dari artifact/source; tidak menulis `scenarios/crucible-smoke.json` / hardcode `Token`.

### P10.5-U4 — One-command onboarding orchestration

Status: `DONE` | Depends: `P10.5-U3`

Branch: `feat/p10-5-u4-onboarding-flow`

Target files: `packages/cli`, orchestration layer, CLI integration tests, README.

Work: `crucible test` menjalankan urutan detect → preflight → config → build → fresh Anvil → scenario bila semua prasyarat tersedia. Jika scenario belum tersedia, berhenti aman dengan instruksi bisnis yang jelas; jangan menjalankan deploy/call secara tebakan.

Tests: Foundry happy flow, missing forge, missing artifact, missing scenario, unsupported Hardhat, clean temporary workspace, repeat run.

Done when: developer cukup menjalankan satu command dan selalu mendapat salah satu hasil valid: `PASSED`, `MISSING_SCENARIO`, `UNSUPPORTED_TOOLCHAIN`, atau status actionable lain.

Checklist: [x] detect orchestration [x] preflight orchestration [x] safe init [x] local run [x] early actionable stop [x] exit codes [x] integration tests.

Completed: `runOnboardingLocalTest` menjadi jalur utama `crucible test`; command mengembalikan status valid tanpa raw filesystem error, menulis RunResult hanya setelah scenario benar-benar dijalankan, dan berhenti aman pada toolchain/scenario/artifact yang belum siap. Commit `260b283` pada branch `feat/p10-5-u4-onboarding-flow`.

### P10.5-U5 — Friendly output and public onboarding docs

Status: `DONE` | Depends: `P10.5-U4`

Branch: `feat/p10-5-u5-friendly-output`

Target files: `packages/cli`, output formatter, README, `CRUCIBLE_context_project` docs.

Work: sederhanakan output menjadi `What we found`, `What we can run`, `What is missing`, dan `Next step`. Tampilkan detail teknis hanya dengan `--verbose` atau `--json`. Dokumentasikan quick start, troubleshooting PATH, dan perbedaan local/testnet.

Tests: snapshot/CLI output untuk passed, missing scenario, unsupported toolchain, missing tool, build failed, dan scenario failed.

Done when: developer baru dapat memahami status dalam kurang dari satu menit tanpa membaca internal schema atau mengedit JSON.

Checklist: [x] concise default output [x] verbose mode [x] JSON stability [x] error suggestions [x] quick-start docs [x] troubleshooting docs [x] public-safe wording.

Completed: default output now uses `CRUCIBLE LOCAL TEST` / `CRUCIBLE CANNOT RUN` with `What we found`, `What we can run`, `What is missing`, `Status`, and `Next step`. `--verbose` adds paths and node details; `--json` remains machine-readable. Manual acceptance passed for a valid local scenario, missing scenario/tool, unsupported repositories, and the three-repository matrix.

## Rule perubahan branch, commit, dan pull request

Setiap task UX dikerjakan terpisah dan tidak boleh langsung mengubah `staging` atau `main`.

```text
dev
  -> feat/p10-5-u1-cli-contract
  -> PR ke dev
  -> staging setelah CI + manual validation
  -> main setelah release validation
```

Rules:

1. Satu task ID memakai satu branch dengan nama yang sama seperti format di task.
2. Branch dibuat dari `dev` terbaru.
3. Commit harus kecil dan faktual. Format: `<type>(<scope>): <change>`.
4. Commit tidak boleh menyebut nama AI/agent dan tidak boleh memuat secret.
5. Satu PR hanya untuk satu task UX atau satu fix yang langsung diperlukan task tersebut.
6. PR wajib berisi tujuan, perubahan UX, command test, hasil test, screenshot/output sebelum-sesudah bila relevan, risiko, dan rollback plan.
7. PR target selalu `dev`; promosi `dev → staging → main` dilakukan terpisah.
8. Required checks: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, serta manual acceptance sesuai task.
9. Jika test menemukan bug, tambahkan regression test dan entry `FIX_LOG.md`.
10. Setelah merge, update `PLAN.md`, `CONTEXT.md`, dan `CHANGELOG.md`; jangan mengubah status task menjadi `DONE` sebelum exit criteria terpenuhi.

Commit examples:

```text
feat(cli): make local test the default command
fix(cli): report missing forge executable clearly
feat(config): avoid hardcoded token scenario during init
test(cli): cover external repository onboarding errors
docs(ux): simplify public repository quick start
```

PR title examples:

```text
P10.5-U1: Freeze user-facing CLI contract
P10.5-U2: Add actionable toolchain preflight
P10.5-U3: Make config bootstrap artifact-aware
```

## Phase 3 — Public CLI and external repository experience

Phase 3 starts after P10.5-U5. Each milestone is independently testable and should be implemented as one branch and one PR. The npm package is not required during development; use `pnpm pack` and a local `.tgz` smoke test first.

### P10.6 — Packable public CLI package

Status: `DONE` | Depends: `P10.5-U5`

Prompt: `Kerjakan P10.6`

Goal: make Crucible executable from an external dApp repository without `--root` and without importing the Crucible monorepo.

Target files: `packages/cli/package.json`, package build config, `packages/cli/src/index.ts`, workspace package metadata, package smoke scripts, README.

Work:

- create a publishable `@ohmuzakie/crucible-cli` package with a `crucible` bin entry;
- compile/bundle CLI and required core code into `dist`;
- keep `test`, `doctor`, `init`, `detect`, `validate`, and `run` available;
- support `pnpm pack` and installation from a local `.tgz`;
- do not include secrets, test repositories, or the whole monorepo in the package;
- document local package test before any npm publish.

Tests:

```bash
pnpm pack
tmp_project=$(mktemp -d)
pnpm --dir "$tmp_project" add -D /path/to/crucible-cli.tgz
pnpm --dir "$tmp_project" exec crucible --help
```

Done when: a clean external-style project can invoke `crucible test` from the installed package and receives the same actionable statuses as the workspace CLI. Public npm publish is optional and must not be required by CI.

Completed: `@ohmuzakie/crucible-cli@0.1.0` now builds a bundled `dist/index.js`, exposes the `crucible` bin, supports `pnpm pack`, and was installed from `/tmp/crucible-cli-*.tgz` in a clean directory. Packed CLI passed `--help`, a valid Foundry ERC-721 flow, and an unsupported Hardhat repository. Commit is recorded in the implementation handoff.

### P10.7 — Safe `scenario create` wizard

Status: `DONE` | Depends: `P10.6`

Prompt: `Kerjakan P10.7`

Goal: turn a detected ABI into a reviewable scenario draft without guessing business behavior.

Target files: `packages/core/src/scenario-create/`, `packages/cli/src/index.ts`, scenario schema/writer tests, README.

Work:

- add `crucible scenario create`;
- discover real Foundry artifacts and public ABI functions;
- let the developer choose a contract, constructor, call, input values, and assertion;
- support MVP scalar inputs: string, address, uint, and bool;
- write `scenarios/<name>.json` only after explicit confirmation;
- show a preview before writing;
- never invent `Token`, `mint`, `ownerOf`, balances, or business meaning;
- return `MISSING_ARTIFACT` or `MISSING_SCENARIO` with a fix instead of a raw error.

Tests: wizard from `YourContract`, ERC-20, and ERC-721 artifacts; cancel/no-write; invalid input; idempotent name collision; no private key in generated files; generated scenario passes `validate`.

Done when: a developer can create a minimal `setGreeting` scenario from a real artifact and then run `crucible test` without hand-editing JSON.

Completed: added ABI-first `scenario create` with contract/function selection, preview, explicit write confirmation, scalar JSON args, no-overwrite protection, and generated scenario validation. Smoke-tested generated `Collectible` deploy → mint → ownerOf flow successfully. Ready for package release `0.2.0` after P10.9.

### P10.8 — `crucible web` local result viewer

Status: `DONE` | Depends: `P10.6`

Prompt: `Kerjakan P10.8`

Goal: open the existing offline viewer from the CLI using a RunResult path.

Target files: `packages/cli`, `apps/web`, viewer static/runtime packaging, CLI integration tests, README.

Work:

- add `crucible web --result <path>`;
- start a local viewer on an available port;
- load the selected RunResult without RPC or private keys;
- print the local URL and a clear stop instruction;
- keep the existing fixture-only security boundary;
- if the package cannot embed the viewer yet, provide a documented local fallback and an explicit status.

Tests: valid result, failed result, missing result, occupied port, no network/private-key markers, clean shutdown, browser URL output.

Done when: after `crucible test`, a developer can run `crucible web --result crucible/results/result.json` and inspect nodes and assertion evidence locally.

Completed: added a bundled Node HTTP viewer with `/`, `/result.json`, passed/failed/skipped node display, expected/actual evidence, malformed-result validation, and no RPC/private-key dependency. Viewer is included in source and will ship in package release `0.2.0`.

### P10.9 — Automatic three-repository acceptance test

Status: `DONE` | Depends: `P10.6–P10.8`

Prompt: `Kerjakan P10.9`

Goal: prove the public CLI behaves safely against the three selected repositories without requiring every repository to pass a scenario.

Target files: `scripts/external-acceptance.ts`, `fixtures/external/`, package scripts, CI/manual workflow, compatibility report schema, docs.

Work:

- clone or use configured local checkout paths in isolated temporary directories;
- install only repository dependencies needed for detection/build;
- run the packed CLI, not workspace internals;
- record stdout, status, exit code, duration, and safe next steps;
- generate `compatibility-report.json` and a concise table;
- allow network/clone failures to become actionable test statuses;
- never copy `.env`, private keys, or external repository changes into Crucible.

Expected statuses:

| Repository | Accepted result |
|---|---|
| `monad-developers/scaffold-monad-foundry` | `MISSING_SCENARIO`, `MISSING_ARTIFACT`, or `PASSED` |
| `scaffold-eth/scaffold-eth-2` | `UNSUPPORTED_TOOLCHAIN` or supported Foundry subpackage result |
| `scaffold-eth/se-2-challenges` | `UNSUPPORTED_TOOLCHAIN`, `MISSING_SCENARIO`, or supported package result |

Done when: one command produces a reproducible matrix, no repository crashes Crucible, and every result is either a valid RunResult or a clear actionable status.

Completed: `pnpm test:external --json` builds and tests the packed `@ohmuzakie/crucible-cli@0.2.0` against isolated copies of all three repositories. Results were `MISSING_ARTIFACT`, `UNSUPPORTED_TOOLCHAIN`, and `UNSUPPORTED_TOOLCHAIN`; all were accepted as clear actionable outcomes. The release tarball is `/tmp/crucible-release-0.2.0/ohmuzakie-crucible-cli-0.2.0.tgz`.

### P10.10 — Guarded Monad testnet mode

Status: `DONE (implementation + offline acceptance)` | Depends: `P10.9`

Prompt: `Kerjakan P10.10`

Goal: extend the proven local CLI to Monad Testnet without accidental state-changing transactions.

Work completed:

- add explicit `--network monad-testnet`; `crucible test` remains local by default;
- probe the configured RPC and verify chain ID `10143` before build or transaction;
- support read-only `--dry-run` without wallet keys;
- require `--confirm-testnet` before any build/deploy/call write path;
- read actor keys only from scenario-referenced environment variables, never from CLI arguments;
- never print private keys; return actionable `MISSING_TESTNET_KEY`, `WRONG_CHAIN`, `TESTNET_RPC_UNREACHABLE`, or `TESTNET_CONFIRMATION_REQUIRED` statuses;
- write a normal `RunResult` with Monad Testnet chain/explorer metadata after a confirmed run.

Tests completed: missing RPC, wrong chain ID, dry-run, rejected confirmation, confirmed environment-key guard, full typecheck, and full local/Anvil suite. Live testnet execution remains an explicit manual gate because it spends faucet-funded gas.

Done when: testnet mode is opt-in, visibly guarded, and cannot be triggered accidentally by `crucible test`.

### Complete manual acceptance matrix

Run from the Crucible repository with `export PATH="$HOME/.foundry/bin:$PATH"`:

| Case | Command/action | Expected status |
|---|---|---|
| Local happy path | `pnpm crucible test --root examples/monad-erc721-demo --foundry-root . --scenario scenarios/mint-nft.json` | `PASSED`, result file, node list |
| Missing scenario | Run against a Foundry clone without `--scenario` | `MISSING_SCENARIO`, no guessed `Token` flow |
| Hardhat clone | `pnpm crucible test --root <hardhat-repo>` | `UNSUPPORTED_TOOLCHAIN` |
| Packed external CLI | `pnpm test:external --json --target ...` | accepted matrix, no raw `ENOENT`/stack trace |
| Testnet dry-run | testnet command with `--dry-run`, no keys | `TESTNET_DRY_RUN`, no transaction |
| Testnet confirmation | testnet command without `--confirm-testnet` | `TESTNET_CONFIRMATION_REQUIRED`, no transaction |
| Testnet key guard | confirmation with missing/malformed env key | `MISSING_TESTNET_KEY`, no transaction |
| Wrong chain | custom RPC or mismatched chain | `WRONG_CHAIN`, no transaction |
| Testnet live smoke | dedicated funded test wallet + `--confirm-testnet` | `PASSED` or clear `SCENARIO_FAILED`, result contains chain/explorer metadata |
| Viewer | `pnpm crucible web --result <result.json>` | local URL opens, no RPC/key required |

### P10.11–P10.16 — Public CLI onboarding UX correction

Status: `DONE (implementation)` | Depends: `P10.10`

The first external acceptance exposed an onboarding gap rather than an engine defect. The patch scope is:

- `P10.11`: prefer application contracts from `src/`; skip deployment scripts, tests, libraries, interfaces, and `forge-std`, with a short selection reason;
- `P10.12`: use ABI-aware human prompts for string/address/uint/bool and keep JSON only as an advanced escape hatch;
- `P10.13`: discover `crucible.config.json`, `foundry.toml`, artifact/scenario locations and the single Foundry root automatically;
- `P10.14`: write `crucible/results/latest.json` and let `crucible web` read it by default;
- `P10.15`: document `pnpm dlx @ohmuzakie/crucible-cli@latest ...` as the user flow and `pnpm test:external` as the Crucible developer acceptance flow;
- `P10.16`: record `0.2.0` as the initial public CLI, `0.2.1` as the wizard/artifact UX patch, and `0.3.0` as the guarded Monad Testnet milestone.

Done when: a Foundry external repository can run `test`, create a scenario, rerun `test`, and open `web` without `--root`, `--foundry-root`, `--scenario`, `--out`, or raw JSON on the happy path.

### P10.17 — Monochrome CLI terminal UI

Status: `DONE` | Depends: `P10.11–P10.16`

Add a recognizable first-run home screen and consistent terminal presentation without relying on red/green colors. The UI uses the ASCII Crucible mark, monochrome emphasis, `✓/!/?` status symbols, panels, and a TTY-only spinner. `--json` must remain decoration-free for scripts and CI; `NO_COLOR=1` disables ANSI emphasis.

Done when: `crucible`, `crucible --help`, `scenario create`, `test`, and `web` are readable in dark/light terminals and the full test/build suite remains green.

### P10.18 — Interactive home launcher

Status: `DONE` | Depends: `P10.17`

The home screen is now a real TTY launcher. It keeps the logo asset in `packages/cli/logo.txt`, supports arrow navigation, Enter execution, Esc reset, Ctrl+C exit, returns to home after existing commands finish, and falls back to information/help without hanging in CI or redirected output. Explicit commands remain unchanged.

Done when: a pseudo-terminal keeps `pnpm crucible` alive, navigates the five menu items, executes an existing command, returns to home, exits cleanly, and the packed package contains `logo.txt`.

### P10.19 — Launcher composition and multi-project guard

Status: `DONE` | Depends: `P10.18`

Remove blank framing whitespace from the rendered logo composition without mutating the source asset, place the menu beside the logo on wide terminals, keep a compact stacked fallback on narrow terminals, and avoid guessing a Foundry root when the repository contains multiple projects. The CLI should explain which project root to select instead of reporting a misleading missing artifact.

Done when: the TTY launcher has no large top/menu gutter, wide terminals use the two-column composition, narrow terminals remain readable, and a multi-project repository returns an actionable root-selection message.

### P10.20 — Interactive terminal lifecycle

Status: `DONE` | Depends: `P10.19`

Use one alternate terminal surface for the interactive launcher. Enter the alternate screen and hide the cursor when the launcher starts; update the existing surface during navigation; leave it before child commands; re-enter it after child commands; and always restore cursor/raw-mode/screen state on exit. Explicit non-interactive commands remain unchanged.

Done when: repeated `↑/↓` navigation does not leave duplicate launcher screens in shell scrollback, child commands can print normally, and `Ctrl+C` returns a usable prompt with the cursor visible.

### P10.21 — Stable selection rendering and acknowledged command return

Status: `DONE` | Depends: `P10.20`

Keep the static home surface stable while arrow navigation changes only the previous and current menu rows in place. When a launcher child command exits, leave its output readable and wait for an explicit Enter before restoring the home launcher. Preserve interactive child flows and keep long-running commands active until they exit.

Done when: repeated navigation produces no full-screen redraw/flicker, completed local Test output remains visible behind `Press Enter to return to home`, and the home launcher is restored only after acknowledgement.

### P10.22 — Command result state and failure chain

Status: `DONE` | Depends: `P10.21`

Keep normal command output in terminal history, treat pre-RunResult failures as terminal failure states, and never attempt to load `crucible/results/latest.json` after `MISSING_ARTIFACT`, `MISSING_TOOL`, or another failure that did not write a result. Preserve explicit Enter acknowledgement before returning to the launcher.

Done when: an artifact-missing interactive Test shows one actionable failure, no secondary viewer/ENOENT error, and returns to the home menu only after Enter; explicit `test`, `web`, and `--help` commands remain unchanged.

### P10.23 — External artifact discovery hardening

Status: `DONE` | Depends: `P10.11–P10.16`

External Scaffold-ETH acceptance exposed that capability reports intentionally capped artifact candidates at 20, allowing standard Foundry artifacts such as `stdError` to displace `YourContract` from the scenario wizard. The wizard and onboarding summary now scan the configured Foundry `out/` directory directly, filter standard libraries/helpers and script/test artifacts consistently, and preserve the latest-result convention.

Done when: after `forge build`, `scenario create` lists/selects `YourContract`, generated greeting scenarios run deploy→call→assert, and `web` loads `crucible/results/latest.json` without a result flag.

### P10.24 — Unified report viewer and public launcher guidance

Status: `DONE` | Depends: `P10.8`, `P10.17–P10.23`

The public viewer now represents the complete read-only report flow: it explains the business scenario, shows the planned execution order, renders the RunResult nodes, automatically selects a free port when `5173` is occupied, and verifies/downloads an optional certificate report. The public interactive launcher is documented as `pnpm dlx @ohmuzakie/crucible-cli@latest`; repository-local `pnpm crucible` is not assumed for external Yarn projects.

Done when: the same published CLI command can open the launcher, run/test a scenario, open a contextual report, avoid port collisions, and expose an attached certificate without RPC or private keys.

### M21-D — Trust & Acceptance

Status: `DONE` | Depends: `M21-B`, `M21-C`

Target files: `packages/cli/src/connect.ts`, `apps/web/src/ProjectOnboarding.tsx`, `packages/cli/src/connect.test.ts`, `scripts/m21d-check.ts`, root scripts, and runtime documentation.

Work: generate a signed Runtime Passport from the Web through the local runner, persist only non-secret run/replay/Passport state, recover state after reconnect, publish a verified Passport to a local registry, retry recoverable runner requests, and add external/production acceptance gates. Signing keys remain environment-only on the runner.

Tests: runner Passport/persistence regression, full unit/typecheck/lint, Web build/deploy check, judge/demo checks, packaged external acceptance, and local registry publish when Anvil is available.

Done when: a failed→fixed verified replay can produce and download a Passport from Web, reconnect restores it, local publish returns a receipt without exposing key material, external acceptance is clean, and `pnpm m21d:check` passes.

### M21-A UX follow-up — Guided repository connection

Status: `DONE` | Depends: `M21-A`, `M21-D`

The onboarding entry point now presents the public
`pnpm dlx @ohmuzakie/crucible-cli@latest connect --root .` command as a
copyable action. The local runner URL is an advanced setting instead of a
primary developer input, and the fixture route is labeled `Try Demo` as a
secondary action.

Done when: a new developer can start the public connect command, copy it from
the Web, connect using the default runner address, and still override the URL
when developing locally without confusing the demo route with a real project.

## M23 — Local-First Product Topology

Status: `M23.0 DONE` | Active next task: `M23.1` | Branch: `feat/m23-local-first-topology`

M23 is a topology/packaging refactor only. It must not change Scenario,
RunResult, RuntimeFinding, Replay, Passport, Monad rules, Foundry adapter, or
runtime verification semantics. Public Web is landing/demo/install/docs;
Local Web is the real developer workspace; CLI/Runner is the execution plane.

### Frozen contracts

- **Public:** hosted Vercel is landing + deterministic interactive demo +
  install/docs. It is not a real repository workspace and must make zero
  localhost requests.
- **Local:** `crucible connect --root .` is the canonical interactive entrypoint;
  Local Web and CLI/Runner use localhost-only topology:
  `http://127.0.0.1:<port>/` and `http://127.0.0.1:<port>/api/*`.
- **API:** `/api/*` is canonical for Local Web. Legacy endpoints may remain
  temporarily for compatibility, but new documentation uses only `/api/*`.
- **Build:** Web mode is explicitly `public` or `local`; missing/unknown mode
  fails the build and never silently falls back.
- **Security:** local workspace binds localhost-only; public Web cannot access
  localhost; signing/private keys remain environment-only.

### Out of scope

Scenario schema, RunResult schema, RuntimeFinding semantics, Replay semantics,
Passport eligibility/semantics, Monad runtime rules, Foundry adapter, runtime
verification engine, Hardhat support, cloud execution, auth/team/billing, and
public Passport pages as a critical path.

### Task and acceptance checklist

#### M23.0 — Freeze topology and acceptance contract

Status: `DONE` | Depends: `M21-A`, `M21-D` | Target files:
`CRUCIBLE_context_project/PLAN.md`, `CONTEXT.md`, `CHANGELOG.md`.

Tests: document consistency checks; `git diff --check`; no application-code
tests because this task is documentation-only.

Done when: public/local/API/build/security/out-of-scope contracts are frozen;
M23.0–M23.12 have dependencies, target files, tests, and Done When entries;
Context points to M23.1; no application code changes are made.

#### M23.1 — Explicit public/local build modes

Status: `DONE` | Depends: `M23.0` | Target files: `apps/web`, Vite/build
configuration, Web tests, deployment checks, README as needed.

Tests: Web build for `public`; Web build for `local`; invalid/missing mode
fails; existing typecheck and Web security check.

Done when: public and local builds select explicit behavior and unknown or
missing mode exits non-zero without fallback. Implemented with a strict
`VITE_CRUCIBLE_MODE` parser, Vite config validation for build/dev, explicit
public/local Web scripts, Vercel public build selection, and a four-case build
matrix check.

#### M23.2 — Split PublicApp and LocalWorkspace

Status: `TODO` | Depends: `M23.1` | Target files: `apps/web/src/App.tsx`,
new Web app/workspace components and tests only as needed.

Tests: public root renders landing; local root renders workspace; fixture demo
remains available; no localhost request from public mode.

Done when: public and local experiences are separate entrypoints while existing
workspace verification behavior is reused without core changes.

#### M23.3 — Canonical same-origin `/api/*`

Status: `TODO` | Depends: `M23.2` | Target files: Local Web request layer,
`packages/cli/src/connect.ts`, runner tests, docs.

Tests: Local Web uses `/api/*`; canonical health/project/run/replay/Passport
requests work; legacy compatibility is covered if retained.

Done when: no normal Local Web flow depends on a configurable runner URL or
hosted-Web-to-localhost CORS.

#### M23.4 — Local workspace server

Status: `TODO` | Depends: `M23.3` | Target files: `packages/cli/src/`, server
unit/integration tests.

Tests: API handler tests; server binds localhost-only; `/api/health` works;
path/symlink/security guards remain green.

Done when: runner API handler, static handler boundary, and workspace server
are separate responsibilities without changing runner semantics.

#### M23.5 — Serve Local Web from workspace server

Status: `TODO` | Depends: `M23.4` | Target files: local server/static asset
serving code, Web build integration, server tests.

Tests: `/` and assets serve; `/api/*` serves API; SPA nested-route reload
falls back to `index.html`; missing assets remain 404.

Done when: one localhost origin serves the real Local Web and runner API.

#### M23.6 — Bundle Web into CLI package

Status: `TODO` | Depends: `M23.5` | Target files: `packages/cli/package.json`,
build/package scripts, CLI packaging tests, docs.

Tests: `pnpm pack`; inspect tarball; install in a clean external directory;
verify Web assets are present and no secrets are included.

Done when: the packed CLI contains the local Web production build without
workspace symlink or monorepo-only dependencies.

#### M23.7 — Upgrade `crucible connect`

Status: `TODO` | Depends: `M23.6` | Target files: `packages/cli/src/index.ts`,
local workspace server, CLI tests, usage docs.

Tests: `connect --root .` detects repository, starts the local workspace, keeps
the process alive, and reports the workspace URL.

Done when: `connect` starts runner + Local Web as the canonical interactive
entrypoint without requiring Vite or a second terminal.

#### M23.8 — Browser auto-open and shutdown lifecycle

Status: `TODO` | Depends: `M23.7` | Target files: CLI lifecycle/open-browser
helper, CLI tests, platform-safe fallback docs.

Tests: browser-open success/failure fallback; Ctrl+C releases server and port;
second start can reuse the port; existing long-running CLI behavior remains.

Done when: browser opens or prints a manual URL, and shutdown is clean on
SIGINT/SIGTERM without orphaned server processes.

#### M23.9 — Public landing and `/demo`

Status: `TODO` | Depends: `M23.1`, `M23.2` | Target files: `apps/web/src/`,
public fixtures/assets, Web tests, Vercel/deploy checks.

Tests: public root shows landing; `/demo` works offline; install/docs links
work; hosted build makes zero localhost requests and contains no secrets.

Done when: Public flow is Landing → Demo → Install/Docs and clearly labels the
demo as deterministic fixture execution.

#### M23.10 — Packed external repository acceptance

Status: `TODO` | Depends: `M23.6`, `M23.7`, `M23.8` | Target files:
`scripts/`, package acceptance tests, fixtures, docs.

Tests: fresh external repository plus packed CLI; connect, browser/local URL,
detection, contract view, journey, and run; no manual Vite, Vercel, or runner
URL configuration.

Done when: the packed CLI works outside the monorepo through the real developer
flow.

#### M23.11 — Security, persistence, and full regression

Status: `TODO` | Depends: `M23.3`, `M23.5`, `M23.8`, `M23.10` | Target files:
security/persistence/regression scripts and relevant tests only.

Tests: localhost bind, no public localhost calls, no secret/static `.env`
serving, state recovery after restart, `pnpm lint`, `pnpm typecheck`,
`pnpm test`, `pnpm build`, `pnpm test:contracts`, `pnpm judge:check`,
`pnpm demo:check`, `pnpm m21d:check`, and `pnpm web:check`.

Done when: security, persistence, existing CLI compatibility, and all required
regression gates are green.

#### M23.12 — Documentation and release freeze

Status: `TODO` | Depends: `M23.11` | Target files: README, runtime guide,
CLI README, `PLAN.md`, `CONTEXT.md`, `CHANGELOG.md`.

Tests: documentation command review plus final M23 acceptance checklist and
clean `git diff --check`.

Done when: public/local topology is documented, release handoff is complete,
M23 is frozen, and no new feature work is included.

## Perubahan fitur di kemudian hari

Developer yang mengubah fitur harus mulai dari table ini:

| Perubahan | Area utama |
|---|---|
| Scenario/RunResult | `packages/core/src/schema` + schema tests |
| Execution behavior | `packages/core/src/runner` + integration tests |
| CLI command | `packages/cli` + CLI tests |
| Monad/network | network adapter + smoke test |
| Graph/detail UI | `apps/web` |
| AI output | `packages/ai` + diagnosis fixtures |
| Certificate | certificate package + verify tests |
| CI/public setup | `.github`, `.env.example`, README |
