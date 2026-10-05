import { Bot, InputFile, InlineKeyboard } from 'grammy';
import { logger } from '../utils/logger.js';
import { getConfig } from '../config.js';
import { commands, aliases, isCommandSupported, getCommandsByCategory } from './handler.js';
import { checkRateLimit } from './antiBan.js';
import { incrementCommandStat, addScore, getLeaderboard } from '../utils/database.js';
import { handleGameInput } from '../modules/game/index.js';
import {
  findSuggestions,
  formatAutocompleteMessage,
  formatPrefixOnlyHelper,
  getPendingAutocomplete,
  setPendingAutocomplete,
  clearPendingAutocomplete,
} from './autocomplete.js';

let botInstance = null;
let botStatus = 'disconnected'; // 'disconnected' | 'connecting' | 'connected' | 'error'
let botInfo = null;
let connectStartTime = null;

export function getTelegramBot() {
  return botInstance;
}

export function getTelegramBotState() {
  const uptime = connectStartTime ? Math.floor((Date.now() - connectStartTime) / 1000) : 0;
  return {
    status: botStatus,
    botInfo,
    username: botInfo?.username || null,
    uptime,
    hasToken: Boolean(getConfig().telegramBotToken || process.env.TELEGRAM_BOT_TOKEN),
  };
}

/**
 * Konversi teks bergaya WhatsApp ke HTML Telegram yang aman
 */
export function formatTelegramHtml(text) {
  if (!text || typeof text !== 'string') return '';

  let escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  escaped = escaped.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  escaped = escaped.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  escaped = escaped.replace(/(?<!\w)\*([^*\n]+)\*(?!\w)/g, '<b>$1</b>');
  escaped = escaped.replace(/(?<!\w)_([^_\n]+)_(?!\w)/g, '<i>$1</i>');
  escaped = escaped.replace(/(?<!\w)~([^~\n]+)~(?!\w)/g, '<s>$1</s>');

  return escaped;
}

/**
 * Buat adapter socket Baileys-compatible agar command WhatsApp bisa jalan di Telegram
 */
export function createTelegramSocketAdapter(bot, ctx, targetChatId) {
  const chatId = targetChatId || ctx?.chat?.id;

  return {
    async sendMessage(jid, content, options = {}) {
      const destId = jid || chatId;
      if (!destId) return null;

      try {
        if (content.text || typeof content === 'string') {
          const rawText = content.text || content;
          const htmlText = formatTelegramHtml(rawText);
          try {
            return await bot.api.sendMessage(destId, htmlText, {
              parse_mode: 'HTML',
              reply_parameters: options.quoted ? { message_id: options.quoted.message_id || options.quoted.key?.id } : undefined,
            });
          } catch {
            return await bot.api.sendMessage(destId, rawText);
          }
        }

        if (content.image) {
          let file;
          if (Buffer.isBuffer(content.image) || content.image instanceof Uint8Array) {
            file = new InputFile(content.image, 'image.jpg');
          } else if (content.image.url) {
            file = content.image.url;
          } else {
            file = content.image;
          }

          const caption = content.caption ? formatTelegramHtml(content.caption) : undefined;
          try {
            return await bot.api.sendPhoto(destId, file, { caption, parse_mode: 'HTML' });
          } catch {
            return await bot.api.sendPhoto(destId, file, { caption: content.caption });
          }
        }

        if (content.video) {
          let file;
          if (Buffer.isBuffer(content.video) || content.video instanceof Uint8Array) {
            file = new InputFile(content.video, 'video.mp4');
          } else if (content.video.url) {
            file = content.video.url;
          } else {
            file = content.video;
          }

          const caption = content.caption ? formatTelegramHtml(content.caption) : undefined;
          try {
            return await bot.api.sendVideo(destId, file, { caption, parse_mode: 'HTML' });
          } catch {
            return await bot.api.sendVideo(destId, file, { caption: content.caption });
          }
        }

        if (content.sticker) {
          let file;
          if (Buffer.isBuffer(content.sticker) || content.sticker instanceof Uint8Array) {
            file = new InputFile(content.sticker, 'sticker.webp');
          } else {
            file = content.sticker;
          }
          return await bot.api.sendSticker(destId, file);
        }

        if (content.document) {
          let file;
          if (Buffer.isBuffer(content.document)) {
            file = new InputFile(content.document, content.fileName || 'file.bin');
          } else {
            file = content.document;
          }
          return await bot.api.sendDocument(destId, file, { caption: content.caption });
        }
      } catch (err) {
        logger.error(`[Telegram] Gagal mengirim pesan ke ${destId}:`, err.message);
        return null;
      }
    },

    async sendPresenceUpdate(_presence, jid) {
      const destId = jid || chatId;
      try {
        await bot.api.sendChatAction(destId, 'typing');
      } catch {
        // Abaikan
      }
    },
  };
}

