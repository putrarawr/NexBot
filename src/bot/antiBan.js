import { logger } from '../utils/logger.js';

// Cooldown tracker per sender JID (in milliseconds)
const userCooldowns = new Map();
const COOLDOWN_MS = 2500; // 2.5 detik

export function checkRateLimit(senderJid) {
  const now = Date.now();
  const lastTime = userCooldowns.get(senderJid);

  if (lastTime && now - lastTime < COOLDOWN_MS) {
    const remaining = Math.ceil((COOLDOWN_MS - (now - lastTime)) / 1000);
    return { limited: true, remaining };
  }

  userCooldowns.set(senderJid, now);

  // Bersihkan map secara periodik agar tidak membengkak di RAM
  if (userCooldowns.size > 2000) {
    const cutoff = now - 60000;
    for (const [jid, timestamp] of userCooldowns.entries()) {
      if (timestamp < cutoff) {
        userCooldowns.delete(jid);
      }
    }
  }

  return { limited: false, remaining: 0 };
}

export async function simulateTyping(sock, jid, durationMs = 500) {
  try {
    if (sock && jid) {
      await sock.sendPresenceUpdate('composing', jid);
      if (durationMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, durationMs));
      }
      await sock.sendPresenceUpdate('paused', jid);
    }
  } catch (err) {
    // Abaikan jika presence gagal
  }
}

export function createReplyHelper(sock, jid, quotedMsg = null) {
  return async function reply(content, options = {}) {
    try {
      if (!sock || !jid) return null;

      // Berikan jeda manusiawi 350ms agar pola pesan tidak terdeteksi spam
      await simulateTyping(sock, jid, options.typingMs || 350);

      const messagePayload = typeof content === 'string' ? { text: content } : content;
      const sendOptions = {
        quoted: options.quoted !== false ? quotedMsg : undefined,
        ...options,
      };

      return await sock.sendMessage(jid, messagePayload, sendOptions);
    } catch (err) {
      logger.error(`Gagal mengirim pesan balasan ke ${jid}: ${err.message}`);
      return null;
    }
  };
}
