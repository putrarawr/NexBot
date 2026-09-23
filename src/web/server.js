import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getConfig, updateConfig } from '../config.js';
import { getBotState, requestPairingCode, restartWhatsApp, logoutWhatsApp } from '../bot/connection.js';
import { getLogHistory, logEmitter, logger } from '../utils/logger.js';
import { getStats, getLeaderboard } from '../utils/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');

export function createWebServer() {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(express.static(PUBLIC_DIR));

  // Sederhana token session in-memory
  const activeSessions = new Set();

  function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();

    if (!token || !activeSessions.has(token)) {
      return res.status(401).json({ error: 'Unauthorized: PIN atau Password Admin diperlukan.' });
    }
    next();
  }

  // 1. Health Endpoint (Public, berguna untuk monitoring/uptime robot)
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    });
  });

  // 2. Auth Login Endpoint
  app.post('/api/auth/login', (req, res) => {
    const { password } = req.body || {};
    const config = getConfig();

    if (password === config.adminPassword) {
      const token = 'sess_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      activeSessions.add(token);
      return res.json({ success: true, token });
    }

    return res.status(401).json({ success: false, error: 'Password atau PIN admin salah.' });
  });

  // 3. Status & Metrik Bot
  app.get('/api/status', (req, res) => {
    const botState = getBotState();
    const config = getConfig();
    const stats = getStats();
    const mem = process.memoryUsage();

    res.json({
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        uptimeSeconds: Math.floor(process.uptime()),
        memoryRssMb: Math.round(mem.rss / 1024 / 1024),
        memoryHeapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
        memoryHeapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
      },
      bot: botState,
      config: {
        botName: config.botName,
        prefix: config.prefix,
        ownerNumber: config.ownerNumber,
        selfMode: config.selfMode !== false,
        autocomplete: config.autocomplete !== false,
        antiSpamKick: config.antiSpamKick !== false,
        reAddDelaySec: config.reAddDelaySec || 8,
        features: config.features,
        aiProvider: config.aiProvider,
        hasGroqKey: !!config.groqApiKey,
        hasGeminiKey: !!config.geminiApiKey,
      },
      stats,
    });
  });

  // 4. Request Pairing Code (Membutuhkan Auth)
  app.post('/api/pairing', authMiddleware, async (req, res) => {
    const { phoneNumber } = req.body || {};
    if (!phoneNumber) {
      return res.status(400).json({ error: 'Nomor telepon WhatsApp diperlukan.' });
    }

    try {
      const code = await requestPairingCode(phoneNumber);
      res.json({ success: true, pairingCode: code });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 5. Update Configuration (Membutuhkan Auth)
  app.post('/api/config', authMiddleware, (req, res) => {
    try {
      const updates = req.body || {};
      const newConfig = updateConfig(updates);
      logger.info('Konfigurasi bot diperbarui via Web Dashboard.');
      res.json({
        success: true,
        config: {
          botName: newConfig.botName,
          prefix: newConfig.prefix,
          features: newConfig.features,
          selfMode: newConfig.selfMode !== false,
          autocomplete: newConfig.autocomplete !== false,
          antiSpamKick: newConfig.antiSpamKick !== false,
          reAddDelaySec: newConfig.reAddDelaySec || 8,
          aiProvider: newConfig.aiProvider,
          hasGroqKey: !!newConfig.groqApiKey,
          hasGeminiKey: !!newConfig.geminiApiKey,
        },
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 6. Restart & Logout Bot (Membutuhkan Auth)
  app.post('/api/bot/restart', authMiddleware, async (req, res) => {
    try {
      await restartWhatsApp();
      res.json({ success: true, message: 'Restart WhatsApp socket diinisiasi.' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/bot/logout', authMiddleware, async (req, res) => {
    try {
      await logoutWhatsApp();
      res.json({ success: true, message: 'Berhasil logout. Folder sesi telah dibersihkan.' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 7. Get Recent Logs
  app.get('/api/logs/recent', (req, res) => {
    res.json(getLogHistory());
  });

  // 8. Server-Sent Events (SSE) Live Log Stream
  app.get('/api/logs/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    // Kirim riwayat log awal
    const initialLogs = getLogHistory();
    res.write(`data: ${JSON.stringify({ type: 'history', logs: initialLogs })}\n\n`);

    const logListener = (entry) => {
      res.write(`data: ${JSON.stringify({ type: 'log', entry })}\n\n`);
    };

    logEmitter.on('log', logListener);

    // Heartbeat keepalive setiap 15 detik agar koneksi proxy/Serv00 tidak putus
    const heartbeat = setInterval(() => {
      res.write(': keepalive\n\n');
    }, 15000);

    req.on('close', () => {
      clearInterval(heartbeat);
      logEmitter.off('log', logListener);
      res.end();
    });
  });

  // 9. Leaderboard Data Endpoint
  app.get('/api/leaderboard', (req, res) => {
    const list = getLeaderboard(20);
    res.json(list);
  });

  // Fallback routing untuk SPA (jika buka route lain arahkan ke index.html)
  app.get('*', (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  });

  return app;
}