/**
 * Generator Menu Utama Telegram dengan Inline Keyboard Interaktif
 */
export function buildTelegramMainMenu(pushName) {
  const keyboard = new InlineKeyboard()
    .text('🎮 Game & Kuis', 'menu_cat:game')
    .text('🤖 AI & ChatGPT', 'menu_cat:ai')
    .row()
    .text('🔍 OSINT & Network', 'menu_cat:osint')
    .text('💻 Pemrograman', 'menu_cat:programming')
    .row()
    .text('📥 Downloader Media', 'menu_cat:downloader')
    .text('✨ Eksklusif Telegram', 'menu_cat:telegram')
    .row()
    .text('🎲 Game Dadu & Slot', 'menu_cat:dice_picker')
    .text('📋 Semua Perintah', 'menu_all')
    .row()
    .text('⚡ Pintasan Cepat', 'quick_buttons')
    .text('👤 Profil Saya', 'quick_whoami');

  let text = `🚀 <b>NEXBOT TELEGRAM DASHBOARD</b>\n\n`;
  text += `Halo <b>${pushName}</b>! Selamat datang di bot multi-fungsi NexBot.\n`;
  text += `Gunakan tombol interaktif di bawah ini untuk menjelajahi seluruh fitur cerdas kami:`;

  return { text, keyboard };
}

/**
 * Generator Menu Kategori Telegram
 */
export function buildCategoryMenu(catName) {
  const categories = getCommandsByCategory('telegram');
  const list = categories[catName] || [];

  const catHeaders = {
    game: '🎮 GAME & KUIS INTERAKTIF',
    ai: '🤖 ARTIFICIAL INTELLIGENCE (AI)',
    osint: '🔍 OSINT & CYBER SECURITY',
    programming: '💻 PEMROGRAMAN & TOOLS',
    downloader: '📥 MEDIA & SOCIAL DOWNLOADER',
    telegram: '✨ FITUR EKSKLUSIF TELEGRAM',
    group: '👥 MANAJEMEN GRUP',
    general: '⚙️ UTILITY & UMUM',
  };

  const header = catHeaders[catName] || catName.toUpperCase();
  let text = `📂 <b>${header}</b>\n\n`;

  if (list.length === 0) {
    text += `<i>Belum ada perintah yang terdaftar di kategori ini.</i>\n`;
  } else {
    for (const cmd of list) {
      text += `• <b>/${cmd.name}</b> : ${cmd.description || 'Fitur NexBot'}\n`;
      if (cmd.usage) {
        text += `  <i>Format: <code>${cmd.usage}</code></i>\n`;
      }
    }
  }

  const keyboard = new InlineKeyboard();

  if (catName === 'game') {
    keyboard
      .text('🎲 Main Dadu', 'dice_roll:dice')
      .text('🎰 Main Slot', 'dice_roll:slots')
      .row();
  } else if (catName === 'telegram') {
    keyboard
      .text('👤 Profil ID Saya', 'quick_whoami')
      .text('🎲 Pilihan Game', 'menu_cat:dice_picker')
      .row();
  } else if (catName === 'ai') {
    keyboard
      .text('💡 Tanya AI Sekarang', 'quick_ai')
      .row();
  }

  keyboard
    .text('⬅️ Menu Utama', 'menu_main')
    .text('🔄 Refresh', `menu_cat:${catName}`);

  return { text, keyboard };
}

/**
 * Generator Menu Game Dadu & Slot Interaktif
 */
export function buildDicePicker() {
  const keyboard = new InlineKeyboard()
    .text('🎲 Dadu (1-6)', 'dice_roll:dice')
    .text('🎯 Dart Panahan', 'dice_roll:dart')
    .row()
    .text('🏀 Bola Basket', 'dice_roll:basketball')
    .text('⚽ Sepak Bola', 'dice_roll:football')
    .row()
    .text('🎰 Slot Casino 777', 'dice_roll:slots')
    .text('🎳 Bowling', 'dice_roll:bowling')
    .row()
    .text('⬅️ Menu Utama', 'menu_main');

  let text = `🎲 <b>TELEGRAM ANIMATED GAMES & CASINO</b>\n\n`;
  text += `Pilih salah satu game animasi di bawah ini!\n`;
  text += `Telegram akan memutar dadu/slot secara nyata dan poin hadiah otomatis dihitung ke leaderboard:`;

  return { text, keyboard };
}

