import { logger } from '../utils/logger.js';
import { getConfig } from '../config.js';
import { checkRateLimit, createReplyHelper, isBotSentMessage, reactWait } from './antiBan.js';
import { checkGroupSpamKick } from './antiSpamKick.js';
import { incrementCommandStat } from '../utils/database.js';
import { handleGameInput } from '../modules/game/index.js';
import { handleAfkInteractions, checkAntilinkMessage } from '../modules/group/index.js';
import { consumeMusicSelection, downloadMusicTrack, getMusicSelection, sendMusicAudio } from '../modules/downloader/music-search.js';
import {
  findSuggestions,
  formatAutocompleteMessage,
  formatPrefixOnlyHelper,
  getPendingAutocomplete,
  setPendingAutocomplete,
  clearPendingAutocomplete,
} from './autocomplete.js';
export const commands = new Map();
export const aliases = new Map();

export function registerCommand(commandDef) {
  const {
    name,
    aliases: aliasList = [],
    category = 'general',
    description = '',
    usage = '',
    platforms = ['whatsapp', 'telegram'],
    execute,
  } = commandDef;
  const cmdObj = { name, aliases: aliasList, category, description, usage, platforms, execute };
  commands.set(name.toLowerCase(), cmdObj);

  for (const alias of aliasList) {
    aliases.set(alias.toLowerCase(), name.toLowerCase());
  }
}

export function isCommandSupported(cmd, platform) {
  if (!cmd || !cmd.platforms) return true;
  return cmd.platforms.includes(platform);
}

export function getCommandsByCategory(platform = null) {
  const categories = {};
  for (const cmd of commands.values()) {
    if (platform && !isCommandSupported(cmd, platform)) {
      continue;
    }
    if (!categories[cmd.category]) {
      categories[cmd.category] = [];
    }
    if (!categories[cmd.category].some((c) => c.name === cmd.name)) {
      categories[cmd.category].push(cmd);
    }
  }
  return categories;
}

