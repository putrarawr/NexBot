import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers,
} from '@whiskeysockets/baileys';
import path from 'node:path';
import fs from 'node:fs';
import QRCode from 'qrcode';
import { logger, pinoLogger } from '../utils/logger.js';
import { getConfig } from '../config.js';

const AUTH_DIR = path.resolve(process.cwd(), 'data', 'auth');

let sock = null;
let currentQr = null;
let currentQrDataUrl = null;
let currentPairingCode = null;
let botStatus = 'disconnected'; // 'disconnected' | 'connecting' | 'connected' | 'waiting_qr'
let connectedNumber = null;
let connectStartTime = null;
let reconnectAttempts = 0;
let messageHandlerCallback = null;

export function getBotState() {
  const uptime = connectStartTime ? Math.floor((Date.now() - connectStartTime) / 1000) : 0;
  return {
    status: botStatus,
    connectedNumber,
    hasQr: !!currentQr,
    qrDataUrl: currentQrDataUrl,
    pairingCode: currentPairingCode,
    uptime,
    reconnectAttempts,
  };
}

export function getSocket() {
  return sock;
}

export async function initWhatsApp(onMessage) {
  if (onMessage) {
    messageHandlerCallback = onMessage;
  }

  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  }

  botStatus = 'connecting';
  logger.info('Menyiapkan sesi WhatsApp Baileys...');

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version, isLatest } = await fetchLatestBaileysVersion().catch(() => ({
    version: [2, 3000, 1015901307],
    isLatest: false,
  }));

  logger.info(`Baileys version: ${version.join('.')} (Latest: ${isLatest})`);

  sock = makeWASocket({
    version,
    logger: pinoLogger.child({ module: 'baileys' }),
    printQRInTerminal: false,
    auth: state,
    browser: Browsers.ubuntu('Chrome'),
    generateHighQualityLinkPreview: true,
    syncFullHistory: false,
    markOnlineOnConnect: true,
    getMessage: async (key) => {
      return { conversation: '' };
    },
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      currentQr = qr;
      try {
        currentQrDataUrl = await QRCode.toDataURL(qr, { margin: 2, scale: 6 });
      } catch (err) {
        logger.error('Gagal generate QR Data URL:', err.message);
      }
      botStatus = 'waiting_qr';
      logger.bot('QR Code baru dihasilkan. Buka Web Dashboard untuk scan atau generate Pairing Code.');
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      botStatus = 'disconnected';
      connectedNumber = null;
      connectStartTime = null;

      logger.warn(`Koneksi WhatsApp terputus. Alasan: ${statusCode || 'Unknown'}. Reconnect: ${shouldReconnect}`);

      if (shouldReconnect) {
        reconnectAttempts += 1;
        const delay = Math.min(3000 * Math.pow(1.5, reconnectAttempts), 30000);
        logger.info(`Mencoba menghubungkan kembali dalam ${Math.round(delay / 1000)} detik... (Percobaan ke-${reconnectAttempts})`);
        setTimeout(() => {
          initWhatsApp(messageHandlerCallback);
        }, delay);
      } else {
        logger.error('Sesi telah Logout dari WhatsApp. Silakan buat sesi baru melalui pairing/QR.');
        cleanAuthDirectory();
      }
    } else if (connection === 'open') {
      botStatus = 'connected';
      reconnectAttempts = 0;
      currentQr = null;
      currentQrDataUrl = null;
      currentPairingCode = null;
      connectStartTime = Date.now();

      const userJid = sock.user?.id || '';
      connectedNumber = userJid.split(':')[0] || userJid.split('@')[0];
      logger.bot(`✅ WhatsApp Bot BERHASIL TERHUBUNG sebagai: ${connectedNumber}`);
    }
  });

  sock.ev.on('messages.upsert', async (chatUpdate) => {
    if (messageHandlerCallback) {
      try {
        await messageHandlerCallback(sock, chatUpdate);
      } catch (err) {
        logger.error('Error saat mengeksekusi messageHandlerCallback:', err);
      }
    }
  });

  return sock;
}

export async function requestPairingCode(phoneNumber) {
  if (!sock) {
    throw new Error('Socket WhatsApp belum diinisialisasi.');
  }

  // Format nomor (hanya digit angka)
  const cleanNumber = String(phoneNumber).replace(/[^0-9]/g, '');
  if (!cleanNumber || cleanNumber.length < 10) {
    throw new Error('Nomor WhatsApp tidak valid. Gunakan kode negara (contoh: 6281234567890)');
  }

  try {
    botStatus = 'waiting_pairing';
    logger.info(`Meminta Pairing Code untuk nomor: ${cleanNumber}...`);
    const code = await sock.requestPairingCode(cleanNumber);
    // Format pairing code 8-digit jadi XXXX-XXXX agar mudah dibaca
    currentPairingCode = code ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
    logger.bot(`🔑 Pairing Code Dihasilkan: ${currentPairingCode}`);
    return currentPairingCode;
  } catch (err) {
    logger.error(`Gagal mendapatkan Pairing Code: ${err.message}`);
    throw err;
  }
}

export function cleanAuthDirectory() {
  if (fs.existsSync(AUTH_DIR)) {
    try {
      fs.rmSync(AUTH_DIR, { recursive: true, force: true });
      logger.info('Folder sesi auth telah dibersihkan.');
    } catch (e) {
      logger.error('Gagal membersihkan folder auth:', e.message);
    }
  }
}

export async function restartWhatsApp() {
  try {
    if (sock) {
      sock.end(new Error('Manual restart requested'));
    }
  } catch {
    // ignore
  }
  return initWhatsApp(messageHandlerCallback);
}

export async function logoutWhatsApp() {
  try {
    if (sock) {
      await sock.logout();
    }
  } catch {
    // ignore
  }
  cleanAuthDirectory();
  botStatus = 'disconnected';
  connectedNumber = null;
  currentQr = null;
  currentQrDataUrl = null;
  currentPairingCode = null;
  return initWhatsApp(messageHandlerCallback);
}
