# CRUCIBLE — Change Log

## 2026-10-13 — M23.6 Bundle Local Web into CLI Package

- Added a package build step that always builds Web with explicit
  `VITE_CRUCIBLE_MODE=local` and copies the result into package-local `web/`.
- Added a bundled `workspace-server` package export that resolves `web/`
  relative to the installed CLI rather than the Crucible monorepo.
- Added real tarball acceptance: inspect contents, install in an external
  temporary repository, verify the CLI executable, and serve `/` plus
  `/api/health` from the packed package.

## 2026-10-13 — M23.5 Serve Local Web from Workspace Server

- Connected the workspace static handler to Vite production output so one
  localhost origin serves `index.html`, Vite assets, and public Web files.
- Added safe extensionless SPA history fallback while keeping missing assets
  as 404 and routing `/api/*` to the runner API before static handling.
- Verified the explicit `local` Web build against the workspace server; npm
  tarball inclusion remains M23.6 scope.

## 2026-10-13 — M23.4 Local Workspace Server Abstraction

- Extracted the runner API handler from `connect.ts` without changing runner
  verification behavior or core semantics; canonical `/api/*` and legacy paths
  are handled by the same API boundary.
- Added a localhost-only workspace server that composes the API handler with a
  separate static Web handler for `/` and `/assets/*`.
- Added traversal/symlink guards, unknown API 404 behavior, localhost bind
  coverage, and clean shutdown tests. Production Web bundling and `connect`
  lifecycle remain later M23 tasks.

## 2026-10-13 — M23.3 Canonical Same-Origin API Client

- Added one Local Web API client whose normal mode requests relative canonical
  `/api/*` paths for health, project, contracts, journey compilation, runs,
  replay, diagnosis/remediation, and Passport operations.
- Kept an explicit runner URL as a legacy/development compatibility override
  using the existing unprefixed runner endpoints; runner serving is deferred to
  M23.4.
- Preserved Web retry, timeout, and response-error behavior and documented the
  canonical API contract without changing runner or core verification semantics.

## 2026-10-12 — M23.2 Public/Local Web Surface Split

- Added explicit entry-surface selection from the frozen Web build mode:
  `public` renders `PublicApp`, while `local` reuses the existing
  `ProjectOnboarding` workspace.
- Kept the public fixture query available as a transition path for the future
  `/demo` work in M23.9; no verification, journey, replay, or Passport logic
  was changed.
- Added regression coverage for public/local surface selection and preserved
  the M23.1 build-mode contract.

## 2026-10-12 — M23.1 Explicit Web Build Modes

- Added strict `VITE_CRUCIBLE_MODE` validation for `public` and `local` Web
  builds and dev startup; missing, empty, and unknown values fail clearly.
- Added explicit `build:public`, `build:local`, `dev:public`, and `dev:local`
  Web commands, with the root production build and Vercel configured for the
  public mode.
- Added unit coverage and a build matrix covering public/local acceptance and
  missing/invalid rejection without changing core verification contracts.

## 2026-10-12 — M23.0 Local-First Product Topology

- Froze hosted Vercel as the public landing, deterministic interactive demo,
  install/docs, and optional public proof surface; it is not a real repository
  workspace and must not access localhost.
- Froze the local developer topology as CLI/Runner execution plus Local Web
  workspace on `http://127.0.0.1:<port>/` with canonical `/api/*` endpoints.
- Froze explicit `public` and `local` Web build modes; missing or unknown modes
  must fail rather than silently falling back.
- Kept Scenario, RunResult, RuntimeFinding, Replay, Passport, Monad rules,
  Foundry adapter, and runtime verification semantics out of scope for M23.
- Added the M23.0–M23.12 dependency and acceptance contract to `PLAN.md`.

## 2026-10-11 — M21-A UX follow-up

- Made the public `pnpm dlx @ohmuzakie/crucible-cli@latest connect --root .`
  command copyable in repository onboarding.
- Moved the local runner URL into Advanced settings while preserving the
  default `127.0.0.1:8787` connection path.
- Renamed the fixture entry action to `Try Demo` and kept it secondary to real
  repository onboarding.

## 2026-10-11 — M21-D Trust & Acceptance

