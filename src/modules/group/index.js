import { registerCommand } from '../../bot/handler.js';
import { logger } from '../../utils/logger.js';
import { updateConfig, getConfig } from '../../config.js';
import { areJidsSameUser, jidNormalizedUser } from '@whiskeysockets/baileys';

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

    await reply(`[+] Selamat datang kembali @${senderNum}!\nStatus AFK dinonaktifkan setelah ${duration}.\nAlasan sebelumnya: "${afk.reason}"`, {
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

      await reply(`[!] @${targetNum} sedang AFK sejak ${duration} lalu.\nAlasan: "${afk.reason}"`, {
        mentions: [targetJid],
      });
      break;
    }
  }
}

// In-memory Antilink status per group: Set of jids
const antilinkGroups = new Set();

export function isAntilinkActive(jid) {
  return antilinkGroups.has(jid);
}

export function setAntilink(jid, active) {
  if (active) antilinkGroups.add(jid);
  else antilinkGroups.delete(jid);
}

export const MSG_SENDER_NOT_ADMIN = '[!] Perintah ini hanya dapat digunakan oleh Admin Grup.';
export const MSG_BOT_NOT_ADMIN = `[ ⚠️ AKSES ADMIN DIBUTUHKAN ]

Akun WhatsApp Bot belum berstatus *Admin* di grup ini.

💡 *Cara mengaktifkan:*
1. Buka *Info Grup* di WhatsApp
2. Gulir ke bawah ke daftar anggota & cari kontak Bot
3. Ketuk nama Bot > pilih *Jadikan Admin Grup*

WhatsApp mewajibkan Bot menjadi Admin untuk mengelola anggota, perizinan grup, dan link undangan.`;

export const MSG_OWNER_ONLY = `[ ⛔ KHUSUS OWNER BOT ]

Perintah manajemen grup ini dibatasi hanya untuk *Owner Bot* demi keamanan & privasi grup.

💡 _Jika ingin membuka akses untuk semua admin grup, Owner dapat mengetik:_
*.groupmode admin*`;

export function cleanJidNumber(jid) {
  if (!jid) return '';
  const userPart = String(jid).split('@')[0].split(':')[0];
  let digits = userPart.replace(/[^0-9]/g, '');
  if (digits.startsWith('0')) {
    digits = '62' + digits.slice(1);
  }
  return digits;
}

export function isUserOwner({ sender, msg, sock, config, senderMember } = {}) {
  // 1. WhatsApp native session check (pesan dikirim dari akun bot itu sendiri)
  if (msg?.key?.fromMe) return true;

  // 2. Sock user matching (id / lid bot)
  const botJid = sock?.user?.id || sock?.authState?.creds?.me?.id || null;
  const botLid = sock?.user?.lid || sock?.authState?.creds?.me?.lid || null;
  if (botJid || botLid) {
    if (sender && matchesParticipant({ id: sender }, botJid, botLid)) return true;
    if (senderMember && matchesParticipant(senderMember, botJid, botLid)) return true;
  }

  // 3. Config & Environment ownerNumber check
  const configuredOwner = config?.ownerNumber || process.env.OWNER_NUMBER || '';
  const ownerNum = cleanJidNumber(configuredOwner);

  if (ownerNum.length >= 7) {
    const senderNum = cleanJidNumber(sender);
    if (senderNum && (senderNum === ownerNum || senderNum.endsWith(ownerNum) || ownerNum.endsWith(senderNum))) {
      return true;
    }
    if (senderMember) {
      const idNum = cleanJidNumber(senderMember.id);
      const jidNum = cleanJidNumber(senderMember.jid);
      if (idNum && (idNum === ownerNum || idNum.endsWith(ownerNum) || ownerNum.endsWith(idNum))) return true;
      if (jidNum && (jidNum === ownerNum || jidNum.endsWith(ownerNum) || ownerNum.endsWith(jidNum))) return true;
    }
  }

  return false;
}

