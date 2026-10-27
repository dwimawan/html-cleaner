#!/usr/bin/env bash
# deploy/deploy.sh
# Satu-langkah deploy ke server prod (Ubuntu 18.04, Node 16).
#
# Asumsi:
#   - Folder aplikasi sudah ada di /opt/html-remover (atau di-clone di sini).
#   - Node v16.13.0 sudah terpasang dan `node` ada di PATH.
#
# Cara pakai (jalankan di server prod sebagai user dengan akses sudo):
#   bash deploy/deploy.sh [APP_DIR]
#
# APP_DIR default: /opt/html-remover

set -euo pipefail

APP_DIR="${1:-/opt/html-remover}"

if [[ ! -d "$APP_DIR" ]]; then
  echo "ERROR: $APP_DIR tidak ditemukan. Jalankan dari folder repo atau tentukan path."
  exit 1
fi

echo "==> Install dependencies (production only)"
cd "$APP_DIR"
npm ci --omit=dev

echo "==> Pastikan library vendor tersedia di public/vendor"
mkdir -p public/vendor
cp -f node_modules/xlsx/dist/xlsx.full.min.js public/vendor/xlsx.full.min.js
cp -f node_modules/papaparse/papaparse.min.js public/vendor/papaparse.min.js

echo "==> Pasang systemd unit"
sudo cp deploy/html-remover.service /etc/systemd/system/html-remover.service
sudo systemctl daemon-reload

echo "==> (Opsional) sesuaikan user/group unit dengan yang ada di server"
echo "    Edit: /etc/systemd/system/html-remover.service"
echo "    Jika server tidak punya user www-data, ganti User=/Group= di file tsb."

echo "==> Aktifkan & mulai service"
sudo systemctl enable --now html-remover || sudo systemctl start html-remover

echo "==> Verifikasi"
sleep 2
sudo systemctl --no-pager status html-remover || true
curl -s http://localhost:3000/api/health && echo ""

echo "==> Selesai. Buka http://<IP-SERVER>:3000 di browser."