- Added Web-to-runner Runtime Passport generation after a verified replay.
- Added non-secret runner persistence and reconnect recovery for run, replay, and Passport state.
- Added local runner Passport publication with chain/receipt verification while keeping signing keys server-side.
- Added retry-based Web error recovery, Passport regression coverage, and `pnpm m21d:check` production acceptance orchestration.

## 2026-10-11 — EXECUTION-PROTOCOL

- Menambahkan protokol execution snapshot, mode eksekusi fokus, collision gate,
  dan pemicu re-analisis berbasis perubahan.
- Eksekusi lanjutan dapat langsung mengerjakan task yang sudah dianalisis tanpa
  membaca ulang seluruh repository; analisis diulang hanya untuk perubahan
  multi-file, perubahan dari agen lain, kegagalan kontrak/test, atau perluasan
  scope.
- Menegaskan bahwa pekerjaan agen lain tidak boleh dioverwrite, di-reset,
  di-stash, atau di-checkout.

## 2026-10-11 — M11 Runtime Contract Foundation

- Frozen Product Phase 2 execution grouping: P11.0–P11.2 are one milestone, branch,
  umbrella issue, and pull request.
- Added validated runtime rule, finding, evidence, and verification profile contracts.
- Added optional runtime verification data to `RunResult` without breaking existing fixtures.
- Added `generic-evm` and `monad-core` profile definitions and Passport eligibility guard.

## 2026-10-11 — M12 Monad Runtime Verification Suite

- Added deterministic vulnerable/fixed Monad runtime demo with New User Purchase,
  Settlement, and Auction journeys.
- Added runtime rule catalog/evaluator for timestamp progression, finality assurance,
  and newly funded account distance.
- Added vulnerable/fixed fixtures proving generic execution can remain valid while
  Monad-specific verification fails and then passes after remediation.

## 2026-10-11 — M13 Journey Product Experience

- Added Business, Technical, and Runtime / Evidence graph views to the Web viewer.
- Added journey grouping and runtime finding selection for the three Monad demo journeys.
- Added Runtime Finding Inspector with user-impact-first explanation, evidence, rule/docs,
  remediation guidance, and technical details.
- Added vulnerable and fixed Web fixtures for offline product demonstration.

## 2026-10-11 — M14 AI Remediation and Verified Replay

- Added evidence-bound `RuntimeRemediation` contract and model/fallback service.
- Added `RuntimeReplaySummary` and deterministic before/after invariant checks.
- Added Web replay proof and kept AI output explicitly labeled `AI Suggested`.

## 2026-10-11 — M15 Runtime Passport and Provenance

- Added signed, version-bound Runtime Passport v1 with offline verification.
- Added Passport eligibility and attestation metadata for repository, commit, runtime,
  suite, journey/rule results, evidence hash, issuer, and issue time.
- Extended the registry with backward-compatible `registerPassport` suite-version storage.
- Added guarded CLI `publish-passport` and Web Passport eligibility presentation.

## 2026-10-11 — M16 Sponsor Trust Integrations

- Added local/supported Chainlink CRE workflow simulation for Passport verification
  and registry attestation intent.
- Added Envio block evidence adapter feeding the runtime timestamp verification path.
- Documented Mera PRF as an optional issuer boundary without claiming an unimplemented
  passkey integration.

## 2026-10-11 — M17 Judge Demo and Submission Freeze

- Added `pnpm judge:check` for the deterministic three-journey before/after product gate.
- Added judge-first three-minute path and submission freeze checklist.
- Separated repository-verifiable gates from external manual release/presentation items.

Format: `YYYY-MM-DD | task/decision | perubahan | alasan | status`

## 2026-10-11

