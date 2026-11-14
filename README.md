# HTML Remover

Web tool internal satu halaman untuk **menghapus HTML** dari data Excel/CSV, lalu hasilnya bisa langsung **di-copy** ke Excel / Google Sheets.

## Fitur

- **Paste** data dari Excel / Google Sheets (TSV) atau paste CSV mentah (delimiter auto-detect + bisa dipilih manual).
- **Upload file** `.xlsx`, `.xls`, `.csv`, `.tsv` (drag-and-drop atau tombol browse), maks 50 MB.
- **Pilih kolom** mana saja yang dibersihkan, atau "Pilih Semua".
- Bersihkan HTML: hapus semua tag, decode entities (`&amp;` → `&`, `&nbsp;` → spasi), opsi render `<br>`/block jadi spasi atau baris baru, opsi rapatkan spasi.
- **Copy hasil** sebagai TSV ke clipboard (dengan fallback untuk akses HTTP non-HTTPS).
- **Download hasil** sebagai `.xlsx` (semua sel bertipe **teks**, jadi `00123`, `1-2`, atau tanggal tidak diubah Excel) atau `.csv` — berguna untuk data besar yang tidak muat di clipboard. Sel yang melebihi batas 32.767 karakter per sel milik Excel akan dikonfirmasi lalu dipotong; pakai CSV bila butuh isi lengkap.

## Arsitektur

- Proses utama di **browser** agar server tetap ringan.
- **Server**: Express 4 (Node 16) hanya menyajikan file statis + 1 endpoint `POST /api/clean` sebagai **fallback** untuk file besar (> 10 MB).
- Frontend: **Vanilla JS**, tanpa build step.

```
public/
  index.html
  app.js
  styles.css
  htmlCleaner.js      # util bersama (UMD): browser & server
  vendor/             # xlsx, papaparse (di-copy saat deploy)
server/
  index.js            # Express: static + POST /api/clean
  htmlCleaner.js      # re-export util bersama
test/
  htmlCleaner.test.js # unit test (tanpa framework, Node >= 12)
  integration.test.js # test endpoint + parse file
deploy/
  html-remover.service # template systemd unit
  deploy.sh            # skrip deploy satu-langkah
```

## Menjalankan (lokal / dev)

```bash
npm install
npm start        # lalu buka http://localhost:3000
```

## Test

```bash
npm test
```

## Variabel lingkungan server

| Variabel | Default | Keterangan |
|---|---|---|
| `PORT` | `3000` | Port listen |
| `MAX_FILE_MB` | `50` | Batas ukuran upload |

## Deploy ke server prod (Ubuntu 18.04, Node v16.13.0)

```bash
# 1. Salin folder proyek ke server, mis. /opt/html-remover
scp -r . user@server:/opt/html-remover

# 2. Jalankan skrip deploy (di server)
bash /opt/html-remover/deploy/deploy.sh /opt/html-remover

# 3. Buka http://<IP-SERVER>:3000
```

Detail lebih lengkap ada di komentar `deploy/html-remover.service` dan `deploy/deploy.sh`.

### Catatan versi

- Aplikasi ini memakai **Node v16** (sesuai server prod). Kode menghindari fitur yang butuh Node > 16 (CommonJS, tanpa top-level await).
- `xlsx` (SheetJS) di npm mentok di **0.18.5** — cukup untuk tool internal. Jika ingin versi lebih baru, ambil tarball dari `cdn.sheetjs.com` dan ganti di `package.json` + `deploy/deploy.sh`.

### Catatan clipboard (HTTP tanpa HTTPS)

`navigator.clipboard` hanya aktif di koneksi aman (HTTPS/localhost). Jika diakses via `http://IP`, aplikasi otomatis memakai fallback `document.execCommand('copy')`. Bila itu pun gagal, akan muncul kotak teks untuk menyalin manual.
