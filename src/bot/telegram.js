import fs from 'node:fs';
import path from 'node:path';
import { Bot, InputFile, InlineKeyboard } from 'grammy';
import { logger } from '../utils/logger.js';
import { getConfig } from '../config.js';
import { commands, aliases, isCommandSupported, getCommandsByCategory } from './handler.js';
import { checkRateLimit, reactWait } from './antiBan.js';
import { incrementCommandStat, addScore, getLeaderboard, activeGames } from '../utils/database.js';
import { handleGameInput } from '../modules/game/index.js';
import { tebakGambarList } from '../modules/game/questions.js';
import { createTicTacToeSession, renderTicTacToeBoard, checkTicTacToeWinner, makeBotMove, visualSessions, buildRpsKeyboard, playRpsRound } from '../modules/game/visual-games.js';
import { consumeMusicSelection, downloadMusicTrack, getMusicSelection, cancelMusicSelection, sendMusicAudio } from '../modules/downloader/music-search.js';
import { handleSimpklCallback } from '../modules/simpkl/index.js';
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
export function getActiveBanner() {
  const gifPath = path.resolve(process.cwd(), 'banner.gif');
  const mp4Path = path.resolve(process.cwd(), 'banner.mp4');
  const jpegPath = path.resolve(process.cwd(), 'jpeg');
  const jpgPath = path.resolve(process.cwd(), 'banner.jpg');
  const pngPath = path.resolve(process.cwd(), 'banner.png');

  if (fs.existsSync(gifPath)) return { path: gifPath, type: 'animation' };
  if (fs.existsSync(mp4Path)) return { path: mp4Path, type: 'animation' };
  if (fs.existsSync(jpegPath)) return { path: jpegPath, type: 'photo' };
  if (fs.existsSync(jpgPath)) return { path: jpgPath, type: 'photo' };
  if (fs.existsSync(pngPath)) return { path: pngPath, type: 'photo' };
  return null;
}
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

export function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Konversi teks bergaya WhatsApp ke HTML Telegram yang aman
 */
export function formatTelegramHtml(text) {
  if (!text || typeof text !== 'string') return '';

  const allowedTags = /<\/?(b|strong|i|em|u|ins|s|strike|del|code|pre|a)(\s+[^>]*)?>/gi;
  const tokens = [];
  const protectedText = text.replace(allowedTags, (match) => {
    const placeholder = `__HTML_TAG_${tokens.length}__`;
    tokens.push(match);
    return placeholder;
  });

  let escaped = protectedText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  escaped = escaped.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  escaped = escaped.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  escaped = escaped.replace(/(?<!\w)\*([^*\n]+)\*(?!\w)/g, '<b>$1</b>');
  escaped = escaped.replace(/(?<!\w)_([^_\n]+)_(?!\w)/g, '<i>$1</i>');
  escaped = escaped.replace(/(?<!\w)~([^~\n]+)~(?!\w)/g, '<s>$1</s>');

  for (let i = 0; i < tokens.length; i++) {
    escaped = escaped.replace(`__HTML_TAG_${i}__`, tokens[i]);
  }

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
 * Helper Edit Pesan Aman (Menangani Pesan Berupa Foto Maupun Teks Biasa)
 */
export async function safeEditOrReply(ctx, text, keyboard) {
  const msg = ctx.callbackQuery?.message;
  const hasMedia = Boolean(msg?.photo || msg?.animation || msg?.video || msg?.document);
  try {
    if (hasMedia) {
      return await ctx.editMessageCaption({
        caption: text,
        parse_mode: 'HTML',
        reply_markup: keyboard,
      });
    } else {
      return await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        reply_markup: keyboard,
      });
    }
  } catch (err) {
    if (err.message && err.message.includes('not modified')) {
      return null;
    }

    // Fallback: strip tags jika parsing HTML ditolak Telegram
    const plainText = text.replace(/<[^>]*>/g, '');
    try {
      if (hasMedia) {
        return await ctx.editMessageCaption({
          caption: plainText,
          reply_markup: keyboard,
        });
      } else {
        return await ctx.editMessageText(plainText, {
          reply_markup: keyboard,
        });
      }
    } catch {
      try {
        return await ctx.reply(plainText, { reply_markup: keyboard });
      } catch {
        return null;
      }
    }
  }
}