- `P10.11–P10.16` | Memperbaiki UX public CLI: wizard memprioritaskan contract aplikasi dan melewati script/test/library/interface, input ABI scalar memakai prompt manusia, Foundry/config/artifact discovery otomatis, result default `crucible/results/latest.json`, `web` tanpa `--result`, dokumentasi user `pnpm dlx @ohmuzakie/crucible-cli@latest`, dan pemisahan acceptance developer `pnpm test:external` | Menutup gap onboarding yang ditemukan pada acceptance external tanpa menghapus advanced flags | done; target patch release `0.2.1`
- `FIX-016` | Memperbaiki fallback `result.json` yang masih dipaksakan CLI dan inference expected assertion lintas tipe ABI | `test` dan `web` kembali memakai convention yang sama; wizard ERC-721 tidak lagi menjadikan address wallet sebagai expected value string | fixed; release `0.2.1`
- `RELEASE-0.2.1` | Menaikkan package CLI dari `0.2.0` ke `0.2.1` setelah UX wizard, result convention, dan local viewer fix | Packed release siap untuk publish dan verifikasi external; publish npm sengaja tetap manual | prepared, not published
- `FIX-017` | Membersihkan contract discovery external dari token source/comment dan helper deployment/verification | Output onboarding lebih relevan; acceptance Scaffold tidak lagi menyarankan contract palsu | fixed; masuk release `0.2.1`
- `DOC-0.2.1` | Mengabaikan hasil runtime `**/crucible/results/` dari Git | Result lokal tidak ikut ter-commit saat developer menjalankan default `crucible test` | done
- `P10.17` | Menambahkan terminal UI monochrome: landing screen/logo ASCII, help layout, prompt prefix, spinner TTY-only, panel URL/result/security, dan error panel; mode `--json` tetap bersih | CLI lebih mudah dipahami saat first run dan tetap aman di terminal bertema terang/gelap serta automation | done; release `0.2.1`
- `P10.18` | Mengubah home CLI menjadi launcher interaktif dengan keyboard `↑/↓`, Enter, Esc, Ctrl+C; mempertahankan explicit commands, non-TTY fallback, dan asset logo dalam tarball | `pnpm crucible` tidak lagi hanya mencetak welcome screen lalu keluar; user dapat memilih Test, Scenario create, Web, Help, atau Exit dari satu flow | done; release `0.2.1`
- `P10.19` | Merapikan komposisi launcher: menghapus blank space framing logo, menempatkan menu di kolom kanan pada terminal lebar, memberi fallback stack rapat pada terminal sempit, dan menolak auto-selection Foundry root saat beberapa project terdeteksi | First-run CLI tidak lagi terlihat seperti dua UI terpisah dan root monorepo tidak menghasilkan pesan `MISSING_ARTIFACT` yang menyesatkan | done; release `0.2.1`
- `P10.20` | Memperbaiki lifecycle launcher dengan alternate screen buffer, hide/show cursor, dan restore surface saat command child berjalan atau launcher keluar | Navigasi tidak lagi menumpuk home screen ke scrollback; shell history, cursor, dan prompt kembali bersih setelah `Ctrl+C` atau command selesai | done; release `0.2.1`
- `P10.21` | Mengganti full clear/full redraw saat arrow navigation dengan update in-place pada dua baris menu dan menambahkan acknowledgement `Press Enter to return to home` setelah command selesai | Logo/static home tidak berkedip dan hasil Test/Scenario/Web tetap terbaca sebelum user kembali ke launcher | done; release `0.2.1`
- `P10.22` | Memverifikasi dan mengunci result-state failure untuk `MISSING_ARTIFACT`: pre-RunResult failure tidak menghasilkan path result dan tidak dirangkai dengan error viewer `ENOENT` | Satu root cause tetap menjadi satu pesan error yang dapat ditindaklanjuti; history command tetap terlihat dan home kembali hanya setelah Enter | done; release `0.2.1`
- `P10.23` | Memperbaiki discovery artifact pada external Foundry monorepo: wizard memindai `out/` penuh, melewati standard library/helper/script/test artifact, dan onboarding summary menampilkan `YourContract` | Artifact report yang dibatasi 20 kandidat tidak lagi membuat `stdError`/helper menutupi contract aplikasi; acceptance scaffold berhasil deploy→call→assert dan membuka viewer default | done; follow-up release required
- `P10.24` | Menyatukan CLI viewer dengan report context: business scenario, planned flow, auto-port fallback, dan optional certificate verification/download; dokumentasi launcher diarahkan ke `pnpm dlx` untuk external Yarn repositories | User tidak lagi mengira CLI dan Web menjalankan flow yang berbeda; CLI menjalankan flow, Web hanya membaca report dan certificate | done; target patch release `0.2.3`
- `RELEASE-0.2.2` | Menyiapkan package CLI untuk release follow-up dan memperbaiki metadata `bin` agar executable `crucible` tetap dipertahankan npm | Publish pertama dari root workspace gagal karena package root private; `@ohmuzakie/crucible-cli@0.2.2` kemudian berhasil tersedia di npm dan lulus acceptance external | published; verified
- `PROMOTION-0.2.2` | Merge PR #55 ke `dev`, promosi PR #54 ke `staging`, dan promosi PR #56 ke `main` setelah CI/Vercel lulus | Perubahan onboarding dan package release sekarang tersedia di branch utama | done
- `P10.10-DRY-RUN` | Menjalankan guarded Monad Testnet preflight dari external scaffold menggunakan CLI publik `0.2.2` | RPC Monad Testnet dan chain ID `10143` valid; tidak ada build, deployment, transaksi, atau private key yang digunakan | passed; confirmed execution remains manual

