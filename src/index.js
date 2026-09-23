import http from 'node:http';
import { initConfig, getConfig } from './config.js';
import { initDatabase } from './utils/database.js';
import { logger } from './utils/logger.js';
import { initWhatsApp, getBotState } from './bot/connection.js';
import { messageHandler } from './bot/handler.js';
import { createWebServer } from './web/server.js';

// Import Registrasi Modul Fitur
import { registerGameCommands } from './modules/game/index.js';
import { registerOsintCommands } from './modules/osint/index.js';
import { registerAiCommands } from './modules/ai/index.js';
import { registerProgrammingCommands } from './modules/programming/index.js';

async function bootstrap() {
  console.clear?.();
  console.log('='.repeat(55));
  console.log('       🚀 NEXBOT • WHATSAPP BOT & WEB DASHBOARD');
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
  logger.info('Semua modul perintah (Game, OSINT, AI, Pemrograman) aktif.');

  // 3. Jalankan Web Server Dashboard
  const app = createWebServer();
  const PORT = process.env.PORT || (process.env.SPACE_ID ? 7860 : 3000);
  const server = http.createServer(app);

  server.listen(PORT, '0.0.0.0', () => {
    logger.info(`🌐 Web Dashboard & API berjalan di: http://0.0.0.0:${PORT}`);
    logger.info(`🔑 Password Admin Web: ${config.adminPassword}`);
  });

  // 4. Inisialisasi WhatsApp Baileys Socket
  try {
    await initWhatsApp(messageHandler);
  } catch (err) {
    logger.error('Gagal menginisialisasi WhatsApp socket:', err.message);
  }

  // Graceful Shutdown
  const handleExit = (signal) => {
    logger.warn(`Menerima sinyal ${signal}. Menutup proses secara rapi...`);
    server.close(() => {
      process.exit(0);
    });
  };

  process.on('SIGINT', () => handleExit('SIGINT'));
  process.on('SIGTERM', () => handleExit('SIGTERM'));
}

bootstrap().catch((err) => {
  console.error('Fatal Bootstrap Error:', err);
  process.exit(1);
});