export async function messageHandler(sock, chatUpdate) {
  try {
    const { messages, type } = chatUpdate;
    if (!messages || messages.length === 0) return;

    const msg = messages[0];
    if (!msg.message) return;

    // Abaikan pesan otomatis yang dihasilkan oleh bot itu sendiri
    const messageId = msg.key?.id;
    if (messageId && isBotSentMessage(messageId)) {
      return;
    }

    // Filter pesan status/broadcast WA
    const remoteJid = msg.key.remoteJid;
    if (remoteJid === 'status@broadcast') return;

    const isGroup = remoteJid.endsWith('@g.us');
    const sender = isGroup ? msg.key.participant || remoteJid : remoteJid;
    const pushName = msg.pushName || 'User';

    // Ekstraksi isi teks pesan
    const messageContent = msg.message;
    const rawText =
      messageContent.conversation ||
      messageContent.extendedTextMessage?.text ||
      messageContent.imageMessage?.caption ||
      messageContent.videoMessage?.caption ||
      '';

    const text = rawText.trim();
    if (!text) return;

    const reply = createReplyHelper(sock, remoteJid, msg);
    const config = getConfig();
    const configuredPrefix = config.prefix || '.';
    const validPrefixes = Array.from(new Set([configuredPrefix, '/', '.']));
    const matchedPrefix = validPrefixes.find((p) => text.startsWith(p));
    const prefix = matchedPrefix || configuredPrefix;

    // 0. Anti-Spam Group Kick & Auto Re-Add
    if (isGroup && !msg.key.fromMe) {
      const isSpamIntercepted = await checkGroupSpamKick({
        sock,
        jid: remoteJid,
        sender,
        isGroup,
        reply,
        config,
      });
      if (isSpamIntercepted) {
        return;
      }
    }

    // Anti-Link WhatsApp Group Protection
    if (isGroup && !msg.key.fromMe) {
      const isAntilink = await checkAntilinkMessage({
        sock,
        jid: remoteJid,
        sender,
        text,
        msg,
        reply,
        config,
      });
      if (isAntilink) {
        return;
      }
    }

    // Interaksi AFK (Member kembali dari AFK atau me-mention member AFK)
    if (isGroup && !msg.key.fromMe) {
      await handleAfkInteractions({
        sender,
        pushName,
        text,
        contextInfo: messageContent.extendedTextMessage?.contextInfo,
        reply,
      });
    }

    // 1. Cek apakah ada game aktif yang sedang menunggu jawaban di chat ini!
    // (Bisa dijawab oleh user lain ATAU pemilik bot di chat sendiri)
    if (!msg.key.fromMe || config.selfMode !== false) {
      const gameIntercepted = await handleGameInput({
        sock,
        msg,
        jid: remoteJid,
        sender,
        pushName,
        text,
        reply,
      });

      if (gameIntercepted) {
        return; // Pesan adalah jawaban game yang valid/sedang berlangsung
      }
    }

    // 2. Cek apakah user sedang memilih lagu (1 - 5)
    const pendingMusic = getMusicSelection({ platform: 'whatsapp', chatId: remoteJid, userId: sender });
    if (pendingMusic && /^[1-5]$/.test(text)) {
      const choiceIdx = parseInt(text, 10) - 1;
      if (choiceIdx < 0 || choiceIdx >= pendingMusic.candidates.length) {
        await reply(`[!] Pilih angka 1 sampai ${pendingMusic.candidates.length}.`);
        return;
      }

      const candidate = consumeMusicSelection({
        platform: 'whatsapp',
        chatId: remoteJid,
        userId: sender,
        index: choiceIdx,
      });
      if (!candidate) {
        await reply('[!] Daftar lagu sudah kedaluwarsa. Cari lagi dengan perintah .play.');
        return;
      }

      try {
        const track = await downloadMusicTrack(candidate.url, candidate);
        await sendMusicAudio({ platform: 'whatsapp', sock, jid: remoteJid, track });
      } catch (err) {
        logger.error('Error saat mengunduh pilihan lagu WhatsApp:', err.message);
        await reply(`[!] Gagal memutar lagu: ${err.message}`);
      }
      return;
    }

    // 3. Cek apakah user sedang memilih angka balasan autocomplete (1 - 5)
    if (!msg.key.fromMe || config.selfMode !== false) {
      const pendingAuto = getPendingAutocomplete(remoteJid);
      if (pendingAuto && /^[1-5]$/.test(text)) {
        const choiceIdx = parseInt(text, 10) - 1;
        if (choiceIdx >= 0 && choiceIdx < pendingAuto.suggestions.length) {
          const selectedCmd = pendingAuto.suggestions[choiceIdx];
          clearPendingAutocomplete(remoteJid);

          logger.bot(`Autocomplete dipilih: ${prefix}${selectedCmd.name} oleh ${pushName}`);
          incrementCommandStat(selectedCmd.category);

          await selectedCmd.execute({
            sock,
            msg,
            jid: remoteJid,
            sender,
            pushName,
            command: selectedCmd.name,
            args: [],
            fullText: '',
            reply,
            config,
            prefix,
          });
          return;
        }
      }
    }

    // 3. Jika pesan dari nomor sendiri tapi bukan game/angka, HANYA proses jika diawali prefix valid
    if (msg.key.fromMe && (config.selfMode === false || !matchedPrefix)) {
      return;
    }

    // Cek apakah pesan diawali dengan prefix valid (. atau /)
    if (!matchedPrefix) return;

    // Jika user hanya mengetik prefix saja (misal "." atau "/" atau ".?" atau "/?")
    if (text === prefix || text === `${prefix}?` || text === `${prefix}help`) {
      await reply(formatPrefixOnlyHelper(prefix));
      return;
    }

    const withoutPrefix = text.slice(prefix.length).trim();
    const [rawCmd, ...args] = withoutPrefix.split(/\s+/);
    if (!rawCmd) return;

    const cmdName = rawCmd.toLowerCase();
    const resolvedName = aliases.get(cmdName) || cmdName;
    const command = commands.get(resolvedName);

    if (!command) {
      // Autocomplete & "Did You Mean?" Suggestion
      if (config.autocomplete !== false) {
        const suggestions = findSuggestions(cmdName, commands);
        if (suggestions.length > 0) {
          setPendingAutocomplete(remoteJid, suggestions);
          await reply(formatAutocompleteMessage(prefix, cmdName, suggestions));
          return;
        }
      }
      return;
    }

    // 2b. Cek dukungan platform WhatsApp
    if (!isCommandSupported(command, 'whatsapp')) {
      await reply(`[!] Perintah *${prefix}${cmdName}* eksklusif untuk platform Telegram.\nGunakan bot Telegram kami di @NexBot12345_bot untuk mengakses fitur ini.`);
      return;
    }

    // 3. Rate limiting per user
    const rateCheck = checkRateLimit(sender);
    if (rateCheck.limited) {
      logger.warn(`Rate limit triggered oleh ${sender}`);
      await reply(`[!] Mohon tunggu ${rateCheck.remaining} detik sebelum menggunakan perintah lagi.`);
      return;
    }

    // 4. Periksa toggle fitur dari config
    if (command.category !== 'general') {
      const isCategoryActive = config.features && config.features[command.category];
      if (isCategoryActive === false) {
        await reply(`[!] Fitur *${command.category.toUpperCase()}* sedang dinonaktifkan oleh administrator.`);
        return;
      }
    }

    // 5. Eksekusi Command
    logger.bot(`Command dipanggil: ${prefix}${cmdName} oleh ${pushName} (${sender.split('@')[0]})`);
    incrementCommandStat(command.category);

    await command.execute({
      sock,
      msg,
      jid: remoteJid,
      sender,
      pushName,
      command: cmdName,
      args,
      fullText: args.join(' '),
      reply,
      config,
      prefix,
      platform: 'whatsapp',
      react: (emoji = '👍') => reactWait({ sock, jid: remoteJid, msg, platform: 'whatsapp', emoji }),
    });
  } catch (err) {
    logger.error('Error saat menangani pesan masuk:', err);
  }
}

