# Contributing to Crucible

## Branch flow

```text
feat/* | fix/* | chore/* | docs/*
                 ↓ PR
                dev
                 ↓ PR
              staging
                 ↓ PR
                main
```

Every change uses its own branch. Do not commit directly to `main`, `staging`, or `dev`.

## Commit messages

Keep messages short and factual:

```text
Add runner schema
Fix skipped node status
Update CI workflow
```

Do not add AI, Cursor, ChatGPT, or agent names to commit messages, author metadata, source comments, or tracking history.

## Pull requests

Open the PR against `dev`. Include the affected area, tests run, scope check, and known risk. Use the repository PR template.

## Issues

Use a bug issue for reproducible failures and a feature issue for work larger than one focused change. Include acceptance criteria and avoid secrets in logs.

## Required checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

