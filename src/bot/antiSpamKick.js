import { logger } from '../utils/logger.js';

// Tracker aktivitas per member grup: Key = `${jid}:${sender}`
const groupSpamTracker = new Map();

export async function checkGroupSpamKick({ sock, jid, sender, isGroup, reply, config }) {
  if (!isGroup) return false;
  if (config.antiSpamKick === false) return false;

  // Abaikan pesan jika bot sendiri atau nomor owner
  const botNumber = (sock.user?.id || '').split(':')[0].replace(/[^0-9]/g, '');
  const senderNumber = sender.replace(/[^0-9]/g, '');

  if (senderNumber === botNumber) return false;
  if (config.ownerNumber && senderNumber.includes(config.ownerNumber.replace(/[^0-9]/g, ''))) return false;

  const key = `${jid}:${sender}`;
  const now = Date.now();

  let record = groupSpamTracker.get(key);
  if (!record) {
    record = {
      timestamps: [],
      strikes: 0,
      lastWarningTime: 0,
      isKicking: false,
    };
    groupSpamTracker.set(key, record);
  }

  // Jika sedang dalam proses kick / re-add, abaikan pesan masuk
  if (record.isKicking) return true;

  // Catat waktu pesan saat ini dan buang yang lebih dari 3.5 detik lalu
  record.timestamps.push(now);
  record.timestamps = record.timestamps.filter((t) => now - t <= 3500);

  // Jika mengirim 4 pesan atau lebih dalam 3.5 detik, hitung sebagai SPAM
  if (record.timestamps.length >= 4) {
    record.timestamps = [];
    record.strikes += 1;

    // Strike 1: Peringatan Pertama
    if (record.strikes === 1) {
      record.lastWarningTime = now;
      await reply(`[!] @${senderNumber} Jangan spam! (Peringatan 1/3)`, {
        mentions: [sender],
      });
      return true;
    }

    // Strike 2: Peringatan Keras
    if (record.strikes === 2) {
      record.lastWarningTime = now;
      await reply(`[!] @${senderNumber} Peringatan 2/3! Sekali lagi spam kamu akan dikeluarkan dari grup!`, {
        mentions: [sender],
      });
      return true;
    }

    // Strike 3: KICK & AUTO RE-ADD
    if (record.strikes >= 3) {
      record.isKicking = true;

      try {
        const groupMeta = await sock.groupMetadata(jid);
        const botMember = groupMeta.participants.find((p) => p.id.replace(/[^0-9]/g, '').startsWith(botNumber));
        const isBotAdmin = botMember && (botMember.admin === 'admin' || botMember.admin === 'superadmin');

        const targetMember = groupMeta.participants.find((p) => p.id.replace(/[^0-9]/g, '').startsWith(senderNumber));
        const isTargetAdmin = targetMember && (targetMember.admin === 'admin' || targetMember.admin === 'superadmin');

        if (!isBotAdmin) {
          await reply(`[!] @${senderNumber} terdeteksi spam berkali-kali.\nJadikan bot sebagai Admin grup agar sistem kick otomatis berfungsi.`, {
            mentions: [sender],
          });
          record.strikes = 0;
          record.isKicking = false;
          return true;
        }

        if (isTargetAdmin) {
          await reply(`[!] @${senderNumber} terdeteksi spam, namun berstatus Admin grup sehingga tidak dapat dikeluarkan.`, {
            mentions: [sender],
          });
          record.strikes = 0;
          record.isKicking = false;
          return true;
        }

        // 1. Keluarkan (Kick)
        logger.bot(`[ANTI-SPAM] Mengeluarkan @${senderNumber} dari grup ${jid}`);
        await sock.groupParticipantsUpdate(jid, [sender], 'remove');

        const delaySec = config.reAddDelaySec || 8;
        let kickMsg = `[SANKSI SPAM]\n\n`;
        kickMsg += `@${senderNumber} dikeluarkan dari grup karena spam berkali-kali.\n\n`;
        kickMsg += `Akan dimasukkan kembali secara otomatis dalam ${delaySec} detik.`;

        await reply(kickMsg, { mentions: [sender] });

        // 2. Masukkan Kembali (Auto Re-Add)
        setTimeout(async () => {
          try {
            logger.bot(`[ANTI-SPAM] Memasukkan kembali @${senderNumber} ke grup ${jid}`);
            await sock.groupParticipantsUpdate(jid, [sender], 'add');
            await reply(`[+] @${senderNumber} telah dimasukkan kembali ke grup. Harap tidak mengulangi spam.`, {
              mentions: [sender],
            });
          } catch (addErr) {
            logger.warn(`Gagal auto re-add @${senderNumber}: ${addErr.message}`);
            try {
              const code = await sock.groupInviteCode(jid);
              await reply(`[!] Tidak dapat menambahkan @${senderNumber} langsung karena setelan privasi akun.\nSilakan masuk kembali melalui link: https://chat.whatsapp.com/${code}`, {
                mentions: [sender],
              });
            } catch {}
          } finally {
            groupSpamTracker.delete(key);
          }
        }, delaySec * 1000);

        return true;
      } catch (err) {
        logger.error('Error saat eksekusi anti-spam kick:', err.message);
        record.isKicking = false;
        return false;
      }
    }
  }

  // Bersihkan record lama setelah 60 detik tidak spam
  if (record.strikes > 0 && now - record.lastWarningTime > 60000) {
    record.strikes = 0;
  }

  return false;
}
