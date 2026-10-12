# CRUCIBLE — Fix Log

Catat bug implementasi di sini, bukan di `CHANGELOG.md`. Satu entry harus cukup untuk agent lain menemukan regression test dan memahami perubahan.

Format:

```text
ID: FIX-XXX
Date: YYYY-MM-DD
Task: P0.0
Symptom:
Root cause:
Fix:
Files:
Regression test:
Status: open | fixed | verified
```

## FIX-027 — Packed acceptance JSON included exec failure text

Date: 2026-10-13
Task: M23.10
Symptom: The new packed external acceptance stopped while parsing a structured
non-zero CLI result because `execFileSync` appended its failure message after
the JSON payload.
Root cause: the acceptance helper parsed the complete combined stdout/stderr
and child-process error string as one JSON document.
Fix: parse the JSON object boundary before the appended process error while
still retaining the complete output for raw-error assertions.
Files: `scripts/m23-external-acceptance.ts`.
Regression test: `pnpm m23.10:check` passes the missing-scenario and unsupported
toolchain external cases from a fresh temporary directory.
Status: `fixed; verified`

## FIX-028 — M21-D gate used an invalid implicit Web build mode

Date: 2026-10-13
Task: M23.11
Symptom: `pnpm m21d:check` failed at its Web build step because it invoked
`@crucible/web build` without `VITE_CRUCIBLE_MODE`.
Root cause: M23.1 intentionally rejects missing Web modes, but the existing
M21-D production gate still used the pre-M23 generic build command.
Fix: use the explicit `build:public` command for the hosted Web gate.
Files: `scripts/m21d-check.ts`.
Regression test: `pnpm m21d:check` and `pnpm web:mode:check` pass with explicit
public/local behavior and missing/invalid rejection.
Status: `fixed; verified`

## FIX-029 — Workspace static handler could expose secret-like files

Date: 2026-10-13
Task: M23.11
Symptom: A custom static root containing `.env` or PEM/key material would have
been served as a normal static file.
Root cause: static safety checked traversal and symlinks but did not reject
secret-like filenames.
Fix: reject `.env` variants, PEM/key extensions, and private-key filenames
before static resolution.
Files: `packages/cli/src/static-handler.ts`,
`packages/cli/src/workspace-server.test.ts`.
Regression test: workspace server requests for `.env` and `signing.pem` return
404; full M23 release gates pass.
Status: `fixed; verified`

## FIX-026 — Unknown canonical API paths returned the wrong status

Date: 2026-10-13  
Task: M23.4  
Symptom: An unknown `/api/*` request reached the runner handler and returned
`405 Method Not Allowed` instead of the required `404 Not found`.  
Root cause: the legacy handler treated every unrecognized non-POST request as
a method error before checking whether the route existed.  
Fix: recognize the supported route set before method validation so unknown
canonical and legacy paths return 404 while known routes preserve 405 behavior.  
Files: `packages/cli/src/runner-api-handler.ts`.  
Regression test: `packages/cli/src/workspace-server.test.ts` checks
`GET /api/not-real` returns 404.  
Status: `fixed; verified`

## FIX-023 — External artifact report hid the application contract

Date: 2026-10-11  
Task: P10.23  
Symptom: After `forge build` in `scaffold-monad-foundry`, `scenario create` listed `stdError` first and explicit `YourContract` lookup failed; onboarding summaries also showed Foundry helper artifacts instead of the application contract.  
Root cause: capability detection intentionally capped artifact candidates at 20, while standard Foundry artifacts sorted before the application contract. Filtering was also case-sensitive and did not exclude all helper/base artifact paths.  
Fix: scan the configured Foundry `out/` directory directly for scenario creation and contract summaries; filter standard libraries, helper/base paths, scripts, tests, and interfaces consistently.  
Files: `packages/core/src/scenario-create/index.ts`, `packages/core/src/config/init.ts`, `packages/cli/src/index.ts`.  
Regression test: scenario/config unit tests, `forge build` in `/tmp/scaffold-monad-foundry`, external `scenario create`, local `test` with deploy→call→assert, and `web` on port 5183.  
Status: `verified locally; follow-up package release required`

## FIX-024 — npm publish removed the CLI bin entry