/**
 * Generator Menu Utama Telegram (Clean Text Icons - Tanpa Emoji)
 */
export function buildTelegramMainMenu(pushName) {
  const keyboard = new InlineKeyboard()
    .text('[ GAME & KUIS ]', 'menu_cat:game')
    .text('[ AI & CHATGPT ]', 'menu_cat:ai')
    .row()
    .text('[ CUACA & GEMPA ]', 'menu_cat:info')
    .text('[ ISLAMI & SHOLAT ]', 'menu_cat:islami')
    .row()
    .text('[ DOWNLOADER ]', 'menu_cat:downloader')
    .text('[ FOTO & VIDEO HD ]', 'menu_cat:media')
    .row()
    .text('[ TOOLS & UTILITAS ]', 'menu_cat:utility')
    .text('[ OSINT & NET ]', 'menu_cat:osint')
    .row()
    .text('[ DADU & CASINO ]', 'menu_cat:dice_picker')
    .text('[ SEMUA PERINTAH ]', 'menu_all')
    .row()
    .text('[ AUTO-FILLER SIMPKL ]', 'simpkl_menu')
    .text('[ DATE PICKER JURNAL ]', 'simpkl_cal_open')
    .row()
    .text('[ PINTASAN CEPAT ]', 'quick_buttons')
    .text('[ PROFIL SAYA ]', 'quick_whoami');

  let text = `<b>[ NEXBOT TELEGRAM DASHBOARD ]</b>\n\n`;
  text += `Halo <b>${pushName}</b>. Selamat datang di NexBot Multi-Platform.\n`;
  text += `Silakan tekan tombol di bawah ini untuk melihat daftar fitur yang tersedia:`;

  return { text, keyboard };
}

/**
 * Generator Menu Kategori Telegram (Clean Text Icons)
 */
export function buildCategoryMenu(catName) {
  const categories = getCommandsByCategory('telegram');
  const list = categories[catName] || [];

  const catHeaders = {
    game: 'GAME & KUIS INTERAKTIF',
    ai: 'ARTIFICIAL INTELLIGENCE (AI)',
    info: 'INFORMASI CUACA, GEMPA & WIKIPEDIA',
    islami: 'ISLAMI & JADWAL SHOLAT',
    media: 'FOTO, VIDEO HD & AESTHETIC STORY',
    downloader: 'MEDIA & SOSMED DOWNLOADER',
    utility: 'UTILITY & TOOLS',
    telegram: 'FITUR EKSKLUSIF TELEGRAM',
    osint: 'OSINT & NETWORK TOOLS',
    programming: 'PEMROGRAMAN & DEV TOOLS',
    group: 'MANAJEMEN GRUP',
    general: 'UTILITY & UMUM',
  };

  const header = catHeaders[catName] || catName.toUpperCase();
  let text = `<b>[ ${header} ]</b>\n\n`;

  if (list.length === 0) {
    text += `<i>Belum ada perintah yang terdaftar di kategori ini.</i>\n`;
  } else {
    for (const cmd of list) {
      const cleanDesc = escapeHtml(cmd.description || 'Fitur NexBot');
      const cleanUsage = cmd.usage ? escapeHtml(cmd.usage) : '';
      text += `• <b>/${cmd.name}</b> : ${cleanDesc}\n`;
      if (cleanUsage) {
        text += `  <i>Format: <code>${cleanUsage}</code></i>\n`;
      }
    }
  }
  const keyboard = new InlineKeyboard();

  if (catName === 'game') {
    keyboard
      .text('[ 🎮 TIC-TAC-TOE 3x3 ]', 'visual_ttt_new')
      .text('[ ✊ SUIT BATU GUNTING ]', 'quick_rps')
      .row()
      .text('[ 🎲 DADU (1-6) ]', 'dice_roll:dice')
      .text('[ 🎰 CASINO 777 ]', 'dice_roll:slots')
      .row()
      .text('[ 💡 TEBAK GAMBAR ]', 'quick_tg')
      .row();
  } else if (catName === 'telegram') {
    keyboard
      .text('[ PROFIL ID ]', 'quick_whoami')
      .text('[ GAME DADU ]', 'menu_cat:dice_picker')
      .row();
  } else if (catName === 'ai') {
    keyboard
      .text('[ CARA PAKAI AI ]', 'quick_ai')
      .row();
  } else if (catName === 'media') {
    keyboard
      .text('[ 💎 HD ENHANCE ]', 'filter_info:hd')
      .text('[ 🎬 STORY 9:16 ]', 'filter_info:story')
      .row()
      .text('[ 🌗 KONTRAS ]', 'filter_info:contrast')
      .text('[ 🎞️ VINTAGE ]', 'filter_info:vintage')
      .row()
      .text('[ 🖤 NOIR B&W ]', 'filter_info:noir')
      .text('[ 📹 HD VIDEO ]', 'filter_info:hdvid')
      .row();
  } else if (catName === 'info') {
    keyboard
      .text('[ 🌍 GEMPA BMKG ]', 'menu_direct:gempa')
      .text('[ ⛅ CEK CUACA ]', 'menu_direct:cuaca')
      .row();
  } else if (catName === 'islami') {
    keyboard
      .text('[ 🕌 JADWAL SHOLAT ]', 'menu_direct:sholat')
      .row();
  }

  keyboard
    .text('[ « KEMBALI ]', 'menu_main')
    .text('[ ⟳ REFRESH ]', `menu_cat:${catName}`);

  return { text, keyboard };
}