- `P10.10` | Menambahkan guarded Monad Testnet mode: `--network monad-testnet`, RPC/chain-ID preflight, read-only `--dry-run`, explicit `--confirm-testnet`, environment-only actor keys, redacted actionable statuses, dan RunResult dengan metadata explorer | Testnet tidak dapat aktif tidak sengaja dari `crucible test`; full local/Anvil suite dan typecheck lulus, live smoke tetap manual karena memakai gas | done; live smoke manual gate
- `P10.9` | Menambahkan `pnpm test:external` yang memaketkan CLI lalu menjalankan matrix tiga repository pada isolated temporary copies, menyimpan status/exit code/next steps, dan menerima unsupported status yang actionable | Acceptance memvalidasi package yang benar-benar akan dipakai external developer tanpa memodifikasi clone asli | done; packed release `0.2.0`
- `RELEASE-0.2.0` | Menyatukan P10.7 scenario wizard, P10.8 local viewer, dan P10.9 external acceptance ke package `@ohmuzakie/crucible-cli@0.2.0` | Release berikutnya siap dipublish setelah matrix dan full checks lulus; publish npm tetap langkah eksplisit | prepared, not published

- `P10.8` | Menambahkan `crucible web --result` dengan viewer HTTP lokal bundled, status node, assertion evidence, dan validasi RunResult tanpa RPC/private key | Developer dapat membuka hasil test dari package public tanpa menjalankan monorepo Web | done
- `P10.7` | Menambahkan `crucible scenario create` berbasis ABI dengan preview, konfirmasi write, scalar JSON args, no-overwrite, dan generated scenario validation | Developer dapat membuat business flow awal tanpa menulis JSON manual atau menerima tebakan `Token`/`mint` | done

- `P10.6` | Mengubah `@ohmuzakie/crucible-cli` menjadi package packable dengan bundled `dist/index.js`, bin `crucible`, local `.tgz` smoke test, dan dokumentasi penggunaan external repository | Developer dapat menjalankan CLI dari luar monorepo sebelum npm publish; package tidak bergantung pada workspace package saat runtime | done; npm publish belum dilakukan

- `P10-PHASE-3` | Menyiapkan roadmap public CLI distribution, safe scenario wizard, local web viewer, automated three-repository acceptance, dan guarded Monad Testnet sebagai P10.6–P10.10 | Phase 2 sudah membuktikan engine lokal; Phase 3 memindahkan pengalaman ke repository external dengan prompt task singkat dan package smoke test lokal sebelum npm publish | plan only

- `P10.5-U5` | Merapikan output local test menjadi bagian `What we found`, `What we can run`, `What is missing`, `Status`, dan `Next step`; menambahkan `--verbose`, mempertahankan `--json`, serta memperbarui quick start/troubleshooting | Developer dapat memahami hasil dalam kurang dari satu menit dan automation tetap mendapat output JSON stabil | done

- `P10.5-U4` | Menambahkan orkestrasi one-command `crucible test`: detect → preflight → safe init → build → fresh Anvil → scenario, dengan early-stop status yang actionable dan RunResult hanya saat flow benar-benar dijalankan | Developer dapat menguji repository Foundry eksternal tanpa memahami urutan internal Crucible atau menerima error filesystem mentah | done; commit `260b283`, branch `feat/p10-5-u4-onboarding-flow`

- `P10.5-UX-PLAN` | Menambahkan Phase 2 UX improvement plan P10.5-U1–U5 untuk menyederhanakan one-command onboarding, preflight toolchain, safe scenario bootstrap, orchestration, dan output ramah developer | Acceptance external repository menemukan `init` masih menghasilkan scenario hardcode `Token` dan error `forge` belum actionable | plan only
- `P10.5-UX-PLAN` | Menetapkan rule branch, commit, PR, promotion, required checks, dan prompt singkat per task UX | Perubahan dapat dieksekusi agent secara konsisten dengan context minimal dan tetap terkontrol | plan only