Date: 2026-10-11  
Task: RELEASE-0.2.2  
Symptom: Publishing from `packages/cli` warned that `bin[crucible]` was invalid and removed it from the publish metadata; publishing from the repository root targeted private package `crucible@0.1.0` and failed.  
Root cause: release was invoked from the wrong workspace package, and npm's current package normalization rejected the `./dist/index.js` bin form during publish.  
Fix: keep the root package private, publish only from `packages/cli`, and use `dist/index.js` for the CLI bin target.  
Files: `packages/cli/package.json`.  
Regression test: `npm publish --access public --dry-run` from `packages/cli` produced `@ohmuzakie/crucible-cli@0.2.2` without bin-removal warnings.  
Status: `fixed; publish pending`

## FIX-025 — CLI viewer was disconnected from scenario and certificate context

Date: 2026-10-11  
Task: P10.24  
Symptom: External users saw the CLI and Web as two separate ways to run a flow; CLI `web` displayed only a minimal RunResult, did not explain the business scenario, required manual port changes when `5173` was occupied, and did not expose available certificate reports.  
Root cause: the packaged CLI viewer was a separate static HTML renderer from the richer fixture Web app, and its server always bound the default port.  
Fix: attach the matching scenario to the CLI report, render planned flow context, verify and offer optional certificate download, and retry with an ephemeral port on `EADDRINUSE` for the default port. Document `pnpm dlx` as the external launcher because `pnpm crucible` depends on a local target script/dependency and may be rejected by Yarn-configured repositories before Crucible starts.  
Files: `packages/cli/src/web.ts`, `packages/cli/src/index.ts`, `packages/cli/src/web.test.ts`, `README.md`, `packages/cli/README.md`.  
Regression test: lint, typecheck, CLI viewer tests, CLI build, contextual HTML smoke test, and two simultaneous viewers proving `5173` falls back to an ephemeral port.  
Status: `verified locally; release 0.2.3 pending`

## FIX-018 — CLI home screen was not an interactive launcher

Date: 2026-10-11  
Task: P10.17–P10.18  
Symptom: Running `crucible` without a subcommand printed a welcome screen and exited, so users had no discoverable first-run action flow; the logo also was not guaranteed to be present in the packed CLI.  
Root cause: the entrypoint treated the no-command case as usage output instead of a TTY interaction, and the ASCII mark had no package asset contract.  
Fix: add a TTY-only launcher with Test, Scenario create, Web, Help, and Exit; support arrow navigation, Enter, Esc reset, Ctrl+C, return-to-home after child commands, non-TTY fallback, `NO_COLOR`, and ship the immutable logo as `packages/cli/logo.txt`.  
Files: `packages/cli/src/ui.ts`, `packages/cli/src/index.ts`, `packages/cli/logo.txt`, `packages/cli/package.json`, `packages/cli/README.md`.  
Regression test: pseudo-terminal navigation/return/exit check, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `PATH="$HOME/.foundry/bin:$PATH" pnpm test`, `PATH="$HOME/.foundry/bin:$PATH" pnpm test:external --json`, and packed tarball inspection for `logo.txt`.  
Status: `verified`

## FIX-019 — Launcher composition added a large vertical gutter and guessed monorepo root

Date: 2026-10-11  
Task: P10.19  
Symptom: The interactive home screen showed many blank lines before the logo, placed the menu far below it, and a monorepo root could select `.` as Foundry root even when several nested projects existed.  
Root cause: framing whitespace from the raw logo asset was rendered directly, the menu was always rendered after the logo, and configured/detected Foundry paths were not validated for uniqueness.  
Fix: discard only empty framing lines during composition, render logo/info/menu as a two-column layout on wide terminals with a compact narrow fallback, validate configured `foundry.toml`, and require an explicit project choice when multiple roots are detected.  
Files: `packages/cli/src/ui.ts`, `packages/core/src/onboarding/local-test.ts`.  
Regression test: pseudo-terminal launcher check, full lint/typecheck/test suite, and multi-project onboarding coverage through external acceptance.  
Status: `verified`

## FIX-020 — Interactive launcher polluted terminal history

Date: 2026-10-11  
Task: P10.20  
Symptom: Repeated navigation could leave multiple complete home-screen renders in terminal history and risk leaving cursor/raw-mode state behind.  
Root cause: the launcher rendered on the normal terminal surface and did not own a reversible interactive screen lifecycle.  
Fix: enter an alternate screen buffer, hide the cursor, render/update there, leave the surface before child commands, re-enter it afterward, and restore cursor, raw mode, listeners, and the original terminal surface on exit.  
Files: `packages/cli/src/ui.ts`.  
Regression test: pseudo-terminal navigation with repeated arrows and `Ctrl+C`, child `Help` command return-to-home check, `pnpm lint`, `pnpm typecheck`, and CLI build.  
Status: `verified`

## FIX-021 — Arrow navigation redrew the full launcher and command results vanished immediately

