# @crucible/cli

Run Crucible against a local Foundry repository.

```bash
pnpm dlx @crucible/cli test
pnpm dlx @crucible/cli doctor
```

The local test command uses a fresh Anvil chain and does not require user private keys. If a business scenario is not configured, Crucible stops with `MISSING_SCENARIO` instead of inventing deploy or assertion steps.