export function matchesParticipant(p, targetJid, targetLid = null) {
  if (!p) return false;

  const targetJidNorm = targetJid ? jidNormalizedUser(targetJid) : null;
  const targetLidNorm = targetLid ? jidNormalizedUser(targetLid) : null;

  const pId = p.id || '';
  const pJid = p.jid || '';
  const pLid = p.lid || '';

  const pIdNorm = pId ? jidNormalizedUser(pId) : '';
  const pJidNorm = pJid ? jidNormalizedUser(pJid) : '';
  const pLidNorm = pLid ? jidNormalizedUser(pLid) : '';

  // 1. Direct or normalized string matching
  if (targetJidNorm) {
    if (pIdNorm === targetJidNorm || pJidNorm === targetJidNorm || pLidNorm === targetJidNorm) return true;
    if (pId === targetJid || pJid === targetJid || pLid === targetJid) return true;
    try {
      if (pId && areJidsSameUser(pId, targetJid)) return true;
      if (pJid && areJidsSameUser(pJid, targetJid)) return true;
      if (pLid && areJidsSameUser(pLid, targetJid)) return true;
    } catch {}
  }

  if (targetLidNorm) {
    if (pIdNorm === targetLidNorm || pLidNorm === targetLidNorm || pJidNorm === targetLidNorm) return true;
    if (pId === targetLid || pLid === targetLid || pJid === targetLid) return true;
    try {
      if (pId && areJidsSameUser(pId, targetLid)) return true;
      if (pLid && areJidsSameUser(pLid, targetLid)) return true;
    } catch {}
  }

  // 2. Phone number digit matching (ignoring device :1 suffix and domain)
  if (targetJid) {
    const targetDigits = (targetJid.split('@')[0] || '').split(':')[0].replace(/[^0-9]/g, '');
    if (targetDigits.length >= 7) {
      const pIdDigits = (pId.split('@')[0] || '').split(':')[0].replace(/[^0-9]/g, '');
      const pJidDigits = (pJid.split('@')[0] || '').split(':')[0].replace(/[^0-9]/g, '');
      if (pIdDigits === targetDigits || pJidDigits === targetDigits) return true;
    }
  }

  // 3. LID digit matching
  if (targetLid) {
    const targetLidDigits = (targetLid.split('@')[0] || '').split(':')[0].replace(/[^0-9]/g, '');
    if (targetLidDigits.length >= 7) {
      const pIdDigits = (pId.split('@')[0] || '').split(':')[0].replace(/[^0-9]/g, '');
      const pLidDigits = (pLid.split('@')[0] || '').split(':')[0].replace(/[^0-9]/g, '');
      if (pIdDigits === targetLidDigits || pLidDigits === targetLidDigits) return true;
    }
  }

  return false;
}

export function isParticipantAdminRole(p) {
  return Boolean(
    p && (p.admin === 'admin' || p.admin === 'superadmin' || p.admin === true || p.isAdmin === true)
  );
}

export async function checkAntilinkMessage({ sock, jid, sender, text, msg, reply, config }) {
  if (!jid.endsWith('@g.us')) return false;
  if (!isAntilinkActive(jid)) return false;

  // Regex link invite grup WhatsApp
  const linkRegex = /(chat\.whatsapp\.com\/[0-9A-Za-z]{20,24}|wa\.me\/settings)/i;
  if (!linkRegex.test(text)) return false;

  const isOwner = isUserOwner({ sender, msg, sock, config });
  if (isOwner) return false;

  const senderClean = cleanJidNumber(sender);

  try {
    const meta = await sock.groupMetadata(jid);
    const member = meta.participants?.find((p) => matchesParticipant(p, sender));
    const isAdmin = isParticipantAdminRole(member);
    if (isAdmin) return false; // Admin bebas kirim link

    // Hapus pesan link jika bot adalah admin
    const botJid = sock.user?.id || sock.authState?.creds?.me?.id || null;
    const botLid = sock.user?.lid || sock.authState?.creds?.me?.lid || null;
    const botMember = meta.participants?.find((p) => matchesParticipant(p, botJid, botLid));
    const isBotAdmin = isParticipantAdminRole(botMember);

    if (isBotAdmin && msg?.key) {
      await sock.sendMessage(jid, { delete: msg.key }).catch(() => {});
    }

    await reply(`[ ⚠️ ANTILINK GRUP ]\n\nPeringatan @${senderClean}! Dilarang membagikan link grup WhatsApp di sini.`, {
      mentions: [sender],
    });
    return true;
  } catch {
    return false;
  }
}

