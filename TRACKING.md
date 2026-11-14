# TRACKING — Status Implementasi HTML Remover

Dokumen ini melacak progres eksekusi dari [PLAN.md](./PLAN.md). Diperbarui setiap selesai mengerjakan langkah.

**Tanggal mulai:** 2026-09-09
**Status keseluruhan:** Implementasi selesai — menunggu deploy ke server prod & UAT

---

## Log Implementasi

### Tahap 1 — Setup proyek ✅
- [x] `package.json` dibuat (CommonJS, `engines.node >= 16.13.0`).
- [x] Struktur folder: `server/`, `public/`, `public/vendor/`, `test/`, `deploy/`.
- [x] Dependensi terpasang: `express@4`, `multer`, `papaparse`, `striptags`, `xlsx@0.18.5`.
- [x] Library vendor di-copy ke `public/vendor/` (`xlsx.full.min.js`, `papaparse.min.js`).
- [x] `.gitignore` dibuat.

> Catatan: `multer` ter-resolve ke `1.4.5-lts.2` (npm memberi peringatan vuln pada 1.x — aman untuk tool internal; opsi upgrade ke 2.x dicatat di README).

### Tahap 2 — Util pembersih HTML + unit test ✅
- [x] `public/htmlCleaner.js` (UMD) — satu sumber kebenaran untuk browser & server:
  - strip semua tag, decode named & numeric entities,
  - opsi `brMode` (`space`/`newline`), opsi `normalizeWhitespace`,
  - fungsi `cleanHtml`, `cleanGrid`, `decodeEntities`.
- [x] `server/htmlCleaner.js` — re-export util bersama (CommonJS).
- [x] `test/htmlCleaner.test.js` — 16 unit test, **tanpa framework** (Node ≥ 12), semuanya **lulus**.

### Tahap 3 — Backend (Express + fallback /api/clean) ✅
- [x] `server/index.js` — `createApp()`:
  - serve file statis `public/`,
  - `POST /api/clean` (multer memory storage, batas 50 MB) → parse xlsx/csv/tsv → bersihkan semua sel → JSON,
  - `GET /api/health`.
- [x] Refactor agar testable: hanya `listen` saat `require.main === module`, ekspor `createApp` & `parseBufferToGrid`.
- [x] `test/integration.test.js` — 7 test endpoint & parsing file, **tanpa framework**, semuanya **lulus**.

### Tahap 4 — Frontend ✅
- [x] `public/index.html` — tab Paste & Upload, dropzone, dropdown delimiter, pilihan kolom, tombol copy.
- [x] `public/styles.css` — styling ringan, preview tabel sticky header, highlight before→after.
- [x] `public/app.js`:
  - paste (PapaParse auto-detect delimiter + override manual),
  - upload/drag-drop → parse di browser (≤ 10 MB) atau kirim ke server (> 10 MB),
  - preview 100 baris pertama + info total,
  - pilih kolom per kolom + "Pilih Semua" / "Batal Pilih",
  - opsi `brMode` & rapatkan spasi,
  - copy TSV ke clipboard dengan fallback `execCommand('copy')` (untuk HTTP non-HTTPS) + kotak salin manual,
  - download hasil sebagai XLSX (SheetJS, semua sel format teks `@`, sel > 32.767 karakter dipotong setelah konfirmasi) atau CSV (PapaParse `unparse`, UTF-8 BOM, tanpa batas panjang sel) untuk data besar.
- [x] Struktur data: `grid` (mentah) + `cleaned` (hasil bersih); kolom tak dipilih disalin apa adanya.

### Tahap 5 — Test lokal ✅
- [x] `npm test` → **23/23 lulus** (16 unit + 7 integrasi).
- [x] Smoke test HTTP: `/`, `/app.js`, `/htmlCleaner.js`, `/vendor/xlsx.full.min.js` → semua 200.
- [x] File sampel dibuat: `test/fixtures/sample.xlsx`, `sample.csv`, `sample.tsv` (berisi HTML kompleks: nested tag, entities, `<br>`).

### Tahap 6 — Persiapan deploy ✅
- [x] `deploy/html-remover.service` — template systemd (Restart=always, LimitNOFILE, env PORT/MAX_FILE_MB).
- [x] `deploy/deploy.sh` — skrip deploy satu-langkah (`npm ci --omit=dev`, copy vendor, install & start systemd).
- [x] `README.md` — dokumentasi fitur, arsitektur, cara jalankan, test, env var, deploy, catatan Node 16.

---

## Status Rencana (PLAN.md) vs Realisasi

| Tahapan (PLAN) | Status |
|---|---|
| 1. Setup | ✅ Selesai |
| 2. Util pembersih + unit test | ✅ Selesai |
| 3. Frontend | ✅ Selesai |
| 4. Backend | ✅ Selesai |
| 5. Test lokal | ✅ Selesai |
| 6. Deployment ke prod | ⏳ **Belum** (perlu akses server) |
| 7. UAT | ⏳ **Belum** |

---

## Pekerjaan Tersisa

- [ ] **Deploy ke server prod** — jalankan `bash /opt/html-remover/deploy/deploy.sh` (atau ikuti langkah manual di README).
- [ ] **Uji di server prod** — `systemctl status`, `curl /api/health`, uji upload file besar (> 10 MB) memicu fallback server, uji tombol Copy di browser user (HTTP).
- [ ] *(Opsional)* Upgrade `multer` ke 2.x dan `xlsx` ke tarball SheetJS terbaru.
- [ ] *(Opsional)* Konfigurasi Nginx reverse proxy + `ufw allow` bila diperlukan.

---

## Lingkungan Verifikasi
- Versi Node lokal yang dipakai untuk develop/test: `v22.23.1`.
- **Target produksi:** Ubuntu 18.04.4 LTS, Node **v16.13.0** — semua kode memakai CommonJS & sintaks kompatibel Node ≥ 16 (tidak ada top-level await).