## 2026-10-11

- `P10.5-U3` | `init` tidak lagi menulis scenario hardcode `Token`; config `scenario` opsional; status `MISSING_SCENARIO` + daftar contract terdeteksi dari artifact/source | Mencegah bootstrap palsu yang gagal karena artifact `Token` tidak ada di repo eksternal | done; branch `feat/p10-5-u3-safe-bootstrap`
- `P10.5-U2` | Menambahkan preflight `forge`/`anvil`, status `MISSING_TOOL`, PATH guidance, safe tool probe, dan error build/startup yang tidak menampilkan raw `ENOENT`/`ELIFECYCLE` sebagai pesan utama | External repository dapat menjelaskan dependency Foundry yang hilang secara actionable | done; branch `feat/p10-5-u2-preflight-errors`
- `P10.5-U1` | Menjadikan `crucible test` local mode sebagai default dan mempertahankan `--local` sebagai alias backward-compatible | Happy path tidak lagi memaksa developer memahami mode internal | done; commit `6102985`, branch `feat/p10-5-u1-cli-contract`
- `P10.5` | Menambahkan `crucible test --local` (`runLocalTest`: forge build + Anvil ephemeral + akun default + RunResult), CLI flags scenario/root/foundry-root/out, dan README doctor→init→test --local | Vertical slice onboarding lokal tanpa faucet/Monad RPC/private key user | done
- `P10.4` | Menambahkan metadata business-flow, template `mint NFT` → deploy/mint/ownerOf, fixture `fixtures/scenarios/mint-nft.json`, dan CLI validate yang menampilkan label graf | Scenario bisa dipilih lewat nama bisnis tanpa katalog penuh | done
- `P10.3` | Menambahkan batas adapter Foundry (`createFoundryAdapter`, `AdapterError`), resolusi artifact eksplisit, dan CLI `run --foundry-root` | Artifact ABI/bytecode masuk runner tanpa menebak path contoh/Hardhat | done
- `P10.2` | Menambahkan `CrucibleConfigSchema`, `initCrucible` (idempotent/no-overwrite/no-secrets), `runDoctor` (Node/PM/toolchain/RPC/wallet/fixture), CLI `doctor`/`init`, dan section README onboarding | Alur clone → doctor → init siap sebelum `test --local` | done
- `P10.1` | Menambahkan capability detector read-only (`detectCapabilities`), schema status onboarding, fixture `fixtures/capabilities/*`, dan CLI `crucible detect [--root] [--json]` | Developer dapat melihat status Foundry/Scaffold-ETH dan gap config/artifact/scenario tanpa RPC atau raw filesystem error | done
- `P10-DOCS` | Menetapkan Phase 2 dan urutan eksekusi `P10.1 -> P10.2 -> P10.3 -> P10.4 -> P10.5` dengan prompt singkat berbasis task ID | Agent dapat fokus pada eksekusi tanpa prompt panjang atau pengulangan scope | plan/context only
- `P10-DOCS` | Memperjelas output onboarding, status kompatibilitas, target manual pertama, target files, tests, checklist, dan exit criteria P10.1–P10.5 | Vertical slice pertama harus dapat dimainkan manual oleh developer sebelum automation tiga repository | plan/context only

## 2026-10-11

- `P10-PLAN` | Menambahkan roadmap onboarding repository publik, capability detector, `crucible init/doctor`, adapter Foundry/Hardhat, business-flow templates, dan compatibility matrix tiga repository | Crucible diarahkan menjadi alat yang mudah dipakai developer serta jujur saat repository belum didukung | plan only