export async function checkGroupAdminPerms(sock, jid, sender, config, msg = null) {
  const meta = await sock.groupMetadata(jid);
  const participants = meta.participants || [];

  // Bot resolution
  const botJid = sock.user?.id || sock.authState?.creds?.me?.id || null;
  const botLid = sock.user?.lid || sock.authState?.creds?.me?.lid || null;
  const botMember = participants.find((p) => matchesParticipant(p, botJid, botLid));
  const isBotAdmin = isParticipantAdminRole(botMember);

  // Sender resolution
  const senderMember = participants.find((p) => matchesParticipant(p, sender));

  // Determine Owner Status
  const isSenderOwner = isUserOwner({ sender, msg, sock, config, senderMember });

  // Admin status in WhatsApp group
  const isParticipantAdmin = isParticipantAdminRole(senderMember);
  const isSenderAdmin = Boolean(isSenderOwner || isParticipantAdmin);

  // Mode perizinan: khusus owner (default: true) vs semua admin grup (false)
  const isOwnerOnly = config?.groupOwnerOnly !== false;
  const isAllowed = isOwnerOnly ? isSenderOwner : isSenderAdmin;

  let rejectReason = null;
  if (!isAllowed) {
    if (isOwnerOnly && !isSenderOwner) {
      rejectReason = MSG_OWNER_ONLY;
    } else {
      rejectReason = MSG_SENDER_NOT_ADMIN;
    }
  }

  return {
    isSenderAdmin,
    isBotAdmin,
    isSenderOwner,
    isOwnerOnly,
    isAllowed,
    rejectReason,
    meta,
    senderMember,
    botMember,
  };
}

export function getContextInfo(msg) {
  const m = msg?.message;
  if (!m) return null;
  return (
    m.extendedTextMessage?.contextInfo ||
    m.imageMessage?.contextInfo ||
    m.videoMessage?.contextInfo ||
    m.stickerMessage?.contextInfo ||
    m.documentMessage?.contextInfo ||
    m.audioMessage?.contextInfo ||
    null
  );
}

export function resolveTargetJid(msg, args) {
  const ctxInfo = getContextInfo(msg);
  if (ctxInfo?.mentionedJid && ctxInfo.mentionedJid.length > 0) {
    return jidNormalizedUser(ctxInfo.mentionedJid[0]);
  }
  if (ctxInfo?.participant) {
    return jidNormalizedUser(ctxInfo.participant);
  }
  if (args && args[0]) {
    const cleanNum = args[0].replace(/[^0-9]/g, '');
    if (cleanNum.length >= 7) {
      return `${cleanNum}@s.whatsapp.net`;
    }
  }
  return null;
}

