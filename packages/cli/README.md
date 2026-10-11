# @ohmuzakie/crucible-cli

Run Crucible against a local Foundry repository.

```bash
pnpm dlx @ohmuzakie/crucible-cli@latest
```

The launcher is the recommended entry point for a repository owner. Select `Test`, `Scenario`, or `Web` with `↑/↓` and press Enter. For a scripted flow, the same actions are:

```bash
pnpm dlx @ohmuzakie/crucible-cli@latest test
pnpm dlx @ohmuzakie/crucible-cli@latest scenario create
pnpm dlx @ohmuzakie/crucible-cli@latest web
```

The local test command discovers the Foundry root and application contract, uses a fresh Anvil chain, and writes `crucible/results/latest.json`. It does not require user private keys. If a business scenario is not configured, Crucible stops with a human-readable onboarding message instead of inventing deploy or assertion steps.

Advanced/debug flags remain available: `--root`, `--foundry-root`, `--scenario`, `--out`, and `web --result`.

Running `crucible` without a subcommand opens an interactive monochrome launcher. Use `↑/↓` to select Test, Scenario create, Web, Help, or Exit; press Enter to execute; press Ctrl+C to leave. In an external repository, use the `pnpm dlx ...` launcher above: `pnpm crucible` only works when the repository has a local `crucible` script or dependency, and package managers such as Yarn may reject that command before Crucible starts. Existing explicit commands remain available. The UI intentionally avoids semantic colors so output remains readable across terminal themes. Use `NO_COLOR=1` to disable ANSI emphasis; `--json` remains suitable for automation.

`web` is a read-only report viewer. It does not run the scenario again. It reads `crucible/results/latest.json`, attaches the matching scenario when available, and automatically falls back to an available port when `5173` is already occupied. Use `--port` only when a fixed port is required. If `certificate.json` or `crucible/certificate.json` is present, the viewer verifies it offline and offers a download button.
