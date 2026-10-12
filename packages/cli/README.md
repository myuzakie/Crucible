# @ohmuzakie/crucible-cli

Run Crucible against a local Foundry repository.

```bash
pnpm dlx @ohmuzakie/crucible-cli@latest connect --root .
```

`connect` is the canonical interactive entrypoint. It detects the repository,
starts the bundled Local Web and Local Runner on one localhost origin, and
keeps the workspace alive for journey, run, evidence, replay, and Passport
flows. The Local Web calls only same-origin `/api/*`; no Vite process or hosted
Vercel page is required.

Power-user and compatibility commands remain available:

```bash
pnpm dlx @ohmuzakie/crucible-cli@latest test
pnpm dlx @ohmuzakie/crucible-cli@latest detect --root .
pnpm dlx @ohmuzakie/crucible-cli@latest doctor --root .
pnpm dlx @ohmuzakie/crucible-cli@latest scenario create
pnpm dlx @ohmuzakie/crucible-cli@latest run scenario.json --network local --foundry-root .
pnpm dlx @ohmuzakie/crucible-cli@latest web
```

The local test command discovers the Foundry root and application contract, uses a fresh Anvil chain, and writes `crucible/results/latest.json`. It does not require user private keys. If a business scenario is not configured, Crucible stops with a human-readable onboarding message instead of inventing deploy or assertion steps.

`web` remains the existing result viewer and does not replace `connect`.
Advanced/debug flags remain available: `--root`, `--foundry-root`, `--scenario`,
`--out`, and `web --result`.

The CLI package contains the Local Web production assets. It can be packed and
installed outside the Crucible monorepo; runtime does not resolve workspace
paths. Local execution, repository files, and signing/private keys remain on
the developer machine.

Running `crucible` without a subcommand opens an interactive monochrome launcher. Use `↑/↓` to select Test, Scenario create, Web, Help, or Exit; press Enter to execute; press Ctrl+C to leave. Existing explicit commands remain available. The UI intentionally avoids semantic colors so output remains readable across terminal themes. Use `NO_COLOR=1` to disable ANSI emphasis; `--json` remains suitable for automation.