/**
 * Generator Menu Game Dadu & Slot Interaktif
 */
export function buildDicePicker() {
  const keyboard = new InlineKeyboard()
    .text('[•] Dadu (1-6)', 'dice_roll:dice')
    .text('[•] Dart Panahan', 'dice_roll:dart')
    .row()
    .text('[•] Bola Basket', 'dice_roll:basketball')
    .text('[•] Sepak Bola', 'dice_roll:football')
    .row()
    .text('[•] Slot Casino 777', 'dice_roll:slots')
    .text('[•] Bowling', 'dice_roll:bowling')
    .row()
    .text('[ « KEMBALI ]', 'menu_main');

  let text = `<b>[ GAME DADU & CASINO TELEGRAM ]</b>\n\n`;
  text += `Pilih game di bawah ini untuk memulai lemparan.\n`;
  text += `Telegram akan memutar animasi nyata dan poin kemenangan akan otomatis dicatat ke leaderboard:`;

  return { text, keyboard };
}

/**
 * Mengirim Menu Utama dengan Banner JPEG jika Tersedia
 */
export async function sendTelegramMenuWithBanner(ctx, menu) {
  const banner = getActiveBanner();
  if (banner) {
    try {
      if (banner.type === 'animation') {
        return await ctx.replyWithAnimation(new InputFile(banner.path), {
          caption: menu.text,
          parse_mode: 'HTML',
          reply_markup: menu.keyboard,
        });
      } else {
        return await ctx.replyWithPhoto(new InputFile(banner.path), {
          caption: menu.text,
          parse_mode: 'HTML',
          reply_markup: menu.keyboard,
        });
      }
    } catch (err) {
      logger.warn('[Telegram] Gagal mengirim banner, fallback teks:', err.message);
    }
  }

  return await ctx.reply(menu.text, {
    parse_mode: 'HTML',
    reply_markup: menu.keyboard,
  });
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

    // 2. Cek Music Selection (1 - 5)
    const pendingMusic = getMusicSelection({ platform: 'telegram', chatId, userId });
    if (pendingMusic && /^[1-5]$/.test(rawText)) {
      const choiceIdx = parseInt(rawText, 10) - 1;
      if (choiceIdx < 0 || choiceIdx >= pendingMusic.candidates.length) {
        await reply(`[!] Pilih angka 1 sampai ${pendingMusic.candidates.length}.`);
        return;
      }

      const candidate = consumeMusicSelection({
        platform: 'telegram',
        chatId,
        userId,
        index: choiceIdx,
      });
      if (!candidate) {
        await reply('[!] Daftar lagu sudah kedaluwarsa. Cari lagi dengan /play.');
        return;
      }

      try {
        const track = await downloadMusicTrack(candidate.url, candidate);
        await sendMusicAudio({ platform: 'telegram', ctx, sock: telegramSock, jid: chatId, track });
      } catch (err) {
        logger.error('[Telegram] Error saat mengunduh pilihan lagu:', err.message);
        await reply(`[!] Gagal memutar lagu: ${err.message}`);
      }
      return;
    }

    // 3. Cek Autocomplete Selection (1 - 5)
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

    let cleanCmd = rawCmd.toLowerCase();
    if (cleanCmd.includes('@')) {
      const [baseCmd, botMention] = cleanCmd.split('@');
      if (botInfo?.username && botMention.toLowerCase() === botInfo.username.toLowerCase()) {
        cleanCmd = baseCmd;
      }
    }

    // INTERAKTIF MENU TELEGRAM: Tampilkan menu + banner jika /menu atau /start dipanggil
    if (cleanCmd === 'menu' || cleanCmd === 'start' || cleanCmd === 'help') {
      const menu = buildTelegramMainMenu(pushName);
      await sendTelegramMenuWithBanner(ctx, menu);
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
      react: (emoji = '👍') => reactWait({ ctx, platform: 'telegram', emoji }),
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
    const callbackChatId = ctx.callbackQuery?.message?.chat?.id || ctx.chat?.id;
    const chatId = String(callbackChatId || userId);

    // 0a. SIMPKL Auto-Filler & Date Picker callbacks
    if (data.startsWith('simpkl_')) {
      await handleSimpklCallback(ctx, data);
      return;
    }

    // 0. Music search selection
    if (data.startsWith('music_pick:')) {
      const [, token, rawIndex] = data.split(':');
      const index = Number.parseInt(rawIndex, 10);
      const candidate = consumeMusicSelection({
        token,
        platform: 'telegram',
        chatId,
        userId,
        index,
      });

      if (!candidate) {
        await ctx.reply('[!] Pilihan lagu sudah kedaluwarsa. Cari lagi dengan /play.').catch(() => {});
        return;
      }

      try {
        const track = await downloadMusicTrack(candidate.url, candidate);
        await sendMusicAudio({ platform: 'telegram', ctx, jid: chatId, track });
      } catch (err) {
        logger.error('[Telegram] Error saat mengunduh pilihan lagu:', err.message);
        await ctx.reply(`[!] Gagal memutar lagu: ${err.message}`, { parse_mode: 'HTML' }).catch(() => {});
      }
      return;
    }

    if (data.startsWith('music_cancel:')) {
      const [, token] = data.split(':');
      cancelMusicSelection({ token, platform: 'telegram', chatId, userId });
      await safeEditOrReply(ctx, '<b>[ MUSIC SEARCH ]</b>\n\nPencarian dibatalkan.', new InlineKeyboard().text('[ MENU UTAMA ]', 'menu_main'));
      return;
    }

    // 1. Menu Utama
    if (data === 'menu_main') {
      const menu = buildTelegramMainMenu(pushName);
      await safeEditOrReply(ctx, menu.text, menu.keyboard);
      return;
    }

    // 2. Kategori Menu Tertentu
    if (data.startsWith('menu_cat:')) {
      const cat = data.replace('menu_cat:', '');
      if (cat === 'dice_picker') {
        const picker = buildDicePicker();
        await safeEditOrReply(ctx, picker.text, picker.keyboard);
        return;
      }

      const catMenu = buildCategoryMenu(cat);
      await safeEditOrReply(ctx, catMenu.text, catMenu.keyboard);
      return;
    }

    // 3. Semua Perintah
    if (data === 'menu_all') {
      const categories = getCommandsByCategory('telegram');
      let text = `<b>[ SELURUH DAFTAR PERINTAH BOT TELEGRAM ]</b>\n\n`;

      for (const [cat, list] of Object.entries(categories)) {
        text += `<b>[ ${cat.toUpperCase()} ]</b>\n`;
        for (const item of list) {
          text += `• /${item.name} - <i>${escapeHtml(item.description)}</i>\n`;
        }
        text += `\n`;
      }

      const keyboard = new InlineKeyboard().text('[ « KEMBALI ]', 'menu_main');
      await safeEditOrReply(ctx, text, keyboard);
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
          label = `[ JACKPOT 777! SEMPURNA! ]`;
        } else if ([1, 22, 43].includes(val)) {
          reward = 120;
          label = `[ TIGA GAMBAR SERUPA! MENANG BESAR ]`;
        } else {
          reward = 15;
          label = `Belum jackpot, coba lagi! Skor mesin: ${val}`;
        }
      } else if (diceType === 'dart') {
        if (val === 6) {
          reward = 100;
          label = `[ BULLSEYE TEPAT DI LINGKARAN TENGAH ]`;
        } else {
          reward = val * 10;
          label = `Skor sasaran: <b>${val}</b>`;
        }
      } else if (diceType === 'basketball') {
        if (val >= 4) {
          reward = 60;
          label = `[ TEMBAKAN MASUK RING (SWISH) ]`;
        } else {
          reward = 10;
          label = `Meleset tipis, lempar lagi!`;
        }
      } else if (diceType === 'football') {
        if ([3, 4, 5].includes(val)) {
          reward = 60;
          label = `[ GOOOL! TEMBAKAN AKURAT ]`;
        } else {
          reward = 10;
          label = `Membentur tiang gawang!`;
        }
      } else if (diceType === 'bowling') {
        if (val === 6) {
          reward = 90;
          label = `[ STRIKE! SEMUA PIN JATUH ]`;
        } else {
          reward = val * 10;
          label = `Pin yang berhasil dijatuhkan: <b>${val}</b>`;
        }
      } else {
        if (val === 6) {
          reward = 60;
          label = `[ ANGKA MAKSIMAL 6! ]`;
        } else {
          reward = val * 8;
          label = `Mata dadu: <b>${val}</b>`;
        }
      }

      const totalPoin = addScore(`tg:${userId}`, reward, pushName);

      let resultText = `<b>${label}</b>\n\n`;
      resultText += `• Pemain: <b>${pushName}</b>\n`;
      resultText += `• Hadiah: <b>+${reward} Poin</b>\n`;
      resultText += `• Total Poin: <b>${totalPoin} Poin</b>`;

      const replayKeyboard = new InlineKeyboard()
        .text(`[ ⟳ LEMPAR LAGI ]`, `dice_roll:${diceType}`)
        .text('[ DADU LAIN ]', 'menu_cat:dice_picker')
        .row()
        .text('[ LEADERBOARD ]', 'quick_leaderboard')
        .text('[ « KEMBALI ]', 'menu_main');

      await ctx.reply(resultText, {
        parse_mode: 'HTML',
        reply_markup: replayKeyboard,
      });
      return;
    }

    // 5. Quick Whoami
    if (data === 'quick_whoami') {
      let out = `<b>[ PROFIL TELEGRAM ANDA ]</b>\n\n`;
      out += `• User ID: <code>${user?.id}</code>\n`;
      out += `• Nama: ${user?.first_name || ''} ${user?.last_name || ''}\n`;
      out += `• Username: ${user?.username ? '@' + user.username : '(Belum ada)'}\n`;
      out += `• Status Premium: ${user?.is_premium ? 'Premium' : 'Reguler'}\n`;

      const keyboard = new InlineKeyboard()
        .text('[ CEK SKOR ]', 'quick_leaderboard')
        .text('[ « KEMBALI ]', 'menu_main');

      await safeEditOrReply(ctx, out, keyboard);
      return;
    }

    // 6. Quick Leaderboard
    if (data === 'quick_leaderboard') {
      const top = getLeaderboard(5);
      let out = `<b>[ LEADERBOARD TOP 5 SKOR ]</b>\n\n`;
      if (top.length === 0) {
        out += `<i>Belum ada pemain dengan poin. Ayo main game untuk mengumpulkan poin!</i>\n`;
      } else {
        const ranks = ['[1]', '[2]', '[3]', '[4]', '[5]'];
        top.forEach((u, i) => {
          const rank = ranks[i] || '•';
          out += `${rank} <b>${u.pushName || 'Pemain'}</b>: ${u.score} Poin (${u.gamesWon || 0} Menang)\n`;
        });
      }

      const keyboard = new InlineKeyboard()
        .text('[ GAME DADU ]', 'menu_cat:dice_picker')
        .text('[ « KEMBALI ]', 'menu_main');

      await safeEditOrReply(ctx, out, keyboard);
      return;
    }

    // 7. Quick AI
    if (data === 'quick_ai') {
      let out = `<b>[ PANDUAN PENGGUNAAN AI ]</b>\n\n`;
      out += `Ketik langsung perintah berikut di chat:\n`;
      out += `• <code>/ai Ceritakan ringkasan sejarah komputer</code>\n`;
      out += `• <code>/explain console.log("hello")</code>\n`;
      out += `• <code>/summarize &lt;artikel panjang&gt;</code>\n`;
      out += `• <code>/translate &lt;kalimat bahasa asing&gt;</code>`;

      const keyboard = new InlineKeyboard().text('[ « KEMBALI ]', 'menu_main');
      await safeEditOrReply(ctx, out, keyboard);
      return;
    }

    // 8. Quick Shortcuts Menu
    if (data === 'quick_buttons') {
      const keyboard = new InlineKeyboard()
        .text('[ TANYA AI ]', 'quick_ai')
        .text('[ TEBAK GAMBAR ]', 'quick_tg')
        .row()
        .text('[ CASINO 777 ]', 'dice_roll:slots')
        .text('[ LEADERBOARD ]', 'quick_leaderboard')
        .row()
        .text('[ CEK IP SAYA ]', 'quick_ip')
        .text('[ « KEMBALI ]', 'menu_main');

      await safeEditOrReply(ctx, '[ PINTASAN CEPAT INTERAKTIF ]\n\nPilih aksi di bawah ini dengan menekan tombol:', keyboard);
      return;
    }

    // 9. Quick IP
    if (data === 'quick_ip') {
      try {
        const res = await fetch('http://ip-api.com/json/?fields=status,message,country,city,isp,query');
        const dataIp = await res.json();
        let out = `<b>[ INFORMASI IP SERVER ]</b>\n\n`;
        out += `• IP: <code>${dataIp.query}</code>\n`;
        out += `• Negara: ${dataIp.country}\n`;
        out += `• Kota: ${dataIp.city}\n`;
        out += `• ISP: ${dataIp.isp}\n`;

        const keyboard = new InlineKeyboard().text('[ « KEMBALI ]', 'menu_main');
        await safeEditOrReply(ctx, out, keyboard);
      } catch {
        await safeEditOrReply(ctx, '[!] Gagal mengambil informasi IP.', new InlineKeyboard().text('[ « KEMBALI ]', 'menu_main'));
      }
      return;
    }

    // 10. Quick Tebak Gambar Launch
    if (data === 'quick_tg') {
      if (activeGames.has(chatId)) {
        await ctx.reply('Masih ada permainan yang sedang berlangsung di chat ini. Ketik /nyerah jika menyerah.');
        return;
      }

      const item = tebakGambarList[Math.floor(Math.random() * tebakGambarList.length)];
      const timeoutSec = 60;

      const timer = setTimeout(async () => {
        if (activeGames.has(chatId)) {
          activeGames.delete(chatId);
          await ctx.reply(`[-] Waktu Habis! Jawaban yang benar adalah: <b>${item.answer}</b>`, { parse_mode: 'HTML' });
        }
      }, timeoutSec * 1000);

      activeGames.set(chatId, {
        type: 'tebakgambar',
        answer: item.answer,
        reward: 50,
        timer,
      });

      let caption = `<b>[ TEBAK GAMBAR INTERAKTIF ]</b>\n\n`;
      caption += `• Petunjuk: <code>${item.clue}</code>\n`;
      caption += `• Waktu: <b>${timeoutSec} detik</b>\n`;
      caption += `• Hadiah: <b>+50 Poin</b>\n\n`;
      caption += `Ketik jawabanmu langsung di chat ini (atau ketik <code>/nyerah</code>).`;

      try {
        await ctx.replyWithPhoto(item.image, {
          caption,
          parse_mode: 'HTML',
        });
      } catch {
        await ctx.reply(`${caption}\n\nTautan Gambar: ${item.image}`, { parse_mode: 'HTML' });
      }
      return;
    }

    // 11. Visual Tic-Tac-Toe 3x3 Grid
    if (data === 'visual_ttt_new') {
      const session = createTicTacToeSession(chatId, { id: userId, name: pushName });
      const boardRender = renderTicTacToeBoard(session);
      await safeEditOrReply(ctx, boardRender.text, boardRender.keyboard);
      return;
    }

    if (data.startsWith('ttt_click:')) {
      const [, sessionId, rawIdx] = data.split(':');
      const idx = parseInt(rawIdx, 10);
      const session = visualSessions.get(sessionId);

      if (session && !session.winner && !session.isDraw && session.board[idx] === '') {
        session.board[idx] = 'X';
        let win = checkTicTacToeWinner(session.board);

        if (win === 'X') {
          session.winner = 'X';
          addScore(`tg:${userId}`, 50, pushName);
        } else if (win === 'draw') {
          session.isDraw = true;
        } else {
          session.turn = 'O';
          const botIdx = makeBotMove(session.board);
          if (botIdx !== null && botIdx !== undefined) {
            session.board[botIdx] = 'O';
            const botWin = checkTicTacToeWinner(session.board);
            if (botWin === 'O') {
              session.winner = 'O';
            } else if (botWin === 'draw') {
              session.isDraw = true;
            }
          }
          session.turn = 'X';
        }

        const boardRender = renderTicTacToeBoard(session);
        await safeEditOrReply(ctx, boardRender.text, boardRender.keyboard);
      }
      return;
    }

    if (data.startsWith('ttt_forfeit:')) {
      const [, sessionId] = data.split(':');
      const session = visualSessions.get(sessionId);
      if (session) {
        session.winner = 'O';
        const boardRender = renderTicTacToeBoard(session);
        await safeEditOrReply(ctx, boardRender.text, boardRender.keyboard);
      }
      return;
    }

    // 12. Visual Batu Gunting Kertas (RPS)
    if (data === 'quick_rps') {
      const text = `<b>[ BATU GUNTING KERTAS INTERAKTIF ]</b>\n\nPilih salah satu jurus di bawah ini untuk melawan bot:`;
      const keyboard = buildRpsKeyboard();
      await safeEditOrReply(ctx, text, keyboard);
      return;
    }

    if (data.startsWith('rps_play:')) {
      const choice = data.replace('rps_play:', '');
      const round = playRpsRound(choice, pushName, userId);
      await safeEditOrReply(ctx, round.text, round.keyboard);
      return;
    }

    // 13. Filter Info Guide
    if (data.startsWith('filter_info:')) {
      const type = data.replace('filter_info:', '');
      const guides = {
        hd: '<b>[ CARA PAKAI: /hd ]</b>\n\nKirim foto dengan caption <code>/hd</code> atau balas foto yang sudah ada dengan <code>/hd</code> untuk meningkatkan resolusi & ketajaman foto.',
        story: '<b>[ CARA PAKAI: /story ]</b>\n\nKirim foto dengan caption <code>/story</code> untuk mengubah foto menjadi video story vertikal 9:16 aesthetic dengan gerakan zoom & vignette.',
        contrast: '<b>[ CARA PAKAI: /contrast ]</b>\n\nBalas foto dengan <code>/contrast</code> untuk meningkatkan dynamic range dan ketajaman kontras warna.',
        vintage: '<b>[ CARA PAKAI: /vintage ]</b>\n\nBalas foto dengan <code>/vintage</code> untuk menerapkan filter warna film analog 90s.',
        noir: '<b>[ CARA PAKAI: /noir ]</b>\n\nBalas foto dengan <code>/noir</code> untuk mengubah foto menjadi hitam-putih monokrom kontras tinggi.',
        hdvid: '<b>[ CARA PAKAI: /hdvid ]</b>\n\nKirim video dengan caption <code>/hdvid</code> atau balas video untuk meningkatkan kejernihan dan ketajaman video.',
      };
      const text = guides[type] || 'Kirim atau balas foto/video dengan perintah filter.';
      const keyboard = new InlineKeyboard().text('[ « KEMBALI ]', 'menu_cat:media');
      await safeEditOrReply(ctx, text, keyboard);
      return;
    }

    // 14. Direct Tool Execution from Menu
    if (data.startsWith('menu_direct:')) {
      const cmd = data.replace('menu_direct:', '');
      if (cmd === 'gempa') {
        const gempaCmd = commands.get('gempa');
        if (gempaCmd) {
          const telegramSock = createTelegramSocketAdapter(_bot, ctx, chatId);
          await gempaCmd.execute({ sock: telegramSock, jid: chatId, reply: (t) => ctx.reply(t, { parse_mode: 'HTML' }), react: (e) => ctx.react?.(e) });
        }
        return;
      }
      if (cmd === 'cuaca') {
        const text = '<b>[ CEK CUACA ]</b>\n\nKetik langsung di chat:\n<code>/cuaca Jakarta</code> atau <code>/cuaca Surabaya</code>';
        await safeEditOrReply(ctx, text, new InlineKeyboard().text('[ « KEMBALI ]', 'menu_cat:info'));
        return;
      }
      if (cmd === 'sholat') {
        const text = '<b>[ JADWAL SHOLAT ]</b>\n\nKetik langsung di chat:\n<code>/sholat Jakarta</code> atau <code>/sholat Bandung</code>';
        await safeEditOrReply(ctx, text, new InlineKeyboard().text('[ « KEMBALI ]', 'menu_cat:islami'));
        return;
      }
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

    botInfo = await botInstance.api.getMe();
    logger.info(`Telegram Bot Berhasil Terhubung sebagai @${botInfo.username} (${botInfo.first_name})`);

    // Daftarkan command autocomplete popup Telegram secara otomatis
    try {
      const tgCommands = [];
      for (const cmd of commands.values()) {
        if (isCommandSupported(cmd, 'telegram') && !tgCommands.some((c) => c.command === cmd.name)) {
          const cleanDesc = (cmd.description || 'Perintah NexBot').replace(/<[^>]*>/g, '').slice(0, 100);
          tgCommands.push({
            command: cmd.name.toLowerCase(),
            description: cleanDesc,
          });
        }
      }
      if (tgCommands.length > 0) {
        await botInstance.api.setMyCommands(tgCommands.slice(0, 100));
        logger.info(`[Telegram] ${tgCommands.length} perintah otomatis didaftarkan ke menu autocomplete Telegram.`);
      }
    } catch (cmdErr) {
      logger.warn('[Telegram] Gagal mendaftarkan setMyCommands:', cmdErr.message);
    }
    botInstance.on(['message:text', 'message:caption'], async (ctx) => {
      await handleTelegramMessage(botInstance, ctx);
    });

    botInstance.on('callback_query:data', async (ctx) => {
      await handleTelegramCallback(botInstance, ctx);
    });

    botInstance.catch((err) => {
      logger.error('[Telegram] Polling error:', err.message);
    });

    connectStartTime = Date.now();
    botStatus = 'connected';

    botInstance.start({
      drop_pending_updates: true,
      onStart: (info) => {
        logger.info(`Telegram Polling aktif untuk @${info.username}`);
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
