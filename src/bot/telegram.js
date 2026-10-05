import { Bot, InputFile } from 'grammy';
import { logger } from '../utils/logger.js';
import { getConfig } from '../config.js';
import { commands, aliases } from './handler.js';
import { checkRateLimit } from './antiBan.js';
import { incrementCommandStat } from '../utils/database.js';
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

  // 1. Amankan karakter dasar HTML
  let escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // 2. Kode blok ```...```
  escaped = escaped.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');

  // 3. Inline code `...`
  escaped = escaped.replace(/`([^`\n]+)`/g, '<code>$1</code>');

  // 4. Bold *...*
  escaped = escaped.replace(/(?<!\w)\*([^*\n]+)\*(?!\w)/g, '<b>$1</b>');

  // 5. Italic _..._
  escaped = escaped.replace(/(?<!\w)_([^_\n]+)_(?!\w)/g, '<i>$1</i>');

  // 6. Strikethrough ~...~
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
        // Teks
        if (content.text || typeof content === 'string') {
          const rawText = content.text || content;
          const htmlText = formatTelegramHtml(rawText);
          try {
            return await bot.api.sendMessage(destId, htmlText, {
              parse_mode: 'HTML',
              reply_parameters: options.quoted ? { message_id: options.quoted.message_id || options.quoted.key?.id } : undefined,
            });
          } catch {
            // Fallback plain text jika parsing HTML gagal
            return await bot.api.sendMessage(destId, rawText);
          }
        }

        // Gambar
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

        // Video
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

        // Stiker
        if (content.sticker) {
          let file;
          if (Buffer.isBuffer(content.sticker) || content.sticker instanceof Uint8Array) {
            file = new InputFile(content.sticker, 'sticker.webp');
          } else {
            file = content.sticker;
          }
          return await bot.api.sendSticker(destId, file);
        }

        // Dokumen
        if (content.document) {
          let file;
          if (Buffer.isBuffer(content.document)) {
            file = new InputFile(content.document, content.fileName || 'file.bin');
          } else {
            file = content.document;
          }
          return await bot.api.sendDocument(destId, file, {
            caption: content.caption,
          });
        }
      } catch (err) {
        logger.error(`[Telegram] Gagal mengirim pesan ke ${destId}:`, err.message);
        return null;
      }
    },

    async sendPresenceUpdate(presence, jid) {
      const destId = jid || chatId;
      try {
        const action = presence === 'composing' ? 'typing' : 'typing';
        await bot.api.sendChatAction(destId, action);
      } catch {
        // Abaikan
      }
    },
  };
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
    if (rawText === matchedPrefix || rawText === `${matchedPrefix}?` || rawText === `${matchedPrefix}help`) {
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

    // 4. Rate Limiting
    const rateCheck = checkRateLimit(`tg:${userId}`);
    if (rateCheck.limited) {
      await reply(`[!] Mohon tunggu ${rateCheck.remaining} detik sebelum menggunakan perintah lagi.`);
      return;
    }

    // 5. Cek Feature Toggle
    if (command.category !== 'general') {
      const isCategoryActive = config.features && config.features[command.category];
      if (isCategoryActive === false) {
        await reply(`[!] Fitur *${command.category.toUpperCase()}* sedang dinonaktifkan oleh administrator.`);
        return;
      }
    }

    // 6. Eksekusi Command
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