/**
 * Handle incoming Telegram update
 */
export async function handleTelegramMessage(bot, ctx) {
  try {
    const msg = ctx.message;
    if (!msg) return;

    const rawText = (msg.text || msg.caption || '').trim();
    if (!rawText) return;

    const chatId = String(ctx.chat.id);
    const userId = String(ctx.from?.id || 'unknown');
    const pushName = [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(' ') || ctx.from?.username || 'TelegramUser';
    const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
    const config = getConfig();

    // Helper kirim pesan balasan
    const reply = async (content) => {
      try {
        const textPayload = typeof content === 'string' ? content : content?.text || '';
        const html = formatTelegramHtml(textPayload);
        try {
          return await ctx.reply(html, {
            parse_mode: 'HTML',
            reply_parameters: { message_id: msg.message_id },
          });
        } catch {
          return await ctx.reply(textPayload, {
            reply_parameters: { message_id: msg.message_id },
          });
        }
      } catch (err) {
        logger.error('[Telegram] Gagal reply:', err.message);
        return null;
      }
    };

    const telegramSock = createTelegramSocketAdapter(bot, ctx, chatId);

    // 1. Cek Game Interception
    const gameIntercepted = await handleGameInput({
      sock: telegramSock,
      msg,
      jid: chatId,
      sender: `tg:${userId}`,
      pushName,
      text: rawText,
      reply,
    });
    if (gameIntercepted) return;

    // 2. Cek Autocomplete Selection (1 - 5)
    const pendingAuto = getPendingAutocomplete(chatId);
    if (pendingAuto && /^[1-5]$/.test(rawText)) {
      const choiceIdx = parseInt(rawText, 10) - 1;
      if (choiceIdx >= 0 && choiceIdx < pendingAuto.suggestions.length) {
        const selectedCmd = pendingAuto.suggestions[choiceIdx];
        clearPendingAutocomplete(chatId);

        logger.bot(`[Telegram] Autocomplete dipilih: ${selectedCmd.name} oleh ${pushName}`);
        incrementCommandStat(selectedCmd.category);

        await selectedCmd.execute({
          platform: 'telegram',
          sock: telegramSock,
          msg,
          jid: chatId,
          sender: `tg:${userId}`,
          pushName,
          command: selectedCmd.name,
          args: [],
          fullText: '',
          reply,
          config,
          prefix: '/',
          isGroup,
          ctx,
        });
        return;
      }
    }

    // 3. Normalisasi Prefix & Command Name
    const configuredPrefix = config.prefix || '.';
    const validPrefixes = Array.from(new Set(['/', '.', configuredPrefix]));
    const matchedPrefix = validPrefixes.find((p) => rawText.startsWith(p));

    if (!matchedPrefix) return;

    // Bantuan cepat jika hanya ketik prefix saja
    if (rawText === matchedPrefix || rawText === `${matchedPrefix}?`) {
      await reply(formatPrefixOnlyHelper(matchedPrefix));
      return;
    }

    const withoutPrefix = rawText.slice(matchedPrefix.length).trim();
    const [rawCmd, ...args] = withoutPrefix.split(/\s+/);
    if (!rawCmd) return;

    // Bersihkan mention bot pada Telegram group (misal /menu@NexBot -> menu)
    let cleanCmd = rawCmd.toLowerCase();
    if (cleanCmd.includes('@')) {
      const [baseCmd, botMention] = cleanCmd.split('@');
      if (botInfo?.username && botMention.toLowerCase() === botInfo.username.toLowerCase()) {
        cleanCmd = baseCmd;
      }
    }

    // INTERAKTIF MENU TELEGRAM: Tampilkan dashboard tombol jika /menu atau /start dipanggil
    if (cleanCmd === 'menu' || cleanCmd === 'start' || cleanCmd === 'help') {
      const menu = buildTelegramMainMenu(pushName);
      await ctx.reply(menu.text, {
        parse_mode: 'HTML',
        reply_markup: menu.keyboard,
      });
      return;
    }

    const resolvedName = aliases.get(cleanCmd) || cleanCmd;
    const command = commands.get(resolvedName);

    if (!command) {
      if (config.autocomplete !== false) {
        const suggestions = findSuggestions(cleanCmd, commands);
        if (suggestions.length > 0) {
          setPendingAutocomplete(chatId, suggestions);
          await reply(formatAutocompleteMessage(matchedPrefix, cleanCmd, suggestions));
          return;
        }
      }
      return;
    }

    // 4. Cek Dukungan Platform Telegram
    if (!isCommandSupported(command, 'telegram')) {
      await reply(`[!] Perintah <b>/${cleanCmd}</b> hanya tersedia di platform WhatsApp.`);
      return;
    }

    // 5. Rate Limiting
    const rateCheck = checkRateLimit(`tg:${userId}`);
    if (rateCheck.limited) {
      await reply(`[!] Mohon tunggu ${rateCheck.remaining} detik sebelum menggunakan perintah lagi.`);
      return;
    }

    // 6. Cek Feature Toggle
    if (command.category !== 'general') {
      const isCategoryActive = config.features && config.features[command.category];
      if (isCategoryActive === false) {
        await reply(`[!] Fitur *${command.category.toUpperCase()}* sedang dinonaktifkan oleh administrator.`);
        return;
      }
    }

    // 7. Eksekusi Command
    logger.bot(`[Telegram] Command dipanggil: /${cleanCmd} oleh ${pushName} (${userId})`);
    incrementCommandStat(command.category);

    await command.execute({
      platform: 'telegram',
      sock: telegramSock,
      msg,
      jid: chatId,
      sender: `tg:${userId}`,
      pushName,
      command: cleanCmd,
      args,
      fullText: args.join(' '),
      reply,
      config,
      prefix: matchedPrefix,
      isGroup,
      ctx,
    });
  } catch (err) {
    logger.error('[Telegram] Error saat menangani pesan:', err);
  }
}

/**
 * Handler Callback Query untuk Tombol Inline Keyboard Telegram
 */
export async function handleTelegramCallback(_bot, ctx) {
  try {
    const data = ctx.callbackQuery?.data;
    if (!data) return;

    await ctx.answerCallbackQuery().catch(() => {});

    const user = ctx.from;
    const pushName = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.username || 'TelegramUser';
    const userId = String(user?.id || 'unknown');

    // 1. Menu Utama
    if (data === 'menu_main') {
      const menu = buildTelegramMainMenu(pushName);
      await ctx.editMessageText(menu.text, {
        parse_mode: 'HTML',
        reply_markup: menu.keyboard,
      }).catch(async () => {
        await ctx.reply(menu.text, { parse_mode: 'HTML', reply_markup: menu.keyboard });
      });
      return;
    }

    // 2. Kategori Menu Tertentu
    if (data.startsWith('menu_cat:')) {
      const cat = data.replace('menu_cat:', '');
      if (cat === 'dice_picker') {
        const picker = buildDicePicker();
        await ctx.editMessageText(picker.text, {
          parse_mode: 'HTML',
          reply_markup: picker.keyboard,
        }).catch(async () => {
          await ctx.reply(picker.text, { parse_mode: 'HTML', reply_markup: picker.keyboard });
        });
        return;
      }

      const catMenu = buildCategoryMenu(cat);
      await ctx.editMessageText(catMenu.text, {
        parse_mode: 'HTML',
        reply_markup: catMenu.keyboard,
      }).catch(async () => {
        await ctx.reply(catMenu.text, { parse_mode: 'HTML', reply_markup: catMenu.keyboard });
      });
      return;
    }

    // 3. Semua Perintah
    if (data === 'menu_all') {
      const categories = getCommandsByCategory('telegram');
      let text = `📋 <b>SELURUH DAFTAR PERINTAH BOT TELEGRAM</b>\n\n`;

      for (const [cat, list] of Object.entries(categories)) {
        text += `<b>[ ${cat.toUpperCase()} ]</b>\n`;
        for (const item of list) {
          text += `• /${item.name} - <i>${item.description}</i>\n`;
        }
        text += `\n`;
      }

      const keyboard = new InlineKeyboard().text('⬅️ Kembali ke Menu Utama', 'menu_main');
      await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        reply_markup: keyboard,
      }).catch(async () => {
        await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
      });
      return;
    }

    // 4. Lempar Dadu / Slot / Dart Animasi Interaktif
    if (data.startsWith('dice_roll:')) {
      const diceType = data.replace('dice_roll:', '');
      const emojiMap = {
        dice: '🎲',
        dart: '🎯',
        basketball: '🏀',
        football: '⚽',
        slots: '🎰',
        bowling: '🎳',
      };
      const emoji = emojiMap[diceType] || '🎲';

      const sentMsg = await ctx.replyWithDice(emoji);
      const val = sentMsg.dice?.value || 1;

      let reward = 10;
      let label = `Hasil lemparan: <b>${val}</b>`;

      if (diceType === 'slots') {
        if (val === 64) {
          reward = 350;
          label = `🎰 <b>JACKPOT 777! LUAR BIASA!</b> 🎉`;
        } else if ([1, 22, 43].includes(val)) {
          reward = 120;
          label = `💎 <b>TIGA GAMBAR SAMA! MENANG BESAR!</b> ✨`;
        } else {
          reward = 15;
          label = `Belum jackpot, coba lagi! Skor mesin: ${val}`;
        }
      } else if (diceType === 'dart') {
        if (val === 6) {
          reward = 100;
          label = `🎯 <b>BULLSEYE TEPAT DI LINGKARAN TENGAH!</b> 🔥`;
        } else {
          reward = val * 10;
          label = `Skor sasaran: <b>${val}</b>`;
        }
      } else if (diceType === 'basketball') {
        if (val >= 4) {
          reward = 60;
          label = `🏀 <b>SWISH! BOLA MASUK KERANJANG!</b> 🌟`;
        } else {
          reward = 10;
          label = `Sayang sekali meleset, coba lagi!`;
        }
      } else if (diceType === 'football') {
        if ([3, 4, 5].includes(val)) {
          reward = 60;
          label = `⚽ <b>GOOOOL! TEMBAKAN AKURAT!</b> 🥅`;
        } else {
          reward = 10;
          label = `Ditepis kiper / membentur tiang!`;
        }
      } else if (diceType === 'bowling') {
        if (val === 6) {
          reward = 90;
          label = `🎳 <b>STRIKE! SEMUA PIN JATUH!</b> 💥`;
        } else {
          reward = val * 10;
          label = `Pin yang berhasil dijatuhkan: <b>${val}</b>`;
        }
      } else {
        if (val === 6) {
          reward = 60;
          label = `🎲 <b>ANGKA TERTINGGI 6! MANTAP!</b> 🌟`;
        } else {
          reward = val * 8;
          label = `Mata dadu: <b>${val}</b>`;
        }
      }

      const totalPoin = addScore(`tg:${userId}`, reward, pushName);

      let resultText = `${label}\n\n`;
      resultText += `👤 Pemain: <b>${pushName}</b>\n`;
      resultText += `🎁 Hadiah: <b>+${reward} Poin</b>\n`;
      resultText += `💰 Total Poin Kamu: <b>${totalPoin} Poin</b>`;

      const replayKeyboard = new InlineKeyboard()
        .text(`🔄 Lempar Lagi (${emoji})`, `dice_roll:${diceType}`)
        .text('🎲 Game Lain', 'menu_cat:dice_picker')
        .row()
        .text('🏆 Leaderboard', 'quick_leaderboard')
        .text('⬅️ Menu Utama', 'menu_main');

      await ctx.reply(resultText, {
        parse_mode: 'HTML',
        reply_markup: replayKeyboard,
      });
      return;
    }

    // 5. Quick Whoami
    if (data === 'quick_whoami') {
      let out = `👤 <b>PROFIL TELEGRAM ANDA</b>\n\n`;
      out += `• <b>User ID:</b> <code>${user?.id}</code>\n`;
      out += `• <b>Nama:</b> ${user?.first_name || ''} ${user?.last_name || ''}\n`;
      out += `• <b>Username:</b> ${user?.username ? '@' + user.username : '<i>(Belum ada)</i>'}\n`;
      out += `• <b>Status Premium:</b> ${user?.is_premium ? '🌟 Premium' : 'Biasa'}\n`;

      const keyboard = new InlineKeyboard()
        .text('🏆 Cek Skor', 'quick_leaderboard')
        .text('⬅️ Menu Utama', 'menu_main');

      await ctx.reply(out, { parse_mode: 'HTML', reply_markup: keyboard });
      return;
    }

    // 6. Quick Leaderboard
    if (data === 'quick_leaderboard') {
      const top = getLeaderboard(5);
      let out = `🏆 <b>LEADERBOARD TOP 5 SKOR</b>\n\n`;
      if (top.length === 0) {
        out += `<i>Belum ada pemain dengan poin. Ayo main game untuk mengumpulkan poin!</i>\n`;
      } else {
        const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
        top.forEach((u, i) => {
          const medal = medals[i] || '•';
          out += `${medal} <b>${u.pushName || 'Pemain'}</b>: ${u.score} Poin (${u.gamesWon || 0} Menang)\n`;
        });
      }

      const keyboard = new InlineKeyboard()
        .text('🎲 Main Game Dadu', 'menu_cat:dice_picker')
        .text('⬅️ Menu Utama', 'menu_main');

      await ctx.reply(out, { parse_mode: 'HTML', reply_markup: keyboard });
      return;
    }

    // 7. Quick AI
    if (data === 'quick_ai') {
      let out = `🤖 <b>CARA MENGGUNAKAN AI DI TELEGRAM</b>\n\n`;
      out += `Kamu bisa langsung mengetik:\n`;
      out += `<code>/ai Ceritakan dongeng pendek tentang robot kucing</code>\n\n`;
      out += `Atau fitur cerdas lainnya:\n`;
      out += `• <code>/explain &lt;kode&gt;</code> - Menjelaskan fungsi kode\n`;
      out += `• <code>/summarize &lt;teks&gt;</code> - Merangkum bacaan\n`;
      out += `• <code>/translate &lt;teks&gt;</code> - Menerjemahkan bahasa`;

      const keyboard = new InlineKeyboard().text('⬅️ Menu Utama', 'menu_main');
      await ctx.reply(out, { parse_mode: 'HTML', reply_markup: keyboard });
      return;
    }

    // 8. Quick Shortcuts Menu
    if (data === 'quick_buttons') {
      const keyboard = new InlineKeyboard()
        .text('💡 Tanya AI', 'quick_ai')
        .text('🎲 Dadu Berhadiah', 'dice_roll:dice')
        .row()
        .text('🎰 Slot Machine', 'dice_roll:slots')
        .text('🏆 Leaderboard', 'quick_leaderboard')
        .row()
        .text('👤 Profil ID', 'quick_whoami')
        .text('⬅️ Menu Utama', 'menu_main');

      await ctx.reply('⚡ <b>PINTASAN CEPAT INTERAKTIF</b>\n\nPilih aksi di bawah ini dengan menekan tombol:', {
        parse_mode: 'HTML',
        reply_markup: keyboard,
      });
      return;
    }
  } catch (err) {
    logger.error('[Telegram] Error saat menangani callback query:', err);
  }
}

