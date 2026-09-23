#!/usr/bin/env bash
# ==============================================================================
# Script Otomatis Setup & Deploy Bot WhatsApp + Dashboard di Serv00.com
# ==============================================================================

set -e

echo "=========================================================="
echo "   🚀 SETUP OTOMATIS BOT WHATSAPP & WEB DASHBOARD (SERV00)"
echo "=========================================================="

# 1. Periksa ketersediaan perintah devil (khusus Serv00)
if command -v devil >/dev/null 2>&1; then
  echo "✅ Terdeteksi lingkungan Serv00 (devil CLI tersedia)."
  echo "👉 Mengaktifkan izin background execution..."
  devil binexec on || true

  echo "👉 Memeriksa port TCP yang sudah dibuka..."
  devil port list
else
  echo "ℹ️ Bukan di lingkungan Serv00 murni (devil CLI tidak ada). Melanjutkan dengan port standar."
fi

# 2. Setup file .env
if [ ! -f .env ]; then
  echo "👉 Membuat file konfigurasi .env dari template..."
  cp .env.example .env

  echo ""
  read -p "Masukkan port yang kamu buka di Serv00 (contoh: 25432, atau tekan ENTER untuk 3000): " INPUT_PORT
  INPUT_PORT=${INPUT_PORT:-3000}

  read -p "Masukkan Password Admin untuk Web Dashboard (default: admin123): " INPUT_PASS
  INPUT_PASS=${INPUT_PASS:-admin123}

  sed -i "s/PORT=.*/PORT=${INPUT_PORT}/" .env
  sed -i "s/ADMIN_PASSWORD=.*/ADMIN_PASSWORD=${INPUT_PASS}/" .env

  echo "✅ Konfigurasi tersimpan di .env (PORT: $INPUT_PORT)"
else
  echo "✅ File .env sudah ada."
fi

# 3. Instalasi dependensi
echo "👉 Menginstall dependensi Node.js..."
npm install --omit=dev

# 4. Menjalankan dengan PM2
echo "👉 Memulai bot dengan PM2..."
npx pm2 start ecosystem.config.cjs
npx pm2 save

echo ""
echo "=========================================================="
echo "   🎉 BOT BERHASIL DIJALANKAN DENGAN PM2!"
echo "=========================================================="
echo "Langkah selanjutnya:"
echo "1. Buka browser dan akses Web Dashboard:"
echo "   http://<server-kamu>.serv00.com:<PORT>"
echo "   (contoh: http://s12.serv00.com:25432)"
echo ""
echo "2. Login dengan password admin yang kamu buat."
echo "3. Masukkan nomor WhatsApp kamu untuk mendapatkan 8-digit Pairing Code."
echo "4. Hubungkan di aplikasi WhatsApp HP kamu!"
echo ""
echo "Perintah berguna:"
echo "• Cek status: npx pm2 status"
echo "• Cek logs:   npx pm2 logs bot-wa"
echo "• Restart:    npx pm2 restart bot-wa"
echo "=========================================================="
