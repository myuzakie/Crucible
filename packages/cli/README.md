# @ohmuzakie/crucible-cli

Run Crucible against a local Foundry repository.

```bash
pnpm dlx @ohmuzakie/crucible-cli@latest test
pnpm dlx @ohmuzakie/crucible-cli scenario create
pnpm dlx @ohmuzakie/crucible-cli web
```

The local test command discovers the Foundry root and application contract, uses a fresh Anvil chain, and writes `crucible/results/latest.json`. It does not require user private keys. If a business scenario is not configured, Crucible stops with a human-readable onboarding message instead of inventing deploy or assertion steps.

Advanced/debug flags remain available: `--root`, `--foundry-root`, `--scenario`, `--out`, and `web --result`.

Running `crucible` without a subcommand opens an interactive monochrome launcher. Use `↑/↓` to select Test, Scenario create, Web, Help, or Exit; press Enter to execute; press Ctrl+C to leave. Existing explicit commands remain available. The UI intentionally avoids semantic colors so output remains readable across terminal themes. Use `NO_COLOR=1` to disable ANSI emphasis; `--json` remains suitable for automation.