// Inisialisasi command bawaan (Menu & Ping)
registerCommand({
  name: 'ping',
  aliases: ['p', 'speed'],
  category: 'general',
  description: 'Cek kecepatan respon bot',
  usage: '.ping',
  async execute({ reply }) {
    const start = Date.now();
    await reply('Pong!');
    const latency = Date.now() - start;
    await reply(`Kecepatan respon: *${latency}ms*`);
  },
});

registerCommand({
  name: 'clear',
  aliases: ['cls', 'purge', 'bersihkan', 'hapus'],
  category: 'general',
  description: 'Membersihkan riwayat pesan chat terbaru',
  usage: '.clear [jumlah pesan, contoh: /clear 10]',
  async execute({ sock, msg, jid, args, reply, ctx, platform }) {
    const count = Math.min(Math.max(parseInt(args[0] || '10', 10), 1), 100);

    if (platform === 'telegram' && ctx?.api && ctx?.chat?.id) {
      const currentMsgId = ctx.message?.message_id;
      let deleted = 0;
      if (currentMsgId) {
        for (let i = 0; i <= count; i++) {
          try {
            await ctx.api.deleteMessage(ctx.chat.id, currentMsgId - i);
            deleted++;
          } catch {}
        }
      }

      const notif = await ctx.reply(`[+] Berhasil membersihkan ${deleted} pesan chat.`);
      setTimeout(async () => {
        try {
          await ctx.api.deleteMessage(ctx.chat.id, notif.message_id);
        } catch {}
      }, 3500);
      return;
    }

    try {
      if (msg?.key) {
        await sock.sendMessage(jid, { delete: msg.key });
      }
    } catch {}
    await reply(`[+] Perintah pembersihan chat selesai diproses.`);
  },
});

function formatBotUptime(seconds) {
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const res = [];
  if (d > 0) res.push(`${d}h`);
  if (h > 0) res.push(`${h}j`);
  if (m > 0) res.push(`${m}m`);
  res.push(`${s}d`);
  return res.join(' ');
}

