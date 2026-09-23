#!/usr/bin/env bash
# ==============================================================================
# Script Menjalankan Bot + Web Dashboard Publik via Cloudflare Tunnel
# 100% Gratis, Tanpa Kartu Kredit, Tanpa Perlu Daftar Apa Pun!
# ==============================================================================

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

echo "=========================================================="
echo "   🚀 MENYALAKAN NEXBOT + WEB DASHBOARD ONLINE"
echo "=========================================================="

# 1. Pastikan binary cloudflared tersedia
if [ ! -f "$DIR/bin/cloudflared" ]; then
  echo "👉 Mengunduh Cloudflare Tunnel binary..."
  mkdir -p "$DIR/bin"
  curl -sL -o "$DIR/bin/cloudflared" https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
  chmod +x "$DIR/bin/cloudflared"
fi

# 2. Jalankan bot di background jika belum berjalan
if ! pgrep -f "src/index.js" >/dev/null 2>&1; then
  echo "👉 Memulai server bot WhatsApp..."
  node src/index.js > data/bot.log 2>&1 &
  BOT_PID=$!
  sleep 2
else
  echo "ℹ️ Bot sudah berjalan di latar belakang."
fi

# Dapatkan IP Wi-Fi lokal
LOCAL_IP=$(hostname -I | awk '{print $1}')

echo ""
echo "=========================================================="
echo "   🌐 URL AKSES WEB DASHBOARD:"
echo "=========================================================="
echo "1. Di Laptop ini:   http://localhost:3000"
if [ -n "$LOCAL_IP" ]; then
echo "2. Di HP (Wi-Fi):   http://${LOCAL_IP}:3000"
fi
echo ""
echo "👉 Membuka Link Publik Internet (Cloudflare Tunnel)..."
echo "   (Bisa diakses dari HP via kuota/data dari mana saja!)"
echo "=========================================================="
echo ""

# Jalankan tunnel dan tampilkan URL publik
"$DIR/bin/cloudflared" tunnel --url http://127.0.0.1:3000 2>&1 | while read -r line; do
  if [[ "$line" =~ (https://[a-zA-Z0-9-]+\.trycloudflare\.com) ]]; then
    echo "🎉 LINK PUBLIK RESMI KAMU:"
    echo "👉 ${BASH_REMATCH[1]}"
    echo ""
    echo "🔑 Password Admin: admin123"
    echo "Silakan buka link di atas di browser HP atau Laptop kamu!"
    echo "=========================================================="
  fi
done
