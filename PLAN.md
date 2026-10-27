# PLAN: Aplikasi HTML Remover (Excel/CSV Cleaner)

## 1. Ringkasan Konsep

Aplikasi web internal satu halaman: user **paste data** dari Excel/CSV atau **upload file** → sistem parse → preview tabel → user pilih kolom yang mau dibersihkan → klik **Copy** → hasil (TSV) tinggal di-paste ke Excel/Google Sheets.

**Prinsip arsitektur: proses di browser, server setipis mungkin.** Server Node hanya melayani file statis + 1 endpoint fallback untuk file besar (5–50 MB). Dengan RAM 17 GB, server sanggup, tapi beban utama tetap di browser user agar server tetap dingin.

## 2. Pilihan Teknologi (paling ringan & cocok dgn server prod)

**Spesifikasi server prod:**
- Ubuntu 18.04.4 LTS
- Node.js v16.13.0
- RAM 17 GB
- Storage kosong 201 GB

| Komponen | Pilihan | Alasan |
|---|---|---|
| Runtime | **Node.js v16.13.0** (sudah terpasang) | Sesuai spec prod, tidak perlu instal apa pun di server |
| Backend | **Express 4.x** | Stabil, ringan (~1 MB), mature di Node 16. Fastify tidak perlu — traffic tool internal kecil |
| Frontend | **Vanilla HTML/CSS/JS, TANPA build step** | Tidak perlu bundler (webpack/vite), tidak perlu Node versi baru, zero build tooling di server 18.04 |
| Parser Excel | **SheetJS (`xlsx`)** | Satu-satunya yang membaca `.xls` & `.xlsx` dengan ringan. Dipakai di browser *dan* server (fallback) |
| Parser CSV/TSV | **PapaParse 5.x** | Auto-detect delimiter (tab/koma/titik koma), cepat, jalan di browser & Node |
| Strip HTML (browser) | **DOM native** (`innerHTML` → `textContent`) | Zero dependency, otomatis decode `&amp;` `&nbsp;`, aman |
| Strip HTML (server) | **`striptags`** | ~10 KB, tanpa dependency berat |
| Upload handler | **`multer`** | Standar Express, limit ukuran file |
| Process manager | **systemd unit** | Bawaan Ubuntu, zero overhead dibanding PM2 (PM2 tetap disediakan sebagai opsi) |
| Reverse proxy | **Nginx** *(opsional, hanya jika sudah ada di server)* | Bisa juga expose port langsung |

**Tidak dipakai:** React/Vue (overkill + butuh build), database (tidak ada data yang disimpan), library penulis xlsx (output cukup clipboard).

**Total footprint:** `node_modules` ± 10–15 MB, memori runtime server ± 60–100 MB. Sangat jauh di bawah kapasitas server.

## 3. Struktur Proyek

```
html-remover/
├── package.json
├── server/
│   ├── index.js        # Express: static files + POST /api/clean (fallback file besar)
│   └── htmlCleaner.js  # Util strip HTML versi server (striptags)
├── public/
│   ├── index.html      # Satu halaman: area paste + dropzone upload
│   ├── app.js          # Logika: parse → preview → pilih kolom → copy
│   ├── htmlCleaner.js  # Util strip HTML versi browser (DOM native)
│   ├── styles.css
│   └── vendor/         # xlsx.min.js, papaparse.min.js (di-copy dari node_modules)
├── test/
│   └── htmlCleaner.test.js   # Test util dengan runner bawaan Node 16 (node:test)
└── deploy/
    └── html-remover.service  # Template systemd unit
```

## 4. Alur Fitur Detail

**Input — 2 jalur:**
1. **Paste**: textarea besar. Paste dari Excel/Google Sheets otomatis berupa TSV; paste CSV mentah juga bisa. PapaParse auto-detect delimiter.
2. **Upload**: drag-and-drop zone + tombol browse, menerima `.xlsx`, `.xls`, `.csv`. Validasi ekstensi & ukuran (limit default 50 MB, configurable).
   - ≤ ambang (mis. 10 MB) → parse di browser.
   - > ambang / parse browser gagal → kirim ke `POST /api/clean`, diproses server, hasil JSON dikembalikan.

**Pembersihan HTML:**
- Strip semua tag, decode HTML entities (`&amp;`→`&`, `&nbsp;`→spasi).
- `<br>`, `</p>`, `</div>`, `</li>` → dikonversi dulu (opsi user: jadi **spasi** *(default, aman untuk paste ke Excel)* atau **newline**).
- Normalisasi whitespace berlebih (opsi, default ON).
- Sel yang mengandung tab/newline disanitasi saat copy agar struktur kolom Excel tidak rusak.

**Preview & seleksi kolom:**
- Tabel preview (render 100 baris pertama + info total baris, agar data 50 MB tidak membuat browser freeze).
- Checkbox per kolom + tombol **"Pilih Semua"**.
- Toggle preview before/after + counter "X sel dibersihkan".

**Output:**
- Tombol **Copy to Clipboard** → data bersih sebagai TSV via `navigator.clipboard.writeText`.
- **Fallback penting:** Clipboard API hanya jalan di HTTPS/localhost. Karena kemungkinan diakses via `http://ip-server`, disediakan fallback `document.execCommand('copy')` via textarea tersembunyi.

## 5. Dependensi (semua kompatibel Node 16)

```json
"express": "^4.19.x", "multer": "^1.4.5-lts.x",
"xlsx": "0.18.5", "papaparse": "^5.4.x", "striptags": "^3.2.x"
```

> Catatan: `xlsx` di npm mentok di 0.18.5 (versi baru hanya di CDN SheetJS). Untuk tool internal ini 0.18.5 cukup; opsi upgrade via tarball SheetJS dicatat di README.

## 6. Tahapan Implementasi

1. **Setup** — init `package.json`, struktur folder, install deps.
2. **Util pembersih** — `htmlCleaner.js` (browser & server) + unit test (`node:test`, tanpa framework tambahan).
3. **Frontend** — UI paste/upload → parse → preview → seleksi kolom → copy (dengan fallback clipboard).
4. **Backend** — static server + `POST /api/clean` (multer → parse → bersihkan → JSON).
5. **Test lokal** — unit test + uji file sampel: xlsx 30–50 MB, CSV, paste TSV, sel ber-HTML kompleks (nested tag, entities, `<br>`).
6. **Deployment ke prod:**
   - `git clone` / `scp` ke server → `npm ci --omit=dev`
   - Copy library vendor ke `public/vendor/`
   - Pasang **systemd unit** (`Restart=always`, `LimitNOFILE`, env `PORT`)
   - Nginx reverse proxy *(opsional)* + `ufw allow <port>`
   - Verifikasi: `systemctl status`, uji upload 50 MB, uji copy di browser user.
7. **UAT** — uji skenario nyata user di server prod.

## 7. Risiko & Mitigasi

| Risiko | Mitigasi |
|---|---|
| Ubuntu 18.04 sudah EOL (repo apt lama) | Aplikasi zero system-dependency — hanya butuh Node 16 yang sudah ada |
| Clipboard API diblokir di HTTP (non-HTTPS) | Fallback `execCommand('copy')` + instruksi di UI |
| File xlsx 50 MB berat di browser user lama | Endpoint fallback server (RAM 17 GB aman) + loading indicator + batasi baris preview |
| Paste Excel gagal karena delimiter aneh (semicolon CSV lokal ID) | PapaParse auto-detect + dropdown override delimiter manual |

## Estimasi

± 1–2 hari kerja (implementasi + testing + deploy).
