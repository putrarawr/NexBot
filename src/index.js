import http from 'node:http';
import { initConfig, getConfig } from './config.js';
import { initDatabase } from './utils/database.js';
import { logger } from './utils/logger.js';
import { initWhatsApp } from './bot/connection.js';
import { initTelegram, stopTelegram } from './bot/telegram.js';
import { messageHandler } from './bot/handler.js';
import { createWebServer } from './web/server.js';

// Import Registrasi Modul Fitur
import { registerGameCommands } from './modules/game/index.js';
import { registerOsintCommands } from './modules/osint/index.js';
import { registerAiCommands } from './modules/ai/index.js';
import { registerProgrammingCommands } from './modules/programming/index.js';
import { registerMediaCommands } from './modules/media/index.js';
import { registerDownloaderCommands } from './modules/downloader/index.js';
import { registerGroupCommands } from './modules/group/index.js';
import { registerTelegramExclusiveCommands } from './modules/telegram/index.js';
import { registerUtilityTools } from './modules/tools/index.js';
import { registerVeriftokCommands } from './modules/veriftok/index.js';

async function bootstrap() {
  console.clear?.();
  console.log('='.repeat(55));
  console.log('       🚀 NEXBOT • DUAL BOT (WHATSAPP & TELEGRAM) & DASHBOARD');
  console.log('='.repeat(55));

  // 1. Inisialisasi Konfigurasi & Database
  const config = initConfig();
  initDatabase();
  logger.info('Konfigurasi dan database lokal berhasil dimuat.');

  // 2. Registrasi Semua Modul Command
  registerGameCommands();
  registerOsintCommands();
  registerAiCommands();
  registerProgrammingCommands();
  registerMediaCommands();
  registerDownloaderCommands();
  registerGroupCommands();
  registerTelegramExclusiveCommands();
  registerUtilityTools();
  registerVeriftokCommands();
  logger.info('Semua modul perintah (Game, OSINT, AI, Pemrograman, Media, Downloader, Grup, VerifTok) aktif.');

  // 3. Jalankan Web Server Dashboard
  const app = createWebServer();
  const PORT = process.env.PORT || (process.env.SPACE_ID ? 7860 : 3000);
  const server = http.createServer(app);

  server.listen(PORT, '0.0.0.0', () => {
    logger.info(`🌐 Web Dashboard & API berjalan di: http://0.0.0.0:${PORT}`);
    logger.info(`🔑 Password Admin Web: ${config.adminPassword}`);
  });

  // 4. Inisialisasi WhatsApp Engine (jika diaktifkan)
  if (config.enableWhatsApp !== false) {
    try {
      await initWhatsApp(messageHandler);
    } catch (err) {
      logger.error('Gagal menginisialisasi WhatsApp socket:', err.message);
    }
  } else {
    logger.info('WhatsApp Engine dinonaktifkan via konfigurasi (ENABLE_WHATSAPP=false).');
  }

  // 5. Inisialisasi Telegram Engine (jika diaktifkan dan token tersedia)
  if (config.enableTelegram !== false && (config.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN)) {
    try {
      await initTelegram();
    } catch (err) {
      logger.error('Gagal menginisialisasi Telegram bot:', err.message);
    }
  } else if (!config.telegramBotToken && !process.env.TELEGRAM_BOT_TOKEN) {
    logger.info('Telegram Bot standby: Isi TELEGRAM_BOT_TOKEN di .env untuk mengaktifkan.');
  }

  // Graceful Shutdown
  const handleExit = async (signal) => {
    logger.warn(`Menerima sinyal ${signal}. Menutup proses...`);
    try {
      await stopTelegram();
      server.close();
      server.closeAllConnections?.();
    } catch {}
    process.exit(0);
  };

  process.on('SIGINT', () => handleExit('SIGINT'));
  process.on('SIGTERM', () => handleExit('SIGTERM'));
}

bootstrap().catch((err) => {
  console.error('Fatal Bootstrap Error:', err);
  process.exit(1);
});
