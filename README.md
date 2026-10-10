# Crucible

Crucible adalah platform pengujian end-to-end dApp/smart contract di Monad: scenario JSON dijalankan sebagai execution flow, hasil divisualisasikan, failure didiagnosis AI, dan report dapat disertifikasi.

## Development

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Repository flow

```text
feature/fix branch -> PR ke dev -> staging -> main
```

Gunakan `CONTRIBUTING.md` untuk branch, commit, Issue, dan Pull Request.

## Environment

Salin `.env.example` ke `.env` hanya jika menjalankan Monad Testnet. Private key testnet tidak boleh masuk Git.

Project memory lokal berada di `CRUCIBLE_context_project/` dan sengaja tidak ditrack.