Date: 2026-10-11  
Task: P10.21  
Symptom: Every arrow key cleared and redrew the full ASCII home, causing visible flicker; completed Test/Help/Web output was immediately replaced by the home screen.  
Root cause: selection changes reused the full-frame renderer, and the child-command return path re-entered the launcher without an acknowledgement step.  
Fix: render the frame once, update only previous/current menu rows with cursor movement and line clearing, pause after child completion with `Press Enter to return to home`, then restore the alternate launcher surface.  
Files: `packages/cli/src/ui.ts`.  
Regression test: pseudo-terminal repeated-arrow check, local ERC-721 Test flow with explicit Enter return, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm cli:build`, and full `pnpm test`.  
Status: `verified`

## FIX-022 — Pre-RunResult failure could be followed by a secondary viewer error

Date: 2026-10-11  
Task: P10.22  
Symptom: A failed Test state such as `MISSING_ARTIFACT` risked being followed by `Cannot load RunResult ... ENOENT`, obscuring the original actionable failure.  
Root cause: a result viewer path could be treated as available even when the onboarding command stopped before producing a RunResult.  
Fix: keep the failure as the terminal command result, leave `resultPath`/`runResult` unset, preserve normal command history, and require Enter before restoring the launcher. Added regression coverage for the missing-artifact fixture.  
Files: `packages/core/src/onboarding/local-test.test.ts`, `packages/cli/src/ui.ts`.  
Regression test: interactive missing-artifact pseudo-terminal flow, `missing artifacts stay a single failure state without a result path`, full lint/typecheck/build/test suite.  
Status: `verified`

## FIX-015 — Public CLI onboarding required internal paths and raw JSON

Date: 2026-10-11  
Task: P10.11–P10.16  
Symptom: External developers saw deployment/test artifacts first, had to enter JSON arrays, know `packages/foundry` and `result.json`, and could not run `web` without `--result`.  
Root cause: artifact selection was alphabetical, scenario prompts were JSON-oriented, and onboarding defaults exposed repository-internal paths.  
Fix: rank/filter application contracts, add ABI scalar coercion and friendly wizard prompts, auto-discover Foundry/config/artifact paths, write `crucible/results/latest.json`, and make `web` load that path by default. Advanced flags remain supported.  
Files: `packages/core/src/scenario-create/index.ts`, `packages/core/src/onboarding/local-test.ts`, `packages/cli/src/index.ts`, `README.md`, `packages/cli/README.md`.  
Regression test: scenario-create selection/coercion tests, full `pnpm test`, `pnpm typecheck`, `pnpm build`, and packed external acceptance.  
Status: `fixed`

## FIX-017 — External contract discovery included source-comment tokens and helpers

Date: 2026-10-11  
Task: P10.11 follow-up  
Symptom: Scaffold external acceptance reported names such as `and`, `as`, `to`, `ScaffoldETHDeploy`, and `VerifyAll` as detected application contracts.  
Root cause: source discovery used a broad contract regex without filtering lowercase/comment tokens and deployment/verification helper names.  
Fix: require Solidity contract names to start uppercase and exclude deploy, verify, test, mock, fixture, and helper suffixes from detected contracts.  
Files: `packages/core/src/config/init.ts`.  
Regression test: packed external acceptance remains accepted; local capability/config tests pass.  
Status: `fixed`

## FIX-016 — Local test still overrode the new latest-result convention

Date: 2026-10-11  
Task: P10.14 follow-up  
Symptom: `crucible test` wrote `result.json`, while `crucible web` looked for `crucible/results/latest.json`. The wizard also used a write argument as an assertion expected value for unrelated ABI types.  
Root cause: CLI passed the legacy `'result.json'` fallback into onboarding, and expected-value inference did not compare ABI types.  
Fix: let onboarding own the default output path, write `crucible/results/latest.json`, choose a read function whose input matches the write return type when possible, and only reuse a write argument as expected when ABI types match.  
Files: `packages/cli/src/index.ts`, `packages/core/src/onboarding/local-test.ts`.  
Regression test: full `pnpm test`, typecheck, and local ERC-721 smoke now produce `crucible/results/latest.json` and pass.  
Status: `fixed`

## FIX-014 — forge lint unsafe-typecast on CertificateRegistry timestamp

Date: 2026-10-11  
Task: P9.4 follow-up  
Symptom: `forge build` warned `unsafe-typecast` on `uint64(block.timestamp)` in `CertificateRegistry.sol`.  
Root cause: Foundry lint flags truncation risk for `uint256` → `uint64` casts.  
Fix: document that Unix timestamps fit in `uint64` until ~year 584 billion and disable that lint line.  
Files: `examples/monad-certificate-registry/src/CertificateRegistry.sol`.  
Regression test: `forge build` / `forge test` in `examples/monad-certificate-registry` with no `unsafe-typecast` warning.  
Status: `fixed`

## FIX-001 — Documentation state was not updated after completed work

Date: 2026-10-11  
Task: P0.2, P0.3, P1.1, P1.2  
Symptom: `PLAN.md` and `FIX_LOG.md` did not clearly mark completed work, so the next agent could not reliably know the last project state.  
Root cause: delivery focused on code/PR and skipped the required project-memory update.  
Fix: add completion checklists, agent resume state, environment notes, and a mandatory log update step.  
Files: `CONTEXT.md`, `PLAN.md`, `CHANGELOG.md`, `FIX_LOG.md`.  
Regression test: before every handoff, verify `git status`, task status, changed files, test commands, and log entries.  
Status: `verified`

## FIX-012 — Registry ABI returned a tuple and wallet clients required explicit chain mode

Date: 2026-10-11  
Task: P9.4  
Symptom: initial registry CI failed because Solidity struct reads were decoded as a tuple and viem typecheck required `chain: null` for unbound wallet clients.  
Root cause: ABI/test assumed flattened struct outputs and the CLI client intentionally has no configured chain object.  
Fix: describe `get` as a tuple output, read named record fields, and pass `chain: null` on explicit RPC clients.  
Files: `examples/monad-certificate-registry/test/CertificateRegistry.t.sol`, `packages/certificate/src/registry.ts`, `packages/cli/src/index.ts`, `scripts/smoke-certificate-registry.ts`.  
Regression test: GitHub CI run `38085063576` passed contract tests, fresh Anvil smoke, typecheck, tests, and build.  
Status: `verified`

## FIX-013 — New workspace examples required lockfile importers

Date: 2026-10-11  
Task: P9.4/P9.5  
Symptom: adding Foundry examples under `examples/*` can make frozen pnpm install reject the workspace lockfile.  
Root cause: pnpm workspace discovery includes example package manifests.  
Fix: add empty importers for `monad-certificate-registry` and `monad-erc721-demo`.  
Files: `pnpm-lock.yaml`.  
Regression test: CI frozen install passed in PRs #43 and #47.  
Status: `verified`

## FIX-010 — Vercel project used the app directory as monorepo root

Date: 2026-10-11  
Task: P9.2  
Symptom: Vercel build completed Vite but failed with `No Output Directory named "dist" found`; the project was configured with Root Directory `apps/web`.  
Root cause: `vercel.json` and the `/api/diagnose` function live at repository root, while the Vercel project was scoped to the nested Web directory.  
Fix: document and enforce repository-root configuration: output `apps/web/dist`, root `/api/diagnose`, and server-only AI variables. Remove Monad wallet variables from Vercel Web settings.  
Files: `README.md`; Vercel Project Settings.  
Regression test: repository CI remains green; Vercel Preview must be rerun after changing Root Directory to `.`.  
Status: `verified`

Resolution: Vercel Root Directory was changed to the repository root and the deployment completed successfully after the Edge bundle fix.

## FIX-011 — Vercel Edge rejected the AI workspace alias

Date: 2026-10-11  
Task: P9.2  
Symptom: Vercel Edge deployment rejected `@crucible/core/schema` as an unsupported module from the AI package.  
Root cause: the Edge bundler could not resolve the pnpm workspace package alias across the server function boundary.  
Fix: extract the AI contract into `packages/ai/src/contract.ts`, use relative schema imports for the server path, and keep the public package export unchanged.  
Files: `packages/ai/src/contract.ts`, `packages/ai/src/index.ts`, `packages/ai/src/service.ts`, `api/diagnose.ts`.  
Regression test: 27 local tests, GitHub CI, Vercel Preview PR #36, and Production deployment for main commit `8a0124c`.  
Status: `verified`

## FIX-009 — Web bundle check treated environment references as leaked secrets

Date: 2026-10-11  
Task: P9.2  
Symptom: `pnpm build` failed because public certificate/scenario fixtures contain safe names such as `env:DEPLOYER_PRIVATE_KEY`.  
Root cause: the first bundle guard rejected secret marker names instead of actual private-key material.  
Fix: reject PEM private-key headers only; environment references remain allowed because they contain no secret value.  
Files: `scripts/web-deploy-check.ts`.  
Regression test: `pnpm build` and `pnpm web:check` pass with the public fixtures.  
Status: `verified`

## FIX-008 — Release branches were not protected after feature freeze

Date: 2026-10-11  
Task: P8.1 / release gate  
Symptom: `dev`, `staging`, and `main` accepted direct pushes even though the project workflow required Issue/PR-based changes.  
Root cause: branch protection had not yet been configured on the public repository.  
Fix: enable PR-only protection, required CI check `checks`, admin enforcement, and disable force-push/deletion on all three branches.  
Files: GitHub repository branch settings; `CONTEXT.md`, `PLAN.md`, `CHANGELOG.md`.  
Regression test: verify each branch protection API response and confirm promotion PRs #24 and #25 passed CI.  
Status: `verified`

## FIX-007 — GitHub Monad workflow blocked by missing repository Secrets

Date: 2026-10-11  
Task: P8.1  
Symptom: manual `Monad Smoke` workflow run `38078797076` stopped at secret validation before executing testnet transactions.  
Root cause: repository Secrets `MONAD_TESTNET_RPC_URL`, `MONAD_CHAIN_ID`, `DEPLOYER_PRIVATE_KEY`, and `ALICE_PRIVATE_KEY` are not configured.  
Fix: no code change; configure the four Secrets in GitHub, then rerun the workflow. The validator intentionally fails safely without printing values.  
Files: GitHub repository Settings → Secrets and variables → Actions.  
Regression test: local missing-secret validator reports only variable names; `pnpm demo:check`, `pnpm test`, and `pnpm build` pass.  
Status: `fixed`

Resolution: repository Secrets were configured and workflow run `38079491346` completed successfully with artifact `monad-smoke-38079491346`.

## FIX-006 — Monad workflow validator needed strict TypeScript support

Date: 2026-10-11  
Task: P7.2  
Symptom: the first workflow validator implementation used `.mjs`, which caused strict typecheck failure in its unit test.  
Root cause: the repository TypeScript config does not provide declarations for imported JavaScript modules.  
Fix: use a typed `.ts` validator and execute it with the installed `tsx` binary in the workflow.  
Files: `scripts/validate-monad-env.ts`, `.github/workflows/monad-smoke.yml`.  
Regression test: `pnpm typecheck` and validator unit tests in `pnpm test`.  
Status: `verified`

## FIX-005 — Web and AI package used incompatible RunResult types

Date: 2026-10-11  
Task: P5.2  
Symptom: `pnpm typecheck` rejected the Web result type when passing it to diagnosis evidence validation.  
Root cause: Web had a local, looser RunResult type instead of the shared core schema type.  
Fix: make the Web viewer import `RunResult` from `@crucible/core/schema`; diagnosis and viewer now share one contract.  
Files: `apps/web/src/viewer.ts`, `apps/web/package.json`.  
Regression test: `pnpm typecheck` and `pnpm test`.  
Status: `verified`

## FIX-002 — Workspace lockfile missing the contract example importer

Date: 2026-10-11  
Task: P2.1  
Symptom: GitHub CI failed at `pnpm install --frozen-lockfile` after adding `examples/monad-erc20-demo`.  
Root cause: the new workspace package was added after the lockfile was last generated.  
Fix: regenerate `pnpm-lock.yaml` with `pnpm install --lockfile-only`.  
Files: `pnpm-lock.yaml`.  
Regression test: `pnpm install --frozen-lockfile` on a clean dependency state and GitHub Actions CI.  
Status: `fixed`

## FIX-003 — CLI smoke test used a fixed Anvil port

Date: 2026-10-11  
Task: P2.3  
Symptom: CLI run failed when Anvil used an isolated port because the CLI always connected to `127.0.0.1:8545`.  
Root cause: local RPC endpoint was not configurable from the command line or environment.  
Fix: add `--rpc <url>` and `LOCAL_RPC_URL` fallback.  
Files: `packages/cli/src/index.ts`.  
Regression test: run the happy scenario against Anvil on port `18549`.  
Status: `verified`

## FIX-004 — Root smoke script could not resolve workspace core package

Date: 2026-10-11  
Task: P3.2  
Symptom: `pnpm typecheck` failed because the root `scripts/smoke-monad.ts` imported `@crucible/core`, which is not a root package dependency.  
Root cause: the script runs from the workspace root while the package export is scoped to workspace consumers.  
Fix: import the existing core source entry explicitly from the root script; no second runner was introduced.  
Files: `scripts/smoke-monad.ts`.  
Regression test: `pnpm typecheck` and `pnpm test`.  
Status: `verified`