registerCommand({
  name: 'menu',
  aliases: ['help', 'bantuan'],
  category: 'general',
  description: 'Menampilkan seluruh daftar menu & perintah bot',
  usage: '.menu [kategori]',
  async execute({ sender, args, reply, config, prefix, pushName }) {
    const categories = getCommandsByCategory('whatsapp');
    const categoryIcons = {
      ai: '🤖',
      media: '🎨',
      downloader: '📥',
      group: '👥',
      game: '🎮',
      tools: '🧰',
      utility: '🧰',
      info: '🌍',
      islami: '🕌',
      osint: '🔍',
      programming: '💻',
      general: '⚙️',
    };

    const categoryHeaders = {
      ai: 'ARTIFICIAL INTELLIGENCE (AI)',
      media: 'MEDIA, STIKER & ENHANCER HD',
      downloader: 'SOSMED DOWNLOADER',
      group: 'GRUP & MODERASI',
      game: 'GAME & KUIS INTERAKTIF',
      utility: 'UTILITY & TOOLS',
      info: 'INFORMASI CUACA & GEMPA',
      islami: 'ISLAMI & JADWAL SHOLAT',
      osint: 'OSINT & NETWORK TOOLS',
      programming: 'PEMROGRAMAN & DEV',
      general: 'PENGATURAN & UMUM',
    };

    const senderClean = sender ? sender.replace(/[^0-9]/g, '') : '';
    const isOwner = Boolean(config.ownerNumber && senderClean.includes(config.ownerNumber.replace(/[^0-9]/g, '')));
    const filterCat = args[0]?.toLowerCase();

    // 1. Tampilan Sub-Menu Spesifik Kategori jika diminta user
    if (filterCat && (categories[filterCat] || filterCat === 'tools')) {
      const targetCat = filterCat === 'tools' ? 'utility' : filterCat;
      const list = categories[targetCat] || [];
      const icon = categoryIcons[targetCat] || '📌';
      const header = categoryHeaders[targetCat] || targetCat.toUpperCase();

      let text = `╔══════════════════════════════════╗\n`;
      text += `   ${icon}  *${header}*\n`;
      text += `╚══════════════════════════════════╝\n\n`;

      for (const item of list) {
        text += `• *${prefix}${item.name}*\n`;
        if (item.description) text += `  _${item.description}_\n`;
        if (item.usage) text += `  Format: \`${item.usage}\`\n\n`;
      }
      text += `_Ketik \`${prefix}menu\` untuk kembali ke dashboard utama._`;
      return await reply(text.trim());
    }

    // 2. Tampilan Dashboard Utama Full Menu
    const now = new Date();
    const timeStr = new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(now);
    const dateStr = new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta',
      weekday: 'long',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(now);

    let totalCmds = 0;
    for (const list of Object.values(categories)) {
      totalCmds += list.length;
    }

    let menuText = `╔══════════════════════════════════╗\n`;
    menuText += `   ⚡  *N E X B O T  •  D A S H B O A R D*  ⚡\n`;
    menuText += `╚══════════════════════════════════╝\n\n`;

    menuText += `┌──「 👤 *PROFIL PENGGUNA* 」\n`;
    menuText += `│ • *Nama:* ${pushName}\n`;
    menuText += `│ • *Role:* ${isOwner ? '👑 Owner Bot' : '👥 Pengguna'}\n`;
    menuText += `│ • *Prefix Aktif:* [ ${prefix} ] dan [ / ]\n`;
    menuText += `└───────────────────────────\n\n`;

    menuText += `┌──「 ⚙️ *TELEMETRI SISTEM* 」\n`;
    menuText += `│ • *Runtime:* ${formatBotUptime(process.uptime())}\n`;
    menuText += `│ • *Waktu:* ${timeStr} WIB (${dateStr})\n`;
    menuText += `│ • *Library:* Dual-Engine (Baileys & Grammy)\n`;
    menuText += `│ • *Total Fitur:* ${totalCmds} Perintah Aktif\n`;
    menuText += `└───────────────────────────\n\n`;

    menuText += `_Ketik \`${prefix}menu <kategori>\` untuk filter cepat:_\n`;
    menuText += `_${prefix}menu ai  •  ${prefix}menu media  •  ${prefix}menu group  •  ${prefix}menu game_\n\n`;

    for (const [cat, list] of Object.entries(categories)) {
      const icon = categoryIcons[cat] || '📌';
      const header = categoryHeaders[cat] || cat.toUpperCase();
      const isEnabled = config.features && config.features[cat] !== false;
      const statusTag = isEnabled ? '' : ' (Nonaktif)';

      menuText += `┌──「 ${icon} *${header}${statusTag}* 」\n`;
      for (const item of list) {
        menuText += `│ • *${prefix}${item.name}* : ${item.description}\n`;
      }
      menuText += `└───────────────────────────\n\n`;
    }

    menuText += `╔══════════════════════════════════╗\n`;
    menuText += `   Tips: Balas media dengan perintah\n`;
    menuText += `   seperti .s, .hd, .story, atau .toimg\n`;
    menuText += `╚══════════════════════════════════╝`;

    await reply(menuText.trim());
  },
});