export function registerGroupCommands() {
  // 1. Command: Hidetag (.hidetag / .h)
  registerCommand({
    name: 'hidetag',
    aliases: ['h', 'totag', 'ghosttag'],
    category: 'group',
    description: 'Menandai seluruh anggota grup secara senyap (otomatis terhapus)',
    usage: '.hidetag <pesan> (tambahkan --keep jika tidak ingin dihapus)',
    platforms: ['whatsapp'],
    async execute({ sock, msg, jid, sender, fullText, reply, config }) {
      if (!jid.endsWith('@g.us')) {
        return reply('[!] Perintah ini hanya dapat digunakan di dalam Grup WhatsApp.');
      }

      try {
        const { isAllowed, isBotAdmin, rejectReason, meta } = await checkGroupAdminPerms(sock, jid, sender, config, msg);
        if (!isAllowed) {
          return reply(rejectReason || MSG_SENDER_NOT_ADMIN);
        }

        const keepMessage = /--keep|-k\b/i.test(fullText || '');
        let cleanText = (fullText || '').replace(/--(keep|k)\b|-k\b/gi, '').trim();

        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        let messageText = cleanText;
        if (!messageText && quoted) {
          messageText = quoted.conversation || quoted.extendedTextMessage?.text || '';
        }
        if (!messageText) messageText = '[PENGUMUMAN GRUP]';

        const participants = meta.participants.map((p) => p.id);
        const sent = await sock.sendMessage(jid, {
          text: messageText,
          mentions: participants,
        });

        // Hapus chat bot dan pesan perintah secara senyap setelah jeda 4 detik
        if (!keepMessage) {
          setTimeout(async () => {
            try {
              if (sent?.key) {
                await sock.sendMessage(jid, { delete: sent.key }).catch(() => {});
              }
              if (isBotAdmin && msg?.key) {
                await sock.sendMessage(jid, { delete: msg.key }).catch(() => {});
              }
            } catch (delErr) {
              logger.debug('Gagal auto-delete pesan hidetag:', delErr?.message);
            }
          }, 4000);
        }
      } catch (err) {
        logger.error('Error saat hidetag:', err.message);
        await reply(`[!] Gagal melakukan hidetag: ${err.message}`);
      }
    },
  });

  // 2. Command: TagAll (.tagall)
  registerCommand({
    name: 'tagall',
    aliases: ['semua', 'tagmember'],
    category: 'group',
    description: 'Mention seluruh anggota grup dengan daftar nomor terbuka',
    usage: '.tagall [pesan]',
    platforms: ['whatsapp'],
    async execute({ sock, msg, jid, sender, fullText, reply, config }) {
      if (!jid.endsWith('@g.us')) {
        return reply('[!] Perintah ini hanya dapat digunakan di dalam Grup WhatsApp.');
      }

      try {
        const { isAllowed, rejectReason, meta } = await checkGroupAdminPerms(sock, jid, sender, config, msg);
        if (!isAllowed) {
          return reply(rejectReason || MSG_SENDER_NOT_ADMIN);
        }

        const participants = meta.participants.map((p) => p.id);
        const header = fullText?.trim() || 'Panggilan untuk seluruh anggota grup';

        let tagText = `<b>[ 📢 PANGGILAN ANGGOTA GRUP ]</b>\n\n`;
        tagText += `Pesan: <i>${header}</i>\n`;
        tagText += `Total Anggota: <b>${participants.length}</b>\n\n`;

        for (let i = 0; i < participants.length; i++) {
          const num = participants[i].replace(/[^0-9]/g, '');
          tagText += `${i + 1}. @${num}\n`;
        }

        await sock.sendMessage(jid, {
          text: tagText,
          mentions: participants,
        });
      } catch (err) {
        await reply(`[!] Gagal tagall: ${err.message}`);
      }
    },
  });

  // 3. Command: Kick (.kick)
  registerCommand({
    name: 'kick',
    aliases: ['tendang', 'remove'],
    category: 'group',
    description: 'Mengeluarkan anggota dari grup (balas pesan atau tag @user)',
    usage: '.kick @user / balas pesan member',
    platforms: ['whatsapp'],
    async execute({ sock, msg, jid, sender, args, reply, config }) {
      if (!jid.endsWith('@g.us')) return reply('[!] Khusus grup WhatsApp.');

      const target = resolveTargetJid(msg, args);
      if (!target) {
        return reply('[!] Format salah. Silakan tag (@user) atau balas (*reply*) pesan anggota yang ingin dikeluarkan.\nContoh: .kick @628123456789');
      }

      try {
        const { isAllowed, isBotAdmin, rejectReason } = await checkGroupAdminPerms(sock, jid, sender, config, msg);
        if (!isAllowed) return reply(rejectReason || MSG_SENDER_NOT_ADMIN);
        if (!isBotAdmin) return reply(MSG_BOT_NOT_ADMIN);

        const botJid = sock.user?.id || sock.authState?.creds?.me?.id || null;
        const botLid = sock.user?.lid || sock.authState?.creds?.me?.lid || null;
        if (matchesParticipant({ id: target }, botJid, botLid)) {
          return reply('[!] Bot tidak dapat mengeluarkan dirinya sendiri.');
        }

        if (isUserOwner({ sender: target, sock, config })) {
          return reply('[!] Tidak dapat mengeluarkan Owner Bot dari grup.');
        }

        const targetClean = cleanJidNumber(target);
        await sock.groupParticipantsUpdate(jid, [target], 'remove');
        await reply(`[+] Berhasil mengeluarkan @${targetClean} dari grup.`, { mentions: [target] });
      } catch (err) {
        await reply(`[!] Gagal mengeluarkan anggota: ${err.message}`);
      }
    },
  });

  // 4. Command: Add (.add)
  registerCommand({
    name: 'add',
    aliases: ['tambah', 'invite'],
    category: 'group',
    description: 'Menambahkan anggota baru ke grup',
    usage: '.add 628xxxxxxxx',
    platforms: ['whatsapp'],
    async execute({ sock, msg, jid, sender, args, reply, config }) {
      if (!jid.endsWith('@g.us')) return reply('[!] Khusus grup WhatsApp.');

      const num = (args[0] || '').replace(/[^0-9]/g, '');
      if (num.length < 9) {
        return reply('[!] Masukkan nomor yang valid untuk ditambahkan.\nContoh: .add 628123456789');
      }

      try {
        const { isAllowed, isBotAdmin, rejectReason } = await checkGroupAdminPerms(sock, jid, sender, config, msg);
        if (!isAllowed) return reply(rejectReason || MSG_SENDER_NOT_ADMIN);
        if (!isBotAdmin) return reply(MSG_BOT_NOT_ADMIN);

        const targetJid = `${num}@s.whatsapp.net`;
        await sock.groupParticipantsUpdate(jid, [targetJid], 'add');
        await reply(`[+] Berhasil menambahkan @${num} ke grup.`, { mentions: [targetJid] });
      } catch (err) {
        await reply(`[!] Gagal menambahkan anggota: ${err.message}`);
      }
    },
  });

  // 5. Command: Promote (.promote)
  registerCommand({
    name: 'promote',
    aliases: ['admin', 'jadiadmin'],
    category: 'group',
    description: 'Menaikkan jabatan anggota menjadi Admin Grup',
    usage: '.promote @user / balas pesan',
    platforms: ['whatsapp'],
    async execute({ sock, msg, jid, sender, args, reply, config }) {
      if (!jid.endsWith('@g.us')) return reply('[!] Khusus grup WhatsApp.');

      const target = resolveTargetJid(msg, args);
      if (!target) {
        return reply('[!] Format salah. Silakan tag (@user) atau balas (*reply*) pesan anggota yang ingin dijadikan Admin.\nContoh: .promote @628123456789');
      }

      try {
        const { isAllowed, isBotAdmin, rejectReason } = await checkGroupAdminPerms(sock, jid, sender, config, msg);
        if (!isAllowed) return reply(rejectReason || MSG_SENDER_NOT_ADMIN);
        if (!isBotAdmin) return reply(MSG_BOT_NOT_ADMIN);

        await sock.groupParticipantsUpdate(jid, [target], 'promote');
        await reply(`[+] Selamat! @${cleanJidNumber(target)} sekarang adalah Admin Grup.`, { mentions: [target] });
      } catch (err) {
        await reply(`[!] Gagal promote: ${err.message}`);
      }
    },
  });

  // 6. Command: Demote (.demote)
  registerCommand({
    name: 'demote',
    aliases: ['unadmin', 'turunadmin'],
    category: 'group',
    description: 'Menurunkan jabatan Admin menjadi anggota biasa',
    usage: '.demote @user / balas pesan',
    platforms: ['whatsapp'],
    async execute({ sock, msg, jid, sender, args, reply, config }) {
      if (!jid.endsWith('@g.us')) return reply('[!] Khusus grup WhatsApp.');

      const target = resolveTargetJid(msg, args);
      if (!target) {
        return reply('[!] Format salah. Silakan tag (@user) atau balas (*reply*) pesan admin yang ingin diturunkan jabatannya.\nContoh: .demote @628123456789');
      }

      try {
        const { isAllowed, isBotAdmin, rejectReason } = await checkGroupAdminPerms(sock, jid, sender, config, msg);
        if (!isAllowed) return reply(rejectReason || MSG_SENDER_NOT_ADMIN);
        if (!isBotAdmin) return reply(MSG_BOT_NOT_ADMIN);

        const botJid = sock.user?.id || sock.authState?.creds?.me?.id || null;
        const botLid = sock.user?.lid || sock.authState?.creds?.me?.lid || null;
        if (matchesParticipant({ id: target }, botJid, botLid)) {
          return reply('[!] Bot tidak dapat menurunkan jabatan dirinya sendiri.');
        }

        if (isUserOwner({ sender: target, sock, config })) {
          return reply('[!] Tidak dapat menurunkan jabatan Owner Bot.');
        }

        await sock.groupParticipantsUpdate(jid, [target], 'demote');
        await reply(`[+] @${cleanJidNumber(target)} telah diturunkan menjadi anggota biasa.`, { mentions: [target] });
      } catch (err) {
        await reply(`[!] Gagal demote: ${err.message}`);
      }
    },
  });

  // 7. Command: Group Open/Close (.group)
  registerCommand({
    name: 'group',
    aliases: ['grup', 'setgroup'],
    category: 'group',
    description: 'Membuka atau menutup izin kirim pesan grup',
    usage: '.group open / .group close',
    platforms: ['whatsapp'],
    async execute({ sock, msg, jid, sender, args, reply, config }) {
      if (!jid.endsWith('@g.us')) return reply('[!] Khusus grup WhatsApp.');

      const action = (args[0] || '').toLowerCase();
      if (!action || !['open', 'buka', 'close', 'tutup'].includes(action)) {
        return reply('[!] Format salah. Gunakan:\n• .group open (Buka grup untuk semua anggota)\n• .group close (Tutup grup hanya untuk admin)');
      }

      try {
        const { isAllowed, isBotAdmin, rejectReason } = await checkGroupAdminPerms(sock, jid, sender, config, msg);
        if (!isAllowed) return reply(rejectReason || MSG_SENDER_NOT_ADMIN);
        if (!isBotAdmin) return reply(MSG_BOT_NOT_ADMIN);

        if (action === 'open' || action === 'buka') {
          await sock.groupSettingUpdate(jid, 'not_announcement');
          await reply('[+] Grup telah dibuka. Seluruh anggota sekarang dapat mengirim pesan.');
        } else {
          await sock.groupSettingUpdate(jid, 'announcement');
          await reply('[+] Grup telah ditutup. Hanya Admin Grup yang dapat mengirim pesan.');
        }
      } catch (err) {
        await reply(`[!] Gagal mengubah setelan grup: ${err.message}`);
      }
    },
  });

  // 8. Command: Link Group & Revoke (.linkgc / .revoke)
  registerCommand({
    name: 'linkgc',
    aliases: ['linkgrup', 'grouplink'],
    category: 'group',
    description: 'Mengambil link undangan grup WhatsApp',
    usage: '.linkgc',
    platforms: ['whatsapp'],
    async execute({ sock, msg, jid, sender, reply, config }) {
      if (!jid.endsWith('@g.us')) return reply('[!] Khusus grup WhatsApp.');

      try {
        const { isAllowed, isBotAdmin, rejectReason } = await checkGroupAdminPerms(sock, jid, sender, config, msg);
        if (!isAllowed) return reply(rejectReason || MSG_SENDER_NOT_ADMIN);
        if (!isBotAdmin) return reply(MSG_BOT_NOT_ADMIN);

        const code = await sock.groupInviteCode(jid);
        await reply(`[ 🔗 LINK UNDANGAN GRUP ]\n\nhttps://chat.whatsapp.com/${code}`);
      } catch (err) {
        await reply(`[!] Gagal mengambil link grup: ${err.message}`);
      }
    },
  });

  registerCommand({
    name: 'revoke',
    aliases: ['resetlink'],
    category: 'group',
    description: 'Mereset link undangan grup WhatsApp',
    usage: '.revoke',
    platforms: ['whatsapp'],
    async execute({ sock, msg, jid, sender, reply, config }) {
      if (!jid.endsWith('@g.us')) return reply('[!] Khusus grup WhatsApp.');

      try {
        const { isAllowed, isBotAdmin, rejectReason } = await checkGroupAdminPerms(sock, jid, sender, config, msg);
        if (!isAllowed) return reply(rejectReason || MSG_SENDER_NOT_ADMIN);
        if (!isBotAdmin) return reply(MSG_BOT_NOT_ADMIN);

        const newCode = await sock.groupRevokeInvite(jid);
        await reply(`[+] Link undangan grup berhasil direset.\n\nLink baru: https://chat.whatsapp.com/${newCode}`);
      } catch (err) {
        await reply(`[!] Gagal reset link: ${err.message}`);
      }
    },
  });

  // 9. Command: Anti-Link (.antilink)
  registerCommand({
    name: 'antilink',
    aliases: ['anti-link'],
    category: 'group',
    description: 'Mengaktifkan / menonaktifkan proteksi anti-link grup WhatsApp',
    usage: '.antilink on / .antilink off',
    platforms: ['whatsapp'],
    async execute({ sock, msg, jid, sender, args, reply, config }) {
      if (!jid.endsWith('@g.us')) return reply('[!] Khusus grup WhatsApp.');

      try {
        const { isAllowed, rejectReason } = await checkGroupAdminPerms(sock, jid, sender, config, msg);
        if (!isAllowed) return reply(rejectReason || MSG_SENDER_NOT_ADMIN);

        const mode = (args[0] || '').toLowerCase();
        if (mode === 'on' || mode === 'aktif' || mode === '1') {
          setAntilink(jid, true);
          await reply('[ 🛡️ ANTILINK AKTIF ]\n\nProteksi link grup WhatsApp telah diaktifkan. Setiap member non-admin yang membagikan link grup akan otomatis dihapus pesannya.');
        } else if (mode === 'off' || mode === 'nonaktif' || mode === '0') {
          setAntilink(jid, false);
          await reply('[-] Proteksi antilink telah dinonaktifkan.');
        } else {
          const current = isAntilinkActive(jid) ? 'AKTIF (ON)' : 'NONAKTIF (OFF)';
          await reply(`[ STATUS ANTILINK: ${current} ]\n\nGunakan perintah:\n• .antilink on (Aktifkan proteksi)\n• .antilink off (Nonaktifkan proteksi)`);
        }
      } catch (err) {
        await reply(`[!] Gagal setel antilink: ${err.message}`);
      }
    },
  });

  // 10. Command: AFK (.afk)
  registerCommand({
    name: 'afk',
    aliases: ['away'],
    category: 'group',
    description: 'Mengaktifkan status AFK (Away From Keyboard) dengan alasan',
    usage: '.afk [alasan]',
    async execute({ sender, pushName, fullText, reply }) {
      const reason = fullText?.trim() || 'Tanpa alasan';
      setAfk(sender, reason, pushName);
      const senderNum = cleanJidNumber(sender);

      let msg = `[STATUS AFK AKTIF]\n\n`;
      msg += `Pengguna: @${senderNum}\n`;
      msg += `Alasan: "${reason}"\n\n`;
      msg += `Bot otomatis memberitahu member lain jika kamu di-tag di grup. Ketik pesan apa saja untuk kembali aktif.`;

      await reply(msg, { mentions: [sender] });
    },
  });

  // 11. Command: Group Mode (.groupmode)
  registerCommand({
    name: 'groupmode',
    aliases: ['grupakomodir', 'groupperms'],
    category: 'group',
    description: 'Mengatur mode izin perintah grup (khusus Owner vs seluruh Admin)',
    usage: '.groupmode [owner | admin | status]',
    platforms: ['whatsapp'],
    async execute({ sock, msg, sender, args, reply, config }) {
      const isOwner = isUserOwner({ sender, msg, sock, config });
      if (!isOwner) {
        return reply('[ ⛔ KHUSUS OWNER BOT ]\n\nHanya Owner Bot yang memiliki hak untuk mengubah mode izin grup.');
      }

      const mode = (args[0] || '').toLowerCase();
      if (mode === 'owner' || mode === 'khususowner' || mode === 'private') {
        updateConfig({ groupOwnerOnly: true });
        return reply(`[ 🔒 MODE GRUP DIPERBARUI ]\n\nStatus: *KHUSUS OWNER BOT*\nPerintah manajemen grup (.hidetag, .kick, .tagall, .group, dll) sekarang HANYA bisa digunakan oleh Owner Bot demi keamanan grup.`);
      } else if (mode === 'admin' || mode === 'semuaadmin' || mode === 'public') {
        updateConfig({ groupOwnerOnly: false });
        return reply(`[ 🔓 MODE GRUP DIPERBARUI ]\n\nStatus: *SELURUH ADMIN GRUP*\nPerintah manajemen grup sekarang dapat digunakan oleh semua Admin Grup WhatsApp.`);
      } else {
        const current = (config?.groupOwnerOnly !== false) ? '🔒 KHUSUS OWNER BOT' : '🔓 SELURUH ADMIN GRUP';
        return reply(`[ ⚙️ MODE PERIZINAN GRUP ]\n\nStatus Saat Ini: *${current}*\n\nUbah mode dengan:\n• \`.groupmode owner\` (Hanya kamu/Owner Bot yang bisa)\n• \`.groupmode admin\` (Semua admin grup bisa memakai)`);
      }
    },
  });

  // 12. Command: Set Owner (.setowner)
  registerCommand({
    name: 'setowner',
    aliases: ['owneradd', 'claimowner'],
    category: 'group',
    description: 'Menetapkan nomor Owner Bot untuk mengamankan hak akses grup',
    usage: '.setowner [nomor / me] [password_jika_belum_ada_owner]',
    platforms: ['whatsapp'],
    async execute({ sock, msg, jid, sender, args, reply, config }) {
      const isCurrentOwner = isUserOwner({ sender, msg, sock, config });
      const currentOwnerNum = cleanJidNumber(config?.ownerNumber || process.env.OWNER_NUMBER || '');
      const isGroup = jid.endsWith('@g.us');

      // Proteksi jika owner sudah terdaftar dan pengirim bukan owner
      if (currentOwnerNum && !isCurrentOwner) {
        return reply(`[ ⛔ AKSES DITOLAK ]\n\nOwner Bot saat ini telah terdaftar: @${currentOwnerNum}.\nHanya Owner yang terdaftar yang dapat mengubah nomor owner.`, {
          mentions: [`${currentOwnerNum}@s.whatsapp.net`],
        });
      }

      // Jika belum ada owner terdaftar dan dijalankan di grup oleh non-bot account
      if (!currentOwnerNum && !isCurrentOwner && isGroup) {
        const providedPass = args[1] || '';
        const adminPass = config?.adminPassword || 'admin123';
        if (providedPass !== adminPass) {
          return reply(`[ 🔒 KLAIM OWNER BUTUH AUTENTIKASI ]\n\nUntuk mengklaim bot pertama kali di dalam grup, sertakan password admin:\n• \`.setowner me <password>\`\natau kirim perintah ini lewat Chat Pribadi (DM) bot.`);
        }
      }

      let targetNum = '';
      const firstArg = args[0]?.toLowerCase();
      if (firstArg === 'me' || !firstArg) {
        targetNum = cleanJidNumber(sender);
      } else {
        const target = resolveTargetJid(msg, args);
        targetNum = target ? cleanJidNumber(target) : cleanJidNumber(args[0]);
      }

      if (!targetNum || targetNum.length < 8) {
        return reply('[!] Format nomor tidak valid. Contoh:\n• `.setowner me` (Klaim nomormu sebagai owner)\n• `.setowner 628123456789`');
      }

      updateConfig({ ownerNumber: targetNum });
      return reply(`[ 👑 OWNER BOT BERHASIL DITETAPKAN ]\n\nNomor Owner: @${targetNum}\nStatus Mode Grup: *${config?.groupOwnerOnly !== false ? '🔒 Khusus Owner' : '🔓 Semua Admin'}*\n\nSeluruh perintah manajemen grup diproteksi penuh untuk nomormu!`, {
        mentions: [`${targetNum}@s.whatsapp.net`],
      });
    },
  });

  // 13. Command: Owner (.owner)
  registerCommand({
    name: 'owner',
    aliases: ['creator', 'pemilik'],
    category: 'general',
    description: 'Menampilkan kontak & informasi Owner Bot',
    usage: '.owner',
    platforms: ['whatsapp'],
    async execute({ sock, reply, config }) {
      const ownerNum = config?.ownerNumber || process.env.OWNER_NUMBER || '';
      const botNum = cleanJidNumber(sock?.user?.id);
      const displayNum = ownerNum || botNum || 'Belum diatur';

      let text = `╔══════════════════════════════════╗\n`;
      text += `       👑 *OWNER / CREATOR BOT*     \n`;
      text += `╚══════════════════════════════════╝\n\n`;
      text += `• Kontak WhatsApp: wa.me/${cleanJidNumber(displayNum)}\n`;
      text += `• Nomor: @${cleanJidNumber(displayNum)}\n`;
      text += `• Group Lock: *${config?.groupOwnerOnly !== false ? '🔒 Khusus Owner' : '🔓 Admin Grup'}*\n\n`;
      text += `_Hubungi owner jika ada kendala atau ingin mengundang bot ke grup._`;

      return reply(text, { mentions: displayNum !== 'Belum diatur' ? [`${cleanJidNumber(displayNum)}@s.whatsapp.net`] : [] });
    },
  });
}
