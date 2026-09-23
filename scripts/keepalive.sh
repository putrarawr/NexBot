#!/usr/bin/env bash
# ==============================================================================
# Watchdog Keepalive Script untuk Serv00 Cron Job
# Tambahkan ke crontab dengan: crontab -e
# */10 * * * * /home/username/bot-wa/scripts/keepalive.sh >/dev/null 2>&1
# ==============================================================================

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

# Periksa apakah proses bot-wa sedang berjalan di PM2
if ! npx pm2 describe bot-wa | grep -q "online"; then
  echo "$(date): bot-wa offline. Merestart aplikasi..." >> "$DIR/data/keepalive.log"
  npx pm2 resurrect || npx pm2 start ecosystem.config.cjs
fi
