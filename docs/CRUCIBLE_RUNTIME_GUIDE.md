# Crucible Runtime Verification Guide

Versi dokumen: `0.2`  
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
