# Crucible Runtime Verification Guide

Versi dokumen: `0.4`  
Profile demo: `monad-core`  
Mode default: fixture/offline

Crucible menghubungkan perjalanan pengguna dengan bukti runtime. Hasilnya tidak hanya mengatakan “test pass”, tetapi menunjukkan node mana yang berjalan, finding apa yang gagal, evidence yang mendasarinya, dan apakah perubahan yang sama terbukti lewat replay.

## Konteks Monad

Monad tetap kompatibel dengan EVM dan RPC Ethereum, tetapi arsitekturnya memiliki karakteristik yang perlu dijelaskan dalam report:

- transaksi di dalam block tetap memiliki urutan linear;
- consensus dan execution dipipelining secara asynchronous;
- MonadBFT memberi speculative finality sekitar 300 ms dan full finality sekitar 600 ms menurut dokumentasi resmi;
- reserve balance membantu memastikan transaksi yang masuk dapat membiayai eksekusinya;
- parallel execution harus menghasilkan state yang sama seperti eksekusi serial.

Referensi resmi:

- [Monad for Developers](https://docs.monad.xyz/introduction/monad-for-developers)
- [Monad Network Information](https://docs.monad.xyz/developer-essentials/network-information)
- [Monad Transactions](https://docs.monad.xyz/developer-essentials/transactions)

Angka dan istilah di atas adalah konteks protokol. `MND-TIME-001`, `MND-FINALITY-001`, dan `MND-FUND-001` adalah rule Crucible yang memeriksa bukti journey; keduanya tidak boleh dibaca sebagai klaim bahwa fixture offline sedang mengakses network Monad.

## Cara memakai Web viewer

### Onboarding repository nyata

M21-A menambahkan project workspace untuk repository lokal. Web tetap menjadi
control plane; filesystem dan detector berjalan di local runner yang sengaja
di-scope ke satu root repository.

1. Jalankan public runner command dari root repository target:

   ```bash
   pnpm dlx @ohmuzakie/crucible-cli@latest connect --root .
   ```

2. Jalankan Web, lalu buka halaman Projects.
3. URL runner default adalah `http://127.0.0.1:8787`; gunakan **Advanced
   settings** hanya jika runner memakai port atau host lain.
4. Isi nama project, lalu klik **Connect & detect repository**.
5. Baca status toolchain, jumlah artifact, scenario, dan next step pada panel
   **Repository detection**.
6. Jika artifact sudah ada, pilih contract pada **Contract explorer** untuk
   melihat fungsi ABI yang benar-benar dibaca dari `out/`. Crucible tidak
   mengarang contract atau fungsi.

Runner default hanya bind ke `127.0.0.1` dan menerima request browser tanpa
`Origin` (misalnya CLI) atau dari `http://127.0.0.1:5173` dan
`http://localhost:5173`. Origin lain ditolak. Untuk production Web, set
allowlist eksplisit sebelum menjalankan runner:

```bash
CRUCIBLE_ALLOWED_ORIGINS=https://app.example.com \
  pnpm dlx @ohmuzakie/crucible-cli@latest connect --root .
```

Runner tidak menerima shell command dari browser, memvalidasi payload compile,
run, diagnosis, remediation, replay, dan Passport dengan schema, dan menolak
root Foundry atau direktori state yang keluar melalui symlink. Jangan memakai
`--host 0.0.0.0` kecuali ada network boundary dan allowlist yang benar-benar
terkontrol.

Endpoint runner M21-A bersifat read-only: `/health`, `/project`, dan
`/contracts`. Jika status
menunjukkan `MISSING_ARTIFACT`, jalankan `forge build` di repository target,
lalu reconnect. Jika `UNSUPPORTED_TOOLCHAIN`, repository belum memiliki
`foundry.toml` yang didukung adapter saat ini.

### M21-B: Compile dan run journey

Setelah contract terdeteksi, gunakan **Manual Journey Builder** untuk memilih
contract, satu fungsi write, satu fungsi read/assertion, argumen, expected
value, dan optional source file. Tombol **Compile journey** hanya membuat
scenario tervalidasi di memory; tombol **Run verification** mengirim scenario
tersebut ke local runner. Runner menjalankan `forge build`, Anvil baru, dan
execution scenario yang sama dengan CLI. Hasilnya dikembalikan sebagai
`RunResult`, lalu ditampilkan pada React Flow live dan inspector.

Source mapping bersifat deklaratif. Crucible hanya menampilkan file/symbol/line
yang diberikan di scenario; ia tidak menebak source location.

### M21-C: Runtime intelligence

Local run menambahkan verification generic berbasis assertion evidence. Jika run
gagal, Web meminta diagnosis evidence-bound. Tanpa `AI_API_KEY`, Crucible
memakai fallback deterministic yang hanya mengutip node/error dari run. Dengan
provider server-side, set `AI_API_KEY`, optional `AI_API_URL`, dan `AI_MODEL` di
environment runner. Secret tidak pernah dikirim ke browser atau disimpan di
scenario.

**Suggested Fix** selalu berstatus `AI SUGGESTED`; Crucible tidak mengedit
repository otomatis dan tidak menyebut run sebagai verified. Setelah scenario
diperbaiki, jalankan lagi. Endpoint replay hanya menerbitkan
`runtime-verified` jika before run gagal, after run pass, profile/suite/rule set
sama, dan evidence kedua run valid.

Untuk Monad Testnet, pilih mode **Monad Testnet / guarded**. Tanpa checkbox
konfirmasi, runner hanya melakukan preflight. Confirmed execution memakai
`MONAD_TESTNET_RPC_URL` dan actor key yang direferensikan scenario dari
environment runner; jangan menaruh private key di browser, file scenario, atau
git.

### M21-D: Trust & Acceptance

Setelah replay menampilkan `Runtime Verified`, klik **Generate Passport**. Runner
menandatangani Passport memakai `PASSPORT_PRIVATE_KEY_PEM` dari environment
runner; browser hanya menerima Passport yang dapat diverifikasi dan dapat
mengunduhnya. State terakhir disimpan di `crucible/results/m21d-state.json` dan
dipulihkan saat project reconnect.

Untuk publish lokal, isi alamat registry hasil deploy Anvil lalu klik **Publish
locally**. Runner memakai `DEPLOYER_PRIVATE_KEY`, memverifikasi chain ID dan
receipt, lalu menyimpan metadata attestation. Tidak ada key yang masuk request
Web atau Passport.

Gate lengkap:

```bash
pnpm m21d:check
```

Gate ini menjalankan judge/demo verification, Web build/deploy check, dan
external repository acceptance menggunakan package CLI. Request Web memiliki
satu retry otomatis; state tersimpan tidak hilang saat reload.

Fixture viewer tetap tersedia di `http://127.0.0.1:5173/` dan mode developer
di `http://127.0.0.1:5173/?debug=1`.

```bash
pnpm --filter @crucible/web dev --host 127.0.0.1
```

Buka `http://127.0.0.1:5173`. Halaman utama dimulai dari **Journeys**, bukan
dashboard metrics. Fixture generic untuk debugging tersedia melalui
`http://127.0.0.1:5173/?debug=1`.

1. Pilih `New User Purchase`, `Settlement`, atau `Auction`, lalu klik `Run journey`.
2. Ikuti Business View: langkah user yang pass, gagal, atau blocked.
3. Baca issue inspector: user impact, what happened, why Monad, evidence, dan suggested fix.
4. Gunakan `Runtime Evidence` untuk melihat tiga rule Monad secara ringkas.
5. Gunakan `Technical View` untuk menelusuri execution node dan tombol `Replay` untuk memutar flow sampai failure pertama.
6. Klik `Test this fix` untuk membuka paired fixed fixture. Semua check harus pass dan halaman menampilkan `Runtime Verified` serta `Version-bound proof eligible`.

Viewer fixture tidak memerlukan wallet, RPC, private key, atau provider AI. Diagnosis `Buggy mint` akan mencoba endpoint `/api/diagnose`, lalu menggunakan diagnosis cache jika endpoint tidak tersedia. Itu adalah fallback yang disengaja, bukan bukti live AI.

## Runtime trace untuk developer

Canvas trace menggunakan [React Flow](https://reactflow.dev/) dengan layout
terkunci. Developer dapat pan, zoom, dan memilih node, tetapi tidak dapat
mengubah topology execution. Tiga layer memakai data yang sama:

- `Business View`: langkah user seperti Fund Wallet → Purchase → Settlement.
- `Technical View`: node execution seperti `deploy`, `fund`, dan `purchase`.
- `Runtime Evidence`: rule dan bukti block, receipt, assurance, atau distance.

Node yang dipilih mengubah inspector di kanan. Jika scenario memiliki optional
`source` mapping, inspector menampilkan file, symbol, dan line range. Jika tidak
ada mapping, UI menampilkan `Source mapping unavailable`; Crucible tidak menebak
source code dengan AI.

Scenario node dapat membawa mapping berikut:

```json
"source": {
  "file": "src/hooks/usePurchase.ts",
  "symbol": "executePurchase",
  "lineStart": 73,
  "lineEnd": 91
}
```

## Test yang direkomendasikan

Gate deterministik:

```bash
pnpm judge:check
pnpm demo:check
```

Regression dan build:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:contracts
pnpm --filter @crucible/web build
pnpm web:check
```

Expected result: semua command exit `0`, tiga finding vulnerable gagal, tiga finding fixed pass, verified replay pass, Passport valid, dan tidak ada marker RPC/private key di bundle Web.

## Troubleshooting

### Web menampilkan `Cannot render result`

Pastikan server dijalankan dari repository root dan fixture tersedia:

```bash
curl -I http://127.0.0.1:5173/results/monad-runtime-vulnerable.json
```

Response harus `200`. Jika `404`, jalankan ulang Vite dari root project.

### Panel AI menampilkan offline fallback

Ini normal untuk fixture mode. Live diagnosis hanya aktif jika deployment memiliki `AI_API_KEY`, `AI_MODEL`, dan optional `AI_API_URL` sebagai server-side environment variable. Jangan memakai `VITE_*` untuk secret.

### Finding fixed tidak muncul sebagai pass

Jalankan:

```bash
pnpm judge:check
```

Jika gate gagal, jangan menganggap Passport eligible. Periksa pasangan `monad-runtime-vulnerable.json` dan `monad-runtime-fixed.json`, profile, suite version, serta rule set.

### Ingin bukti network nyata

Fixture offline bukan live proof. Gunakan wallet testnet khusus, RPC yang valid, dan jalankan:

```bash
pnpm test:smoke:monad
```

Test ini membutuhkan `.env` dan faucet-funded account. Jangan commit `.env`, private key, atau hasil transaksi yang mengandung secret. Attestation on-chain adalah langkah terpisah dari validasi fixture.

## Batasan versi ini

- Envio dan Chainlink CRE tersedia sebagai adapter/attestation intent yang dapat diuji deterministically; integrasi live tetap membutuhkan credential dan endpoint masing-masing.
- Mera PRF masih optional/deferred.
- Passport offline dapat diverifikasi secara lokal; publikasi registry membutuhkan RPC, registry address, dan wallet testnet.
- Status `ready to attest` berarti artefak memenuhi kontrak lokal, bukan transaksi on-chain sudah dikirim.
