import { logger } from '../utils/logger.js';
import { getConfig } from '../config.js';
import { checkRateLimit, createReplyHelper, isBotSentMessage } from './antiBan.js';
import { checkGroupSpamKick } from './antiSpamKick.js';
import { incrementCommandStat } from '../utils/database.js';
import { handleGameInput } from '../modules/game/index.js';
import { handleAfkInteractions } from '../modules/group/index.js';
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
  const { name, aliases: aliasList = [], category = 'general', description = '', usage = '', execute } = commandDef;
  const cmdObj = { name, aliases: aliasList, category, description, usage, execute };
  commands.set(name.toLowerCase(), cmdObj);

  for (const alias of aliasList) {
    aliases.set(alias.toLowerCase(), name.toLowerCase());
  }
}

export function getCommandsByCategory() {
  const categories = {};
  for (const cmd of commands.values()) {
    if (!categories[cmd.category]) {
      categories[cmd.category] = [];
    }
    // Hindari duplikasi jika command memiliki beberapa alias
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
    const prefix = config.prefix || '.';

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

    // 2. Cek apakah user sedang memilih angka balasan autocomplete (1 - 5)
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

    // 3. Jika pesan dari nomor sendiri tapi bukan game/angka, HANYA proses jika diawali prefix
    if (msg.key.fromMe && (config.selfMode === false || !text.startsWith(prefix))) {
      return;
    }

    // 3. Cek apakah pesan diawali dengan prefix (default '.')
    if (!text.startsWith(prefix)) return;

    // Jika user hanya mengetik prefix saja (misal "." atau ".?")
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

    // 3. Rate limiting per user
    const rateCheck = checkRateLimit(sender);
    if (rateCheck.limited) {
      logger.warn(`Rate limit triggered oleh ${sender}`);
      await reply(`⏳ Mohon tunggu ${rateCheck.remaining} detik sebelum menggunakan perintah lagi.`);
      return;
    }

    // 4. Periksa toggle fitur dari config
    if (command.category !== 'general') {
      const isCategoryActive = config.features && config.features[command.category];
      if (isCategoryActive === false) {
        await reply(`⚠️ Fitur *${command.category.toUpperCase()}* sedang dinonaktifkan oleh administrator.`);
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
    await reply('🏓 Pong!');
    const latency = Date.now() - start;
    await reply(`⚡ Kecepatan respon: *${latency}ms*`);
  },
});

registerCommand({
  name: 'menu',
  aliases: ['help', 'bantuan'],
  category: 'general',
  description: 'Menampilkan seluruh daftar menu & perintah bot',
  usage: '.menu',
  async execute({ reply, config, prefix, pushName }) {
    const categories = getCommandsByCategory();
    const categoryIcons = {
      media: '🎨 MEDIA, STIKER & PHOTOLIVE',
      downloader: '📥 SOCIAL MEDIA DOWNLOADER',
      group: '👥 GRUP & MANAJEMEN',
      game: '🎮 GAME & KUIS',
      osint: '🔍 OSINT & NETWORK',
      ai: '🤖 ARTIFICIAL INTELLIGENCE',
      programming: '💻 PEMROGRAMAN & DEV TOOLS',
      general: '⚙️ UTILITY & UMUM',
    };

    let menuText = `Halo *${pushName}*! 👋\n`;
    menuText += `Selamat datang di *${config.botName || 'NexBot'}*\n`;
    menuText += `Prefix: \`${prefix}\`\n\n`;

    for (const [cat, list] of Object.entries(categories)) {
      const header = categoryIcons[cat] || `📁 ${cat.toUpperCase()}`;
      const isEnabled = config.features && config.features[cat] !== false;
      const statusTag = isEnabled ? '' : ' _(Nonaktif)_';

      menuText += `┌───⊷ *${header}*${statusTag}\n`;
      for (const item of list) {
        menuText += `│ • \`${prefix}${item.name}\` : ${item.description}\n`;
      }
      menuText += `└───⊷\n\n`;
    }

    menuText += `💡 *Tips:* Ketik command sesuai panduan untuk menggunakan fitur.\n`;
    menuText += `🌐 Web Dashboard aktif untuk memantau status bot & konfigurasi.`;

    await reply(menuText.trim());
  },
});
