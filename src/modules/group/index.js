import { registerCommand } from '../../bot/handler.js';
import { logger } from '../../utils/logger.js';

// In-memory AFK store: Key = senderJid -> { reason, time, name }
const afkStore = new Map();

export function setAfk(senderJid, reason = 'Tanpa alasan', name = 'User') {
  afkStore.set(senderJid, {
    reason,
    time: Date.now(),
    name,
  });
}

export function getAfk(senderJid) {
  return afkStore.get(senderJid);
}

export function removeAfk(senderJid) {
  return afkStore.delete(senderJid);
}

export function formatTimeAgo(ms) {
  const sec = Math.floor((Date.now() - ms) / 1000);
  if (sec < 60) return `${sec} detik`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} menit`;
  const hr = Math.floor(min / 60);
  return `${hr} jam ${min % 60} menit`;
}

export async function handleAfkInteractions({ sender, pushName, text, contextInfo, reply }) {
  // 1. Cek apakah pengirim sendiri sebelumnya berstatus AFK
  if (afkStore.has(sender)) {
    const afk = afkStore.get(sender);
    removeAfk(sender);
    const duration = formatTimeAgo(afk.time);
    const senderNum = sender.replace(/[^0-9]/g, '');

    await reply(`👋 Selamat datang kembali @${senderNum}!\nStatus AFK dinonaktifkan setelah *${duration}*.\nAlasan sebelumnya: _"${afk.reason}"_`, {
      mentions: [sender],
    });
    return;
  }

  // 2. Cek apakah ada member lain yang di-tag/mention dan sedang AFK
  const mentionedJids = contextInfo?.mentionedJid || [];
  for (const targetJid of mentionedJids) {
    if (afkStore.has(targetJid)) {
      const afk = afkStore.get(targetJid);
      const targetNum = targetJid.replace(/[^0-9]/g, '');
      const duration = formatTimeAgo(afk.time);

      await reply(`⚠️ Jangan tag @${targetNum}, dia sedang *AFK* sejak ${duration} lalu!\nAlasan: _"${afk.reason}"_`, {
        mentions: [targetJid],
      });
      break; // Beritahu sekali per pesan agar tidak spam
    }
  }
}

export function registerGroupCommands() {
  // 1. Command: Hidetag (.hidetag / .h)
  registerCommand({
    name: 'hidetag',
    aliases: ['h', 'totag', 'tagall'],
    category: 'group',
    description: 'Menandai (mention) seluruh anggota grup secara senyap',
    usage: '.hidetag <pesan>',
    async execute({ sock, msg, jid, sender, fullText, isGroup, reply, config }) {
      if (!jid.endsWith('@g.us')) {
        return reply('⚠️ Perintah ini hanya dapat digunakan di dalam Grup WhatsApp!');
      }

      try {
        const groupMeta = await sock.groupMetadata(jid);
        const senderClean = sender.replace(/[^0-9]/g, '');
        const senderMember = groupMeta.participants.find((p) =>
          p.id.replace(/[^0-9]/g, '').startsWith(senderClean)
        );
        const isSenderAdmin = senderMember && (senderMember.admin === 'admin' || senderMember.admin === 'superadmin');
        const isOwner = config.ownerNumber && senderClean.includes(config.ownerNumber.replace(/[^0-9]/g, ''));

        if (!isSenderAdmin && !isOwner) {
          return reply('⚠️ Perintah `.hidetag` hanya boleh digunakan oleh Admin Grup!');
        }

        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        let messageText = fullText?.trim();

        if (!messageText && quoted) {
          messageText = quoted.conversation || quoted.extendedTextMessage?.text || '';
        }

        if (!messageText) {
          messageText = '📢 *Panggilan Pengumuman Grup!*';
        }

        const participants = groupMeta.participants.map((p) => p.id);

        await sock.sendMessage(jid, {
          text: messageText,
          mentions: participants,
        });
      } catch (err) {
        logger.error('Error saat hidetag:', err.message);
        await reply(`❌ Gagal melakukan hidetag: ${err.message}`);
      }
    },
  });

  // 2. Command: AFK (.afk)
  registerCommand({
    name: 'afk',
    aliases: ['away'],
    category: 'group',
    description: 'Mengaktifkan status AFK (Away From Keyboard) dengan alasan',
    usage: '.afk [alasan]',
    async execute({ sender, pushName, fullText, reply }) {
      const reason = fullText?.trim() || 'Tanpa alasan';
      setAfk(sender, reason, pushName);
      const senderNum = sender.replace(/[^0-9]/g, '');

      let msg = `💤 *STATUS AFK DIAKTIFKAN*\n\n`;
      msg += `👤 Pengguna: @${senderNum}\n`;
      msg += `📝 Alasan: _"${reason}"_\n\n`;
      msg += `Bot otomatis memberitahu member lain jika kamu di-tag di grup. Ketik pesan apa saja untuk kembali aktif!`;

      await reply(msg, { mentions: [sender] });
    },
  });
}