/**
 * Inisialisasi Bot Telegram (Long Polling)
 */
export async function initTelegram() {
  const config = getConfig();
  const token = config.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    botStatus = 'disconnected';
    logger.info('Telegram Bot tidak aktif: TELEGRAM_BOT_TOKEN belum disetel.');
    return null;
  }

  if (config.enableTelegram === false) {
    botStatus = 'disconnected';
    logger.info('Telegram Bot dinonaktifkan di konfigurasi (ENABLE_TELEGRAM=false).');
    return null;
  }

  botStatus = 'connecting';
  logger.info('Menghubungkan ke Telegram Bot API...');

  try {
    botInstance = new Bot(token);

    // Dapatkan data profil bot
    botInfo = await botInstance.api.getMe();
    logger.info(`🤖 Telegram Bot Berhasil Terhubung sebagai @${botInfo.username} (${botInfo.first_name})`);

    // Daftarkan listener pesan
    botInstance.on(['message:text', 'message:caption'], async (ctx) => {
      await handleTelegramMessage(botInstance, ctx);
    });

    // Daftarkan listener tombol interaktif (InlineKeyboard callback)
    botInstance.on('callback_query:data', async (ctx) => {
      await handleTelegramCallback(botInstance, ctx);
    });

    // Error handling
    botInstance.catch((err) => {
      logger.error('[Telegram] Polling error:', err.message);
    });

    // Mulai polling secara asynchronous (non-blocking)
    connectStartTime = Date.now();
    botStatus = 'connected';

    botInstance.start({
      drop_pending_updates: true,
      onStart: (info) => {
        logger.info(`🚀 Telegram Polling aktif untuk @${info.username}`);
      },
    });

    return botInstance;
  } catch (err) {
    botStatus = 'error';
    logger.error('Gagal menghubungkan Telegram Bot:', err.message);
    return null;
  }
}

export async function stopTelegram() {
  if (botInstance && botStatus === 'connected') {
    try {
      await botInstance.stop();
      botStatus = 'disconnected';
      logger.info('Telegram Bot berhasil dimatikan.');
    } catch (err) {
      logger.error('Error saat mematikan Telegram Bot:', err.message);
    }
  }
}