- `FIX-014` | Menekan lint `unsafe-typecast` pada `uint64(block.timestamp)` di `CertificateRegistry` dengan komentar alasan + `forge-lint` disable | Cast aman untuk Unix time hingga ~tahun 584 miliar; ABI `uint64` tetap | fixed
- `P9.5` | Menambahkan contoh ERC-721 `Collectible`, scenario mint/ownerOf happy/failure, artifact discovery generic, dan repeatable Anvil test | Contract family kedua memakai flow Scenario → Runner → RunResult → Web tanpa special-case engine | final; Issue #46 / PR #47, promotions #48/#49, main `9cfcf17`
- `P9.4` | Menambahkan `CertificateRegistry`, CLI `publish`, ABI, metadata transaksi opsional, dan fresh-Anvil smoke | Certificate dapat diverifikasi offline dan hash-nya dicatat on-chain dengan issuer/URI | final; Issue #42 / PR #43, promotions #44/#45, main `332cd24`
- `P9.3` | Meng-upgrade GitHub Actions checkout/setup/pnpm/upload-artifact ke action major berbasis Node 24 | Menghilangkan sumber warning Node 20 tanpa mengubah secret atau flow Monad Smoke | final; Issue #38 / PR #39, promotions #40/#41, main `5bb15d0`

- `POST-FREEZE` | Menambahkan backlog P9.1–P9.5 untuk AI provider nyata, hosting Web, upgrade Actions, certificate on-chain, dan contract/scenario kedua | Pengembangan lanjutan memiliki urutan, guardrail, test, dan exit criteria tanpa membuka feature freeze secara implisit | plan only
- `P9.2` | Menambahkan `vercel.json`, runbook Vercel, `pnpm web:check`, dan memperbaiki Edge import AI | Web berhasil Preview dan Production deploy dari `main` tanpa RPC/private key di client | final; Issues #28/#35, PRs #29/#36/#37
- `P9.1` | Menambahkan server-side AI diagnosis adapter, endpoint `/api/diagnose`, timeout, redaction, evidence validation, dan fallback fixture | AI nyata menjadi opsional dan tidak merusak demo offline | final; Issue #26 / PR #27
- `RELEASE` | Mempromosikan P9.1/P9.2 melalui PR #30 (`dev → staging`) dan PR #31 (`staging → main`) | Fitur AI dan kesiapan hosting tersedia di release publik dengan CI tetap hijau | final
- `FIX-010` | Mendokumentasikan koreksi Vercel Root Directory dari `apps/web` ke repository root dan menghapus kebutuhan secret Monad dari Web | Build Vercel memakai `vercel.json`/`api` root dan deployment publik tidak membawa private key | verified in PR #33/#37
- `RELEASE` | Mempromosikan feature-frozen demo melalui PR #24 (`dev → staging`) dan PR #25 (`staging → main`), menjadikan `main` default, dan mengaktifkan branch protection pada tiga branch | Release publik memiliki jalur promosi dan CI gate yang konsisten untuk solo developer | final
- `P8.1` | Demo freeze gate selesai; GitHub Monad Smoke run `38079491346` success dan artifact tersedia | Repository siap untuk demo offline, local, dan testnet dengan runbook yang terdokumentasi | final
- `P8.1` | Menyiapkan demo freeze, runbook README, known limits, dan `pnpm demo:check` | Offline/local demo dapat diverifikasi dari clean clone; final gate menunggu GitHub Secrets | implementation complete; gate blocked
- `P7.2` | Menambahkan workflow Monad Smoke manual/nightly dengan GitHub Secrets dan artifact upload | Testnet terjadwal terisolasi dari PR CI dan hasil run dapat diunduh | final
- `P7.1` | Merapikan README, `.env.example`, dan ignore rules untuk clone publik | Developer baru dapat install/test/build dan menjalankan fixture/local/testnet tanpa konteks chat | final
- `P6.1` | Menambahkan `@crucible/certificate`, CLI certify/verify, dan download certificate di Web | Report Scenario+RunResult+Diagnosis dapat ditandatangani dan diverifikasi offline tanpa private key di output | final
- `P5.2` | Menambahkan panel diagnosis Web dan cache buggy-mint offline | Failure, evidence, suggested patch, dan follow-up tests terlihat tanpa AI/RPC | final
- `P5.1` | Menambahkan `@crucible/ai` diagnosis contract dengan evidence allowlist dan exact RunResult validation | AI tidak dapat mengarang node, tx hash, expected, atau actual | final
- `P4.2` | Menambahkan replay execution, loading/empty/error state, node focus, dan responsive controls | Orang baru dapat memahami dan menelusuri hasil run tanpa RPC/private key | final
- `P3.2` | Smoke test Monad live berhasil pada chain ID 10143 dengan wallet faucet-funded | Jalur deploy/call/assert dan explorer link terverifikasi nyata | final
- `P3.1` | Menambahkan integration test Anvil fresh-chain untuk happy/buggy dan repeatability | CI dapat memverifikasi deploy/call/assert tanpa Monad RPC atau secret | final
- `P2.3` | Menambahkan viem runner dan CLI `validate`/`run` dengan output RunResult | Scenario dapat dijalankan lokal dan hasilnya siap dipakai Web/AI | final
- `P3.2` | Menambahkan smoke command Monad dengan chain ID, balance, receipt, assertion, dan explorer validation | Jalur testnet memakai runner yang sama dan membedakan PASSED dari BLOCKED | final; live run later verified
- `FIX-003` | Menambahkan `--rpc` dan `LOCAL_RPC_URL` pada CLI | Local runner dapat memakai port Anvil terisolasi tanpa fixed endpoint | fixed
- `P2.2` | Menambahkan scenario happy/buggy dan RunResult fixtures offline | Runner dan Web/AI punya input/output demo tanpa RPC | final
- `FIX-002` | Regenerate lockfile after adding Foundry workspace package | Clean CI install kembali reproducible | fixed
- `P2.1` | Menambahkan Foundry demo target `Token.sol` dan `BuggyToken.sol` beserta contract tests | Runner memiliki target benar dan target gagal deterministik untuk diagnosis | final
- `ENV-001` | Memasang Foundry 1.8.5 dan memverifikasi forge build/test | Contract fixture dapat diverifikasi lokal sebelum runner/Monad smoke test | final
- `P4.1` | Menambahkan Vite/React Web result viewer dengan fixture-first mode | UX dapat diuji tanpa RPC/private key; menampilkan overview, flow, node detail, error state, dan explorer link | final
- `P4.1-EXCEPTION` | Mengizinkan Web dikerjakan sebelum P2.3 selesai | Issue #4 mendokumentasikan dependency exception; runner tetap menjadi next required implementation | final
- `P0.2` | Menambahkan workspace boundary, `.env.example`, README, dan package scaffold | Developer dapat install dan memahami mode local/testnet/fixture | final
- `P0.3` | Menambahkan GitHub Actions CI untuk branch `dev`, `staging`, dan `main` | PR tervalidasi tanpa secret atau Monad RPC | final
- `P1.1` | Menambahkan Zod Scenario schema dengan validasi duplicate id dan dependency | Scenario menjadi kontrak data yang dapat dipercaya | final
- `P1.2` | Menambahkan Zod RunResult schema dengan status, error kind, receipt, dan summary | Web/AI memiliki kontrak output yang stabil | final
- `GIT-001` | Repository diinisialisasi dengan remote `origin` ke GitHub Crucible dan branch workflow `main`, `staging`, `dev` | Menjaga history dan promosi kode tetap rapi untuk solo developer | final
- `GIT-002` | Setiap feature/fix/chore/docs wajib memakai branch khusus dan PR ke `dev` | Menghindari perubahan langsung ke branch release | final
- `GIT-003` | Commit message dibuat singkat dan faktual tanpa identitas AI | History harus merepresentasikan engineer pemilik repository | final
- `GIT-004` | `CRUCIBLE_context_project/` masuk `.gitignore` | Context adalah memori lokal, bukan artifact source repository | final
- `GIT-005` | Ditambahkan `.cursor/rules/ponytail.mdc`, template Issue, dan template Pull Request | Menyamakan cara implementasi, review, dan pencatatan bug/feature | final
- `PLAN-001` | Struktur memori proyek diringkas menjadi `CONTEXT.md`, `PLAN.md`, `CHANGELOG.md`, dan `FIX_LOG.md` | Agent dan developer dapat menemukan informasi tanpa folder dokumentasi berlapis | final
- `PLAN-002` | Repository utama ditetapkan di `/home/muzakie/Workspace/projects/hackaton/monad` | Menghindari implementasi tercecer di workspace lain | final
- `PLAN-003` | Task memakai ID stabil `P0.1` sampai `P8.1` | Prompt lanjutan dapat langsung meminta satu task dan dependency-nya jelas | final
- `PLAN-004` | Local Anvil menjadi test utama CI; Monad Testnet manual/nightly | PR publik tidak bergantung secret atau faucet | final
- `PLAN-005` | `examples/monad-erc20-demo` menjadi consumer eksternal pertama | Menguji boundary Crucible sebelum repository demo dipisah | final
