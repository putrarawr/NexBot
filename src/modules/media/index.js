import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { registerCommand } from '../../bot/handler.js';
import { logger } from '../../utils/logger.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import sharp from 'sharp';
import {
  imageToWebpSticker,
  videoToWebpSticker,
  stickerToPng,
  generateQuoteSticker,
  createPhotoLiveMotion,
  addStickerExif,
} from './converter.js';
import {
  enhanceImageHd,
  enhanceImageContrast,
  enhanceImageVintage,
  enhanceImageNoir,
  generateAestheticStoryVideo,
  enhanceVideoHd,
} from './enhancer.js';
import { InlineKeyboard } from 'grammy';
import { downloadMusicTrack } from '../downloader/music-search.js';

const escapeHtml = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export async function extractPhotoBuffer({ msg, ctx, platform }) {
  if (platform === 'telegram' && ctx) {
    const target = ctx.message?.reply_to_message || ctx.message;
    if (target?.photo && target.photo.length > 0) {
      const fileId = target.photo[target.photo.length - 1].file_id;
      const file = await ctx.api.getFile(fileId);
      const token = process.env.TELEGRAM_BOT_TOKEN;
      const res = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`);
      return Buffer.from(await res.arrayBuffer());
    }
    if (target?.document && target.document.mime_type?.startsWith('image/')) {
      const file = await ctx.api.getFile(target.document.file_id);
      const token = process.env.TELEGRAM_BOT_TOKEN;
      const res = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`);
      return Buffer.from(await res.arrayBuffer());
    }
    return null;
  }

  let quoted = msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  if (quoted?.viewOnceMessage?.message) quoted = quoted.viewOnceMessage.message;
  if (quoted?.viewOnceMessageV2?.message) quoted = quoted.viewOnceMessageV2.message;

  if (quoted?.imageMessage) {
    const fakeMsg = { key: { id: msg?.message?.extendedTextMessage?.contextInfo?.stanzaId }, message: quoted };
    return await downloadMediaMessage(fakeMsg, 'buffer', {});
  }

  let directMsg = msg?.message;
  if (directMsg?.viewOnceMessage?.message) directMsg = directMsg.viewOnceMessage.message;
  if (directMsg?.viewOnceMessageV2?.message) directMsg = directMsg.viewOnceMessageV2.message;

  if (directMsg?.imageMessage) {
    return await downloadMediaMessage(msg, 'buffer', {});
  }
  return null;
}

export async function extractVideoBuffer({ msg, ctx, platform }) {
  if (platform === 'telegram' && ctx) {
    const target = ctx.message?.reply_to_message || ctx.message;
    const vid = target?.video || target?.animation;
    if (vid) {
      const fileId = vid.file_id;
      const file = await ctx.api.getFile(fileId);
      const token = process.env.TELEGRAM_BOT_TOKEN;
      const res = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`);
      return Buffer.from(await res.arrayBuffer());
    }
    if (target?.document && target.document.mime_type?.startsWith('video/')) {
      const file = await ctx.api.getFile(target.document.file_id);
      const token = process.env.TELEGRAM_BOT_TOKEN;
      const res = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`);
      return Buffer.from(await res.arrayBuffer());
    }
    return null;
  }

  let quoted = msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  if (quoted?.viewOnceMessage?.message) quoted = quoted.viewOnceMessage.message;
  if (quoted?.viewOnceMessageV2?.message) quoted = quoted.viewOnceMessageV2.message;

  if (quoted?.videoMessage) {
    const fakeMsg = { key: { id: msg?.message?.extendedTextMessage?.contextInfo?.stanzaId }, message: quoted };
    return await downloadMediaMessage(fakeMsg, 'buffer', {});
  }

  let directMsg = msg?.message;
  if (directMsg?.viewOnceMessage?.message) directMsg = directMsg.viewOnceMessage.message;
  if (directMsg?.viewOnceMessageV2?.message) directMsg = directMsg.viewOnceMessageV2.message;

  if (directMsg?.videoMessage) {
    return await downloadMediaMessage(msg, 'buffer', {});
  }
  return null;
}

export function registerMediaCommands() {
  // 1. Command: Sticker (/s / /sticker)
  registerCommand({
    name: 'sticker',
    aliases: ['s', 'stiker'],
    category: 'media',
    description: 'Mengubah foto, video, atau GIF menjadi stiker',
    usage: '/s [kirim foto/video dengan caption /s atau balas media] atau /s <pack>|<author>',
    async execute({ sock, msg, jid, reply, prefix, ctx, platform, react, fullText }) {
      if (typeof react === 'function') await react('👍');

      try {
        let mediaBuffer = null;
        let isVideo = false;

        if (platform === 'telegram' && ctx) {
          const target = ctx.message?.reply_to_message || ctx.message;
          if (target?.photo && target.photo.length > 0) {
            const fileId = target.photo[target.photo.length - 1].file_id;
            const file = await ctx.api.getFile(fileId);
            const token = process.env.TELEGRAM_BOT_TOKEN;
            const res = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`);
            mediaBuffer = Buffer.from(await res.arrayBuffer());
            isVideo = false;
          } else if (target?.video || target?.animation) {
            const vid = target.video || target.animation;
            const fileId = vid.file_id;
            const file = await ctx.api.getFile(fileId);
            const token = process.env.TELEGRAM_BOT_TOKEN;
            const res = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`);
            mediaBuffer = Buffer.from(await res.arrayBuffer());
            isVideo = true;
          }
        } else {
          let quoted = msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
          if (quoted?.viewOnceMessage?.message) quoted = quoted.viewOnceMessage.message;
          if (quoted?.viewOnceMessageV2?.message) quoted = quoted.viewOnceMessageV2.message;

          const isQuotedImage = quoted?.imageMessage;
          const isQuotedVideo = quoted?.videoMessage;

          let direct = msg?.message;
          if (direct?.viewOnceMessage?.message) direct = direct.viewOnceMessage.message;
          if (direct?.viewOnceMessageV2?.message) direct = direct.viewOnceMessageV2.message;

          const isDirectImage = direct?.imageMessage;
          const isDirectVideo = direct?.videoMessage;

          if (isQuotedImage || isQuotedVideo) {
            const fakeMsg = {
              key: { id: msg.message?.extendedTextMessage?.contextInfo?.stanzaId },
              message: quoted,
            };
            mediaBuffer = await downloadMediaMessage(fakeMsg, 'buffer', {});
            isVideo = !!isQuotedVideo;
          } else if (isDirectImage || isDirectVideo) {
            mediaBuffer = await downloadMediaMessage(msg, 'buffer', {});
            isVideo = !!isDirectVideo;
          }
        }

        if (!mediaBuffer || mediaBuffer.length === 0) {
          return reply(`[!] Format salah.\nKirim foto atau video pendek dengan caption <code>${prefix}s</code> atau balas media yang sudah ada.`);
        }

        let pack = 'NexusBot';
        let author = 'nexusbot';

        const rawMeta = fullText?.trim();
        if (rawMeta) {
          if (rawMeta.includes('|')) {
            const parts = rawMeta.split('|').map((s) => s.trim()).filter(Boolean);
            if (parts[0]) pack = parts[0];
            if (parts[1]) author = parts[1];
          } else {
            author = rawMeta;
          }
        }

        let webpSticker;
        if (isVideo) {
          webpSticker = await videoToWebpSticker(mediaBuffer, false, { pack, author });
        } else {
          webpSticker = await imageToWebpSticker(mediaBuffer, { pack, author });
        }

        await sock.sendMessage(jid, {
          sticker: webpSticker,
        });
      } catch (err) {
        logger.error('Error saat membuat stiker:', err.message);
        await reply(`[!] Gagal membuat stiker: ${err.message}`);
      }
    },
  });

  // 2. Command: ToImage (/toimg)
  registerCommand({
    name: 'toimg',
    aliases: ['tofoto', 'topng'],
    category: 'media',
    description: 'Mengubah stiker menjadi gambar foto biasa',
    usage: '/toimg [balas stiker]',
    async execute({ sock, msg, jid, reply, prefix, ctx, platform, react }) {
      let stickerBuffer = null;

      if (platform === 'telegram' && ctx) {
        const target = ctx.message?.reply_to_message || ctx.message;
        if (target?.sticker) {
          const fileId = target.sticker.file_id;
          const file = await ctx.api.getFile(fileId);
          const token = process.env.TELEGRAM_BOT_TOKEN;
          const res = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`);
          stickerBuffer = Buffer.from(await res.arrayBuffer());
        }
      } else {
        const quoted = msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const isSticker = quoted?.stickerMessage;
        if (isSticker) {
          const fakeMsg = {
            key: { id: msg.message?.extendedTextMessage?.contextInfo?.stanzaId },
            message: quoted,
          };
          stickerBuffer = await downloadMediaMessage(fakeMsg, 'buffer', {});
        }
      }

      if (!stickerBuffer) {
        return reply(`[!] Balas (*reply*) sebuah stiker dengan perintah <code>${prefix}toimg</code> untuk mengubahnya jadi foto.`);
      }

      if (typeof react === 'function') await react('👍');

      try {
        const pngBuffer = await stickerToPng(stickerBuffer);
        await sock.sendMessage(jid, {
          image: pngBuffer,
          caption: 'Hasil konversi stiker ke gambar:',
        });
      } catch (err) {
        logger.error('Error saat toimg:', err.message);
        await reply(`[!] Gagal mengubah stiker: ${err.message}`);
      }
    },
  });

  // 3. Command: Quote Chat (.qc)
  registerCommand({
    name: 'qc',
    aliases: ['quote', 'quotesticker'],
    category: 'media',
    description: 'Membuat stiker gelembung quote chat estetik ala Telegram',
    usage: '.qc <teks> atau balas pesan orang lain dengan .qc',
    async execute({ sock, msg, jid, pushName, sender, fullText, reply, prefix, ctx, react }) {
      let textToQuote = fullText?.trim();
      let authorName = pushName || 'User';
      const senderNum = sender.replace(/[^0-9]/g, '');

      // 1. WhatsApp Quoted Message Context
      const quoted = msg.message?.extendedTextMessage?.contextInfo;
      if (!textToQuote && quoted?.quotedMessage) {
        const qMsg = quoted.quotedMessage;
        textToQuote = qMsg.conversation || qMsg.extendedTextMessage?.text || '';
        authorName = quoted.participant ? quoted.participant.replace(/[^0-9]/g, '') : authorName;
      }

      // 2. Telegram Replied Message Context
      const tgReply = ctx?.message?.reply_to_message;
      if (!textToQuote && tgReply) {
        textToQuote = tgReply.text || tgReply.caption || '';
        const tgName = [tgReply.from?.first_name, tgReply.from?.last_name].filter(Boolean).join(' ') || tgReply.from?.username || 'User';
        authorName = tgName;
      }
      if (!textToQuote) {
        return reply(`[!] Masukkan teks untuk quote.\nContoh: \`${prefix}qc Kata-kata hari ini\`\natau balas pesan orang lain dengan \`${prefix}qc\`.`);
      }

      if (typeof react === 'function') await react('👍');

      try {
        const webpBuffer = await generateQuoteSticker(authorName, textToQuote, senderNum);

        await sock.sendMessage(jid, {
          sticker: webpBuffer,
        });
      } catch (err) {
        logger.error('Error saat membuat quote sticker:', err.message);
        await reply(`[!] Gagal membuat quote stiker: ${err.message}`);
      }
    },
  });

  // 4. Command: PhotoLive (.photolive / .livephoto)
  registerCommand({
    name: 'photolive',
    aliases: ['livephoto', 'livepic'],
    category: 'media',
    description: 'iPhone Live Photo converter (video pendek ke stiker bergerak loop mulus, atau foto jadi video gerak)',
    usage: '.photolive [balas Live Photo iPhone / video / foto]',
    async execute({ sock, msg, jid, reply, prefix }) {
      const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      const isQuotedVideo = quoted?.videoMessage;
      const isQuotedImage = quoted?.imageMessage;

      const isDirectVideo = msg.message?.videoMessage;
      const isDirectImage = msg.message?.imageMessage;

      if (!isDirectVideo && !isDirectImage && !isQuotedVideo && !isQuotedImage) {
        return reply(`[PHOTOLIVE IPHONE]\n\nKirim atau balas (*reply*) video pendek Live Photo iPhone atau foto dengan \`${prefix}photolive\`.\n\n- Video / Live Photo : Diubah jadi stiker animasi bergerak looping mulus (boomerang).\n- Foto statis : Diubah jadi video sinematik gerak mulus anti-getar.`);
      }

      await reply('[-] Memproses efek PhotoLive...');

      try {
        let mediaBuffer;
        let isVideo = false;

        if (isQuotedVideo || isQuotedImage) {
          const fakeMsg = {
            key: { id: msg.message?.extendedTextMessage?.contextInfo?.stanzaId },
            message: quoted,
          };
          mediaBuffer = await downloadMediaMessage(fakeMsg, 'buffer', {});
          isVideo = !!isQuotedVideo;
        } else {
          mediaBuffer = await downloadMediaMessage(msg, 'buffer', {});
          isVideo = !!isDirectVideo;
        }

        if (isVideo) {
          // Kasus 1: Live Photo video -> Animated WebP sticker loop boomerang
          const animSticker = await videoToWebpSticker(mediaBuffer, true);
          await sock.sendMessage(jid, {
            sticker: animSticker,
          });
        } else {
          // Kasus 2: Foto -> Video gerak sinematik mulus
          const motionVideo = await createPhotoLiveMotion(mediaBuffer);
          await sock.sendMessage(jid, {
            video: motionVideo,
            caption: '[PHOTOLIVE] Motion Cinematic Effect',
            gifPlayback: true,
          });
        }
      } catch (err) {
        logger.error('Error saat proses PhotoLive:', err.message);
        await reply(`[!] Gagal memproses PhotoLive: ${err.message}`);
      }
    },
  });

  // 5. Command: HD Photo Enhancer (/hd / /remini)
  registerCommand({
    name: 'hd',
    aliases: ['remini', 'upscale', 'enhance', 'jernih'],
    category: 'media',
    description: 'Tingkatkan resolusi, ketajaman, dan kejernihan foto ala Remini',
    usage: '/hd [kirim foto dengan caption /hd atau balas foto]',
    async execute({ sock, msg, jid, reply, prefix, ctx, platform, react }) {
      const buffer = await extractPhotoBuffer({ msg, ctx, platform });
      if (!buffer) {
        return reply(`[!] Format salah. Kirim foto dengan caption <code>${prefix}hd</code> atau balas foto yang sudah ada.`);
      }

      if (typeof react === 'function') await react('👍');

      try {
        const enhanced = await enhanceImageHd(buffer);
        await sock.sendMessage(jid, {
          image: enhanced,
          caption: '<b>[ HD PHOTO ENHANCED ]</b>\n\nResolusi dan ketajaman foto berhasil ditingkatkan.',
        });
      } catch (err) {
        logger.error('Error saat enhance HD foto:', err.message);
        await reply(`[!] Gagal memproses HD foto: ${err.message}`);
      }
    },
  });

  // 6. Command: Aesthetic 9:16 Video Story Creator (/story)
  registerCommand({
    name: 'story',
    aliases: ['storywa', 'storyig', 'aesthetic'],
    category: 'media',
    description: 'Buat video story IG/WA 9:16 aesthetic dengan zoom sinematik & vignette',
    usage: '/story [kirim foto dengan caption /story atau balas foto]',
    async execute({ sock, msg, jid, reply, prefix, ctx, platform, react }) {
      const buffer = await extractPhotoBuffer({ msg, ctx, platform });
      if (!buffer) {
        return reply(`[!] Format salah. Kirim foto dengan caption <code>${prefix}story</code> atau balas foto untuk dijadikan video story 9:16.`);
      }

      if (typeof react === 'function') await react('👍');

      try {
        const storyVideo = await generateAestheticStoryVideo(buffer);
        await sock.sendMessage(jid, {
          video: storyVideo,
          caption: '<b>[ AESTHETIC STORY VIDEO 9:16 ]</b>\n\nVideo story sinematik vertikal siap diunggah ke WhatsApp / Instagram Story.',
        });
      } catch (err) {
        logger.error('Error saat membuat story video:', err.message);
        await reply(`[!] Gagal membuat video story: ${err.message}`);
      }
    },
  });

  // 7. Command: Contrast & Dynamic Range Booster (/contrast)
  registerCommand({
    name: 'contrast',
    aliases: ['kontras', 'hdr'],
    category: 'media',
    description: 'Tingkatkan kontras tajam & dynamic range warna foto',
    usage: '/contrast [balas foto]',
    async execute({ sock, msg, jid, reply, prefix, ctx, platform, react }) {
      const buffer = await extractPhotoBuffer({ msg, ctx, platform });
      if (!buffer) {
        return reply(`[!] Balas foto dengan <code>${prefix}contrast</code> untuk meningkatkan kontras.`);
      }

      if (typeof react === 'function') await react('👍');

      try {
        const result = await enhanceImageContrast(buffer);
        await sock.sendMessage(jid, {
          image: result,
          caption: '<b>[ DEEP CONTRAST BOOSTER ]</b>\n\nKontras dan dynamic range berhasil ditingkatkan.',
        });
      } catch (err) {
        await reply(`[!] Gagal memproses kontras: ${err.message}`);
      }
    },
  });

  // 8. Command: Aesthetic Vintage / Retro Film (/vintage)
  registerCommand({
    name: 'vintage',
    aliases: ['retro', 'film', 'analog'],
    category: 'media',
    description: 'Filter foto aesthetic nuansa film vintage & analog 90s',
    usage: '/vintage [balas foto]',
    async execute({ sock, msg, jid, reply, prefix, ctx, platform, react }) {
      const buffer = await extractPhotoBuffer({ msg, ctx, platform });
      if (!buffer) {
        return reply(`[!] Balas foto dengan <code>${prefix}vintage</code> untuk efek film retro.`);
      }

      if (typeof react === 'function') await react('👍');

      try {
        const result = await enhanceImageVintage(buffer);
        await sock.sendMessage(jid, {
          image: result,
          caption: '<b>[ AESTHETIC VINTAGE FILM ]</b>\n\nFilter warna film analog berhasil diterapkan.',
        });
      } catch (err) {
        await reply(`[!] Gagal memproses vintage: ${err.message}`);
      }
    },
  });

  // 9. Command: High-Contrast Noir B&W (/noir / /bw)
  registerCommand({
    name: 'noir',
    aliases: ['bw', 'hitamputih', 'monochrome'],
    category: 'media',
    description: 'Filter hitam-putih monokrom sinematik dengan kontras tinggi',
    usage: '/noir [balas foto]',
    async execute({ sock, msg, jid, reply, prefix, ctx, platform, react }) {
      const buffer = await extractPhotoBuffer({ msg, ctx, platform });
      if (!buffer) {
        return reply(`[!] Balas foto dengan <code>${prefix}noir</code> untuk efek hitam-putih sinematik.`);
      }

      if (typeof react === 'function') await react('👍');

      try {
        const result = await enhanceImageNoir(buffer);
        await sock.sendMessage(jid, {
          image: result,
          caption: '<b>[ CINEMATIC NOIR B&W ]</b>\n\nFilter hitam-putih kontras tinggi berhasil diterapkan.',
        });
      } catch (err) {
        await reply(`[!] Gagal memproses noir: ${err.message}`);
      }
    },
  });

  // 10. Command: HD Video Enhancer (/hdvid)
  registerCommand({
    name: 'hdvid',
    aliases: ['hdvideo', 'enhancevid'],
    category: 'media',
    description: 'Meningkatkan ketajaman, warna, dan kejernihan video MP4',
    usage: '/hdvid [kirim video / balas video]',
    async execute({ sock, msg, jid, reply, prefix, ctx, platform, react }) {
      const buffer = await extractVideoBuffer({ msg, ctx, platform });
      if (!buffer) {
        return reply(`[!] Format salah. Balas video dengan <code>${prefix}hdvid</code> untuk meningkatkan kejernihan video.`);
      }

      if (typeof react === 'function') await react('👍');

      try {
        const enhanced = await enhanceVideoHd(buffer);
        await sock.sendMessage(jid, {
          video: enhanced,
          caption: '<b>[ HD VIDEO ENHANCED ]</b>\n\nKetajaman dan kualitas visual video berhasil ditingkatkan.',
        });
      } catch (err) {
        logger.error('Error saat enhance video:', err.message);
        await reply(`[!] Gagal memproses video HD: ${err.message}`);
      }
    },
  });

  // 11. Command: Interactive Photo Filter Dashboard (/filter)
  registerCommand({
    name: 'filter',
    aliases: ['efek', 'editfoto'],
    category: 'media',
    description: 'Dashboard efek filter foto & video interaktif',
    usage: '/filter',
    async execute({ ctx, reply }) {
      if (ctx?.reply) {
        const keyboard = new InlineKeyboard()
          .text('[ 💎 HD ENHANCE ]', 'filter_info:hd')
          .text('[ 🎬 STORY 9:16 ]', 'filter_info:story')
          .row()
          .text('[ 🌗 KONTRAS TINGGI ]', 'filter_info:contrast')
          .text('[ 🎞️ VINTAGE RETRO ]', 'filter_info:vintage')
          .row()
          .text('[ 🖤 MONOKROM NOIR ]', 'filter_info:noir')
          .text('[ 📹 HD VIDEO ]', 'filter_info:hdvid');

        return await ctx.reply(
          '<b>[ DASHBOARD FILTER FOTO & VIDEO HD ]</b>\n\nKirim atau balas foto/video dengan salah satu perintah di bawah ini:\n\n• <code>/hd</code> : Tingkatkan kejernihan foto (Remini)\n• <code>/story</code> : Jadikan video story 9:16 aesthetic\n• <code>/contrast</code> : Tingkatkan kontras dynamic range\n• <code>/vintage</code> : Nuansa film analog 90s\n• <code>/noir</code> : Hitam putih sinematik\n• <code>/hdvid</code> : Pertajam kualitas video\n\nTekan tombol di bawah untuk info detail:',
          { parse_mode: 'HTML', reply_markup: keyboard }
        );
      }

      await reply('[DASHBOARD FILTER FOTO & VIDEO HD]\n\nBalas foto/video dengan perintah:\n- .hd (Pertajam resolusi)\n- .story (Buat video story 9:16)\n- .contrast (Tingkatkan kontras)\n- .vintage (Warna retro film)\n- .noir (Hitam putih sinematik)\n- .hdvid (Tingkatkan kejernihan video)');
    },
  });

  // 12. Command: Text-to-Speech (/tts)
  registerCommand({
    name: 'tts',
    aliases: ['gtts', 'suara', 'speak'],
    category: 'media',
    description: 'Mengubah teks menjadi suara Voice Note berbahasa Indonesia',
    usage: '/tts <teks> atau balas pesan dengan /tts',
    async execute({ sock, msg, jid, fullText, reply, prefix, ctx, react }) {
      let textToSpeak = fullText?.trim();
      const quoted = msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      if (!textToSpeak && quoted) {
        textToSpeak = quoted.conversation || quoted.extendedTextMessage?.text || '';
      }
      if (!textToSpeak && ctx?.message?.reply_to_message) {
        textToSpeak = ctx.message.reply_to_message.text || ctx.message.reply_to_message.caption || '';
      }

      if (!textToSpeak) {
        return reply(`[!] Masukkan teks yang ingin diubah menjadi suara.\nContoh: <code>${prefix}tts Halo selamat pagi semuanya</code>`);
      }

      if (typeof react === 'function') await react('👍');

      try {
        const audioBuffer = await generateTtsAudio(textToSpeak, 'id');
        await sock.sendMessage(jid, {
          audio: audioBuffer,
          mimetype: 'audio/mp4',
          ptt: true,
        });
      } catch (err) {
        logger.error('Error saat TTS:', err.message);
        await reply(`[!] Gagal membuat audio TTS: ${err.message}`);
      }
    },
  });

  // 13. Command: Convert Media to Audio/Voice Note (/tomp3 / /vn)
  registerCommand({
    name: 'tomp3',
    aliases: ['toaudio', 'vn'],
    category: 'media',
    description: 'Mengubah video atau audio menjadi Voice Note / MP3',
    usage: '/tomp3 [balas video atau audio]',
    async execute({ sock, msg, jid, reply, prefix, ctx, platform, react, command }) {
      const isPtt = command.toLowerCase() === 'vn';
      const videoBuffer = await extractVideoBuffer({ msg, ctx, platform });

      let sourceBuffer = videoBuffer;
      if (!sourceBuffer) {
        if (platform === 'telegram' && ctx) {
          const target = ctx.message?.reply_to_message || ctx.message;
          const aud = target?.audio || target?.voice;
          if (aud) {
            const file = await ctx.api.getFile(aud.file_id);
            const token = process.env.TELEGRAM_BOT_TOKEN;
            const res = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`);
            sourceBuffer = Buffer.from(await res.arrayBuffer());
          }
        } else {
          const quoted = msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
          if (quoted?.audioMessage) {
            const fakeMsg = { key: { id: msg?.message?.extendedTextMessage?.contextInfo?.stanzaId }, message: quoted };
            sourceBuffer = await downloadMediaMessage(fakeMsg, 'buffer', {});
          }
        }
      }

      if (!sourceBuffer) {
        return reply(`[!] Balas (*reply*) video atau rekaman audio dengan <code>${prefix}tomp3</code> atau <code>${prefix}vn</code>.`);
      }

      if (typeof react === 'function') await react('👍');

      try {
        const converted = await convertMediaToAudio(sourceBuffer, isPtt);
        await sock.sendMessage(jid, {
          audio: converted,
          mimetype: isPtt ? 'audio/ogg; codecs=opus' : 'audio/mp4',
          ptt: isPtt,
        });
      } catch (err) {
        logger.error('Error saat konversi audio:', err.message);
        await reply(`[!] Gagal mengonversi ke audio: ${err.message}`);
      }
    },
  });

  // 14. Command: Media to URL (/tourl)
  registerCommand({
    name: 'tourl',
    aliases: ['upload', 'url'],
    category: 'media',
    description: 'Mengunggah foto, video, audio, atau stiker ke CDN publik untuk mendapatkan link langsung',
    usage: '/tourl [balas media]',
    async execute({ msg, reply, prefix, ctx, platform, react }) {
      const media = await extractAnyMediaBuffer({ msg, ctx, platform });
      if (!media) {
        return reply(`[!] Balas foto, video, audio, atau stiker dengan <code>${prefix}tourl</code> untuk mendapatkan link publik.`);
      }

      if (typeof react === 'function') await react('👍');

      try {
        const fileName = `nexbot_${Date.now()}.${media.ext}`;
        const uploaded = await uploadToTmpfiles(media.buffer, fileName);

        const sizeKb = (media.buffer.length / 1024).toFixed(1);
        let resp = `<b>[ 🌐 MEDIA URL GENERATOR ]</b>\n\n`;
        resp += `• <b>Direct Link:</b> ${uploaded.directUrl}\n`;
        resp += `• <b>Halaman Unduh:</b> ${uploaded.pageUrl}\n`;
        resp += `• <b>Format:</b> ${media.ext.toUpperCase()} (${sizeKb} KB)\n`;
        resp += `• <b>Masa Aktif:</b> Siap diakses & diunduh siapa saja`;

        await reply(resp);
      } catch (err) {
        logger.error('Error saat upload tourl:', err.message);
        await reply(`[!] Gagal mengunggah media: ${err.message}`);
      }
    },
  });

  // 15. Command: Sticker Meme Generator (/smeme)
  registerCommand({
    name: 'smeme',
    aliases: ['stickermeme', 'memesticker'],
    category: 'media',
    description: 'Membuat stiker meme dengan teks atas dan bawah dari foto',
    usage: '/smeme teks atas | teks bawah [balas foto / kirim foto]',
    async execute({ sock, msg, jid, fullText, reply, prefix, ctx, platform, react }) {
      const photoBuffer = await extractPhotoBuffer({ msg, ctx, platform });
      if (!photoBuffer) {
        return reply(`[!] Format salah. Balas foto atau kirim foto dengan caption:\n<code>${prefix}smeme teks atas | teks bawah</code>`);
      }

      const rawText = fullText?.trim() || '';
      const [topText = '', bottomText = ''] = rawText.includes('|')
        ? rawText.split('|').map((s) => s.trim())
        : [rawText, ''];

      if (!topText && !bottomText) {
        return reply(`[!] Masukkan teks meme. Pisahkan teks atas dan bawah dengan tanda <code>|</code>.\nContoh: <code>${prefix}smeme bangun tidur | langsung ngoding</code>`);
      }

      if (typeof react === 'function') await react('👍');

      try {
        const memeWebp = await generateMemeSticker(photoBuffer, topText, bottomText);
        await sock.sendMessage(jid, {
          sticker: memeWebp,
        });
      } catch (err) {
        logger.error('Error saat generate smeme:', err.message);
        await reply(`[!] Gagal membuat stiker meme: ${err.message}`);
      }
    },
  });

  // 16. Command: Brat Sticker Generator (/brat)
  registerCommand({
    name: 'brat',
    aliases: ['bratwa', 'stikerbrat', 'bratgenerator'],
    category: 'media',
    description: 'Membuat stiker kata-kata teks estetik latar belakang putih ala Brat',
    usage: '/brat <kata-kata> atau balas pesan orang lain dengan /brat',
    async execute({ sock, msg, jid, fullText, reply, prefix, ctx, react }) {
      let text = fullText?.trim();

      // Cek balas pesan di WhatsApp
      const quoted = msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      if (!text && quoted) {
        text = quoted.conversation || quoted.extendedTextMessage?.text || '';
      }

      // Cek balas pesan di Telegram
      if (!text && ctx?.message?.reply_to_message) {
        text = ctx.message.reply_to_message.text || ctx.message.reply_to_message.caption || '';
      }

      if (!text) {
        return reply(`[!] Masukkan kata-kata untuk stiker Brat.\nContoh: <code>${prefix}brat kamu nanya</code>\natau balas pesan seseorang dengan <code>${prefix}brat</code>.`);
      }

      try {
        const bratWebp = await generateBratSticker(text);
        await sock.sendMessage(jid, {
          sticker: bratWebp,
        });
      } catch (err) {
        logger.error('Error saat membuat stiker brat:', err.message);
        await reply(`[!] Gagal membuat stiker Brat: ${err.message}`);
      }
    },
  });

  // 17. Command: Brat Video / Animated Sticker Generator (/bratvid)
  registerCommand({
    name: 'bratvid',
    aliases: ['bratvideo', 'bratgif', 'bratv', 'vbrat'],
    category: 'media',
    description: 'Membuat stiker video animasi bergerak teks atau lirik lagu ala Brat',
    usage: '/bratvid <teks atau lirik lagu> atau balas pesan dengan /bratvid',
    async execute({ sock, msg, jid, fullText, reply, prefix, ctx }) {
      let text = fullText?.trim();

      // Cek balas pesan di WhatsApp
      const quoted = msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      if (!text && quoted) {
        text = quoted.conversation || quoted.extendedTextMessage?.text || '';
      }

      // Cek balas pesan di Telegram
      if (!text && ctx?.message?.reply_to_message) {
        text = ctx.message.reply_to_message.text || ctx.message.reply_to_message.caption || '';
      }

      if (!text) {
        return reply(`[!] Masukkan teks atau lirik lagu untuk stiker video Brat.\nContoh: <code>${prefix}bratvid kamu nanya tapi kamu ga dengerin</code>\natau balas pesan seseorang dengan <code>${prefix}bratvid</code>.`);
      }

      try {
        const animWebp = await generateBratVideoSticker(text);
        await sock.sendMessage(jid, {
          sticker: animWebp,
        });
      } catch (err) {
        logger.error('Error saat membuat stiker brat video:', err.message);
        await reply(`[!] Gagal membuat stiker Brat Video: ${err.message}`);
      }
    },
  });

  // 18. Command: Brat Video MP4 Generator (/bratmp4 / .bratmp4)
  registerCommand({
    name: 'bratmp4',
    aliases: ['bratsong', 'bratlyric', 'bratmusic', 'vbratmp4', 'bratvmp4', 'bratfull', 'bratmp4full'],
    category: 'media',
    description: 'Membuat video MP4 lirik lagu sinkron audio atau teks animasi ala Brat',
    usage: '/bratmp4 <judul lagu -song | teks kustom | balas audio>',
    async execute({ sock, msg, jid, fullText, reply, prefix, ctx, platform, command }) {
      let text = fullText?.trim() || '';

      // Cek balas audio atau voice note
      const quotedAudio = await extractAudioBuffer({ msg, ctx, platform });

      // Cek balas teks jika text kosong
      const quotedText = msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      if (!text && quotedText && !quotedAudio) {
        text = quotedText.conversation || quotedText.extendedTextMessage?.text || '';
      }
      if (!text && ctx?.message?.reply_to_message && !quotedAudio) {
        text = ctx.message.reply_to_message.text || ctx.message.reply_to_message.caption || '';
      }

      const isSongCommand = command.toLowerCase() === 'bratsong' || command.toLowerCase() === 'bratlyric' || command.toLowerCase() === 'bratmusic';
      const hasSongFlag = /-song\b|-lagu\b/i.test(text);
      const isExplicitText = /-text\b|-teks\b/i.test(text);

      const isIntro = /-intro\b|-awal\b|-depan\b/i.test(text);
      const isFull = /-full\b|-lengkap\b|-semua\b|\bfull lirik\b|\blirik full\b/i.test(text) ||
        command.toLowerCase() === 'bratfull' || command.toLowerCase() === 'bratmp4full';
      const isReff = /-reff\b|-chorus\b|-ref\b/i.test(text);
      const isRap = /-rap\b/i.test(text);
      const isLineMode = /-line\b|-solid\b/i.test(text);

      let fromTime = null;
      const fromMatch = /-(?:from|start|mulai)[:\s]+([0-9:]+)/i.exec(text);
      if (fromMatch) {
        fromTime = parseTimeSeconds(fromMatch[1]);
      }

      let lyricSearch = '';
      const lirikMatch = /(?:lirik:|-lirik\s+)(["']?)(.+?)\1(?:\s+-[a-z0-9]+|\s*$)/i.exec(text);
      if (lirikMatch) {
        lyricSearch = lirikMatch[2].trim();
      }

      let syncOffset = 0.20;
      let isCustomOffset = false;
      const offsetMatch = /-(?:offset|delay|lead)[:\s]+([-0-9.]+)/i.exec(text);
      if (offsetMatch) {
        const parsedOffset = parseFloat(offsetMatch[1]);
        if (!isNaN(parsedOffset)) {
          syncOffset = parsedOffset;
          isCustomOffset = true;
        }
      }

      let theme = '';
      if (/-green\b/i.test(text)) theme = '-green';
      else if (/-black\b/i.test(text)) theme = '-black';
      else if (/-white\b/i.test(text)) theme = '-white';

      const cleanedText = text
        .replace(/-(?:from|start|mulai)[:\s]+[0-9:]+/gi, '')
        .replace(/-(?:offset|delay|lead)[:\s]+[-0-9.]+/gi, '')
        .replace(/(?:lirik:|-lirik\s+)(["']?).+?\1(?:\s+-[a-z0-9]+|\s*$)/gi, '')
        .replace(/-song\b/gi, '')
        .replace(/-lagu\b/gi, '')
        .replace(/-text\b|-teks\b/gi, '')
        .replace(/-full\b|-lengkap\b|-semua\b/gi, '')
        .replace(/\bfull lirik\b|\blirik full\b/gi, '')
        .replace(/-intro\b|-awal\b|-depan\b/gi, '')
        .replace(/-reff\b|-chorus\b|-ref\b/gi, '')
        .replace(/-rap\b/gi, '')
        .replace(/-line\b|-solid\b/gi, '')
        .replace(/-type\b|-typing\b/gi, '')
        .replace(/-green\b/gi, '')
        .replace(/-black\b/gi, '')
        .replace(/-white\b/gi, '')
        .trim();

      const hasSongSectionFlag = isFull || isReff || isRap || isIntro || fromTime !== null || !!lyricSearch;
      let isSongMode = (isSongCommand || hasSongFlag || hasSongSectionFlag) && !isExplicitText;

      if (!cleanedText && !quotedAudio) {
        return reply(
          `[!] Format penggunaan Brat Video MP4:\n\n` +
          `1. Sinkron Lirik Lagu (Default Otomatis Bagian Reff/Viral/Rap, Kata per Kata Smooth):\n` +
          `<code>${prefix}bratmp4 Fix You Coldplay</code> atau <code>${prefix}bratmp4 The Cure Boys Don't Cry -green</code>\n\n` +
          `2. Request Bagian Lagu:\n` +
          `• Full Lirik Lagu: <code>${prefix}bratmp4 Judul Lagu -full</code> atau <code>${prefix}bratfull Judul Lagu</code>\n` +
          `• Reff/Chorus: <code>${prefix}bratmp4 Laskar Pelangi -reff</code>\n` +
          `• Bagian Rap: <code>${prefix}bratmp4 Eminem Godzilla -rap</code>\n` +
          `• Dari awal mula/intro: <code>${prefix}bratmp4 Judul Lagu -intro</code>\n` +
          `• Menit tertentu: <code>${prefix}bratmp4 Judul Lagu -from 01:25</code>\n` +
          `• Teks baris utuh: <code>${prefix}bratmp4 Judul Lagu -line</code>\n` +
          `• Penyesuaian delay: <code>${prefix}bratmp4 Judul Lagu -offset -0.5</code>\n\n` +
          `3. Balas Audio/Voice Note:\n` +
          `Balas pesan audio dengan <code>${prefix}bratmp4 baris satu / baris dua</code>\n\n` +
          `4. Video Teks Kustom:\n` +
          `<code>${prefix}bratmp4 -text kamu nanya tapi kamu ga dengerin</code>`
        );
      }

      try {
        if (!isSongMode && !isExplicitText && !quotedAudio && cleanedText) {
          try {
            const detectedLyrics = await fetchSongLyricsWithSync(cleanedText);
            if (detectedLyrics?.syncedLyrics) {
              isSongMode = true;
            }
          } catch {}
        }

        if (isSongMode) {
          await reply(`[!] Sedang mencari lagu dan menyinkronkan lirik untuk "${cleanedText}"...`);
          const result = await generateBratVideoMp4({
            songQuery: cleanedText,
            theme,
            isFull,
            isReff,
            isRap,
            isIntro,
            preferViral: !isIntro && !isFull && !isReff && !isRap && fromTime === null && !lyricSearch,
            fromTime,
            lyricSearch,
            isLineMode,
            syncOffset,
            isCustomOffset,
          });

          const syncTypeLabel = result.hasWordSync ? 'Suku Kata (Apple Music)' : 'Baris Tersinkronisasi';
          const caption =
            `*[ BRAT LYRIC VIDEO ]*\n\n` +
            `Judul: *${result.trackName}*\n` +
            `Artis: *${result.artistName}*\n` +
            `Bagian: *${result.partLabel}*\n` +
            `Durasi: *${result.duration.toFixed(1)} detik*\n` +
            `Sinkronisasi: *${syncTypeLabel}*\n\n` +
            `Lirik tersinkronisasi otomatis dengan audio lagu.`;

          await sock.sendMessage(jid, {
            video: result.buffer,
            caption,
            mimetype: 'video/mp4',
          });
        } else if (quotedAudio) {
          const result = await generateBratVideoMp4({
            text: cleanedText || 'brat audio',
            audioBuffer: quotedAudio,
            theme,
          });

          await sock.sendMessage(jid, {
            video: result.buffer,
            caption: `*[ BRAT AUDIO VIDEO ]*\n\nVideo sinkronisasi audio berhasil dibuat (${result.duration.toFixed(1)}s).`,
            mimetype: 'video/mp4',
          });
        } else {
          const result = await generateBratVideoMp4({
            text: cleanedText,
            theme,
          });

          await sock.sendMessage(jid, {
            video: result.buffer,
            caption: `*[ BRAT MP4 VIDEO ]*\n\n"${cleanedText}"`,
            mimetype: 'video/mp4',
          });
        }
      } catch (err) {
        logger.error('Error saat membuat brat mp4:', err.message);
        await reply(`[!] Gagal membuat video Brat MP4: ${err.message}`);
      }
    },
  });
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseTtfAdvanceWidths(fontBuffer) {
  try {
    const numTables = fontBuffer.readUInt16BE(4);
    const tables = {};
    for (let i = 0; i < numTables; i++) {
      const offset = 12 + i * 16;
      const tag = fontBuffer.toString('ascii', offset, offset + 4);
      tables[tag] = {
        offset: fontBuffer.readUInt32BE(offset + 8),
        length: fontBuffer.readUInt32BE(offset + 12),
      };
    }

    if (!tables.head || !tables.hhea || !tables.cmap || !tables.hmtx) {
      return null;
    }

    const headOffset = tables.head.offset;
    const unitsPerEm = fontBuffer.readUInt16BE(headOffset + 18);

    const hheaOffset = tables.hhea.offset;
    const numberOfHMetrics = fontBuffer.readUInt16BE(hheaOffset + 34);

    const cmapOffset = tables.cmap.offset;
    const numSubtables = fontBuffer.readUInt16BE(cmapOffset + 2);
    let subtableOffset = 0;
    for (let i = 0; i < numSubtables; i++) {
      const platformId = fontBuffer.readUInt16BE(cmapOffset + 4 + i * 8);
      const encodingId = fontBuffer.readUInt16BE(cmapOffset + 6 + i * 8);
      const offset = fontBuffer.readUInt32BE(cmapOffset + 8 + i * 8);
      if (platformId === 0 || (platformId === 3 && encodingId === 1)) {
        subtableOffset = cmapOffset + offset;
        break;
      }
    }

    if (!subtableOffset) return null;

    const format = fontBuffer.readUInt16BE(subtableOffset);
    const charToGlyph = {};
    if (format === 4) {
      const segCountX2 = fontBuffer.readUInt16BE(subtableOffset + 6);
      const segCount = segCountX2 / 2;
      const endCodeOffset = subtableOffset + 14;
      const startCodeOffset = endCodeOffset + segCountX2 + 2;
      const idDeltaOffset = startCodeOffset + segCountX2;
      const idRangeOffsetOffset = idDeltaOffset + segCountX2;

      for (let i = 0; i < segCount; i++) {
        const endCode = fontBuffer.readUInt16BE(endCodeOffset + i * 2);
        const startCode = fontBuffer.readUInt16BE(startCodeOffset + i * 2);
        const idDelta = fontBuffer.readInt16BE(idDeltaOffset + i * 2);
        const idRangeOffset = fontBuffer.readUInt16BE(idRangeOffsetOffset + i * 2);

        for (let c = startCode; c <= endCode; c++) {
          if (c === 0xFFFF) break;
          let glyphId = 0;
          if (idRangeOffset === 0) {
            glyphId = (c + idDelta) & 0xFFFF;
          } else {
            const glyphIndexOffset = idRangeOffsetOffset + i * 2 + idRangeOffset + (c - startCode) * 2;
            glyphId = fontBuffer.readUInt16BE(glyphIndexOffset);
            if (glyphId !== 0) glyphId = (glyphId + idDelta) & 0xFFFF;
          }
          charToGlyph[String.fromCharCode(c)] = glyphId;
        }
      }
    }

    const hmtxOffset = tables.hmtx.offset;
    const glyphWidths = [];
    for (let i = 0; i < numberOfHMetrics; i++) {
      glyphWidths.push(fontBuffer.readUInt16BE(hmtxOffset + i * 4));
    }

    return function measure(str, fontSize) {
      let totalUnits = 0;
      for (const char of str) {
        const gid = charToGlyph[char] || 0;
        const adv = (gid < numberOfHMetrics) ? glyphWidths[gid] : glyphWidths[numberOfHMetrics - 1];
        totalUnits += adv;
      }
      return (totalUnits / unitsPerEm) * fontSize;
    };
  } catch {
    return null;
  }
}

let cachedMeasure = null;
function getFontMeasure() {
  if (cachedMeasure) return cachedMeasure;
  try {
    const fontPath = path.resolve(__dirname, '../../assets/fonts/ArialNarrow.ttf');
    if (fs.existsSync(fontPath)) {
      const buf = fs.readFileSync(fontPath);
      cachedMeasure = parseTtfAdvanceWidths(buf);
    }
  } catch {}

  if (!cachedMeasure) {
    cachedMeasure = (str, fontSize) => str.length * (fontSize * 0.45);
  }
  return cachedMeasure;
}

function ensureSystemFontInstalled() {
  try {
    const userFontDir = path.join(os.homedir(), '.local', 'share', 'fonts');
    const targetFont = path.join(userFontDir, 'ArialNarrow.ttf');
    const sourceFont = path.resolve(__dirname, '../../assets/fonts/ArialNarrow.ttf');
    if (fs.existsSync(sourceFont) && !fs.existsSync(targetFont)) {
      fs.mkdirSync(userFontDir, { recursive: true });
      fs.copyFileSync(sourceFont, targetFont);
      try {
        execSync(`fc-cache -f "${userFontDir}"`, { stdio: 'ignore', timeout: 5000 });
      } catch {}
    }
  } catch {}
}

function escapeXml(s) {
  return String(s || '')
    .replace(/\0/g, ' ')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function sanitizeLrcMeta(str) {
  if (!str || typeof str !== 'string') return '';
  const parts = str
    .split(/\0+/)
    .map((s) => s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').trim())
    .filter(Boolean);
  return [...new Set(parts)].join(', ');
}

export function computeBratLayout(text) {
  ensureSystemFontInstalled();
  const measure = getFontMeasure();

  let raw = String(text || '').replace(/\0/g, ' ').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').trim();
  let bg = '#ffffff';
  let textColor = '#000000';

  if (/-green\b/i.test(raw)) {
    bg = '#8ace00';
    raw = raw.replace(/-green\b/gi, '').trim();
  } else if (/-black\b/i.test(raw)) {
    bg = '#000000';
    textColor = '#ffffff';
    raw = raw.replace(/-black\b/gi, '').trim();
  } else if (/-white\b/i.test(raw)) {
    bg = '#ffffff';
    raw = raw.replace(/-white\b/gi, '').trim();
  }

  const cleanText = raw.toLowerCase().trim() || 'brat';
  const canvasSize = 512;
  const contentWidth = 370;
  const maxHeight = 430;
  const startX = (canvasSize - contentWidth) / 2;

  const paragraphs = cleanText.split(/\r?\n/).map((p) => p.trim()).filter(Boolean);
  const words = cleanText.split(/\s+/).filter(Boolean);

  let layout;
  if (words.length <= 1) {
    let fs = 125;
    while (fs > 30 && measure(words[0] || 'brat', fs) > contentWidth) {
      fs -= 2;
    }
    layout = { fontSize: fs, lines: [words] };
  } else {
    let best = null;
    for (let fs = 74; fs >= 22; fs -= 2) {
      const lines = [];
      let overflow = false;

      for (const p of paragraphs) {
        const pWords = p.split(/\s+/).filter(Boolean);
        let cur = [];
        for (const w of pWords) {
          if (measure(w, fs) > contentWidth) {
            overflow = true;
            break;
          }
          const testLine = [...cur, w].join(' ');
          if (cur.length > 0 && measure(testLine, fs) > contentWidth) {
            lines.push(cur);
            cur = [w];
          } else {
            cur.push(w);
          }
        }
        if (overflow) break;
        if (cur.length > 0) lines.push(cur);
      }

      if (overflow) continue;

      const lineHeight = fs * 0.98;
      const totalHeight = lines.length * lineHeight;
      if (totalHeight > maxHeight) continue;

      const singleWordLines = lines.filter((l) => l.length === 1).length;
      const score = fs * 10 - (singleWordLines * 45) - (lines.length * 5);

      if (!best || score > best.score) {
        best = { fontSize: fs, lines, score };
      }
    }

    layout = best || { fontSize: 32, lines: [words] };
  }

  const { fontSize, lines } = layout;
  const lineHeight = fontSize * 0.98;
  const totalBlockHeight = lines.length * lineHeight;
  const startY = (canvasSize - totalBlockHeight) / 2 + (fontSize * 0.82);

  const positionedWords = [];
  let globalWordIdx = 0;

  lines.forEach((lineWords, lineIdx) => {
    const y = startY + (lineIdx * lineHeight);
    if (lineWords.length === 1) {
      positionedWords.push({
        word: lineWords[0],
        x: (canvasSize / 2).toFixed(2),
        y: y.toFixed(2),
        anchor: 'middle',
        globalIdx: globalWordIdx++,
      });
    } else {
      const wordWidths = lineWords.map((w) => measure(w, fontSize));
      const totalWordW = wordWidths.reduce((a, b) => a + b, 0);
      const totalGap = contentWidth - totalWordW;
      const gap = totalGap > 0 ? (totalGap / (lineWords.length - 1)) : measure(' ', fontSize);

      let curX = startX;
      lineWords.forEach((w, wIdx) => {
        positionedWords.push({
          word: w,
          x: curX.toFixed(2),
          y: y.toFixed(2),
          anchor: 'start',
          globalIdx: globalWordIdx++,
        });
        curX += wordWidths[wIdx] + gap;
      });
    }
  });

  return {
    bg,
    textColor,
    canvasSize,
    contentWidth,
    fontSize,
    lines,
    positionedWords,
    rawText: raw,
  };
}

export async function generateBratSticker(text) {
  const layout = computeBratLayout(text);

  const textElements = layout.positionedWords.map((pw) =>
    `<text x="${pw.x}" y="${pw.y}" text-anchor="${pw.anchor}" font-family="Arial Narrow, Arial, Liberation Sans Narrow, sans-serif" font-size="${layout.fontSize}px" fill="${layout.textColor}" filter="url(#bratBlur)">${escapeXml(pw.word)}</text>`
  );

  const svg = `
    <svg width="${layout.canvasSize}" height="${layout.canvasSize}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="bratBlur" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="0.9" />
        </filter>
      </defs>
      <rect width="100%" height="100%" fill="${layout.bg}" />
      ${textElements.join('\n      ')}
    </svg>
  `;

  const rawWebp = await sharp(Buffer.from(svg))
    .webp({ quality: 95 })
    .toBuffer();
  return await addStickerExif(rawWebp, { pack: 'NexusBot', author: 'nexusbot' });
}

export async function generateBratVideoSticker(text) {
  const layout = computeBratLayout(text);
  const numSteps = layout.positionedWords.length;

  if (numSteps <= 1) {
    return await generateBratSticker(text);
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nex_bratvid_'));
  const frameFiles = [];

  try {
    for (let step = 1; step <= numSteps; step++) {
      const visibleWords = layout.positionedWords.slice(0, step);
      const textElements = visibleWords.map((pw) =>
        `<text x="${pw.x}" y="${pw.y}" text-anchor="${pw.anchor}" font-family="Arial Narrow, Arial, Liberation Sans Narrow, sans-serif" font-size="${layout.fontSize}px" fill="${layout.textColor}" filter="url(#bratBlur)">${escapeXml(pw.word)}</text>`
      );

      const svg = `
        <svg width="${layout.canvasSize}" height="${layout.canvasSize}" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <filter id="bratBlur" x="-10%" y="-10%" width="120%" height="120%">
              <feGaussianBlur stdDeviation="0.9" />
            </filter>
          </defs>
          <rect width="100%" height="100%" fill="${layout.bg}" />
          ${textElements.join('\n          ')}
        </svg>
      `;

      const framePath = path.join(tmpDir, `frame_${String(step).padStart(3, '0')}.png`);
      await sharp(Buffer.from(svg)).png().toFile(framePath);
      frameFiles.push(framePath);
    }

    const typeDuration = Math.min(3.2, Math.max(1.2, numSteps * 0.22));
    const stepDuration = Math.max(0.12, typeDuration / numSteps).toFixed(3);
    const holdDuration = 1.6;

    const concatLines = [];
    frameFiles.forEach((f, idx) => {
      concatLines.push(`file '${f}'`);
      if (idx === frameFiles.length - 1) {
        concatLines.push(`duration ${holdDuration}`);
      } else {
        concatLines.push(`duration ${stepDuration}`);
      }
    });
    concatLines.push(`file '${frameFiles[frameFiles.length - 1]}'`);

    const listPath = path.join(tmpDir, 'list.txt');
    fs.writeFileSync(listPath, concatLines.join('\n'));

    const outWebp = path.join(tmpDir, 'anim.webp');
    execSync(`ffmpeg -y -f concat -safe 0 -i "${listPath}" -vcodec libwebp -filter:v "scale=512:512,fps=10" -loop 0 -an "${outWebp}"`, {
      timeout: 30000,
    });

    const animBuffer = fs.readFileSync(outWebp);
    return await addStickerExif(animBuffer, { pack: 'NexusBot', author: 'nexusbot' });
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }
}

function renderBratSvg(layout, visibleWords, activeIndex = -1, activeOpacity = 1.0, activeDy = 0) {
  const textElements = visibleWords.map((pw, idx) => {
    const isNewest = idx === activeIndex;
    const op = isNewest ? activeOpacity : 1.0;
    const dy = isNewest ? activeDy : 0;
    const yPos = parseFloat(pw.y) + dy;
    return `<text x="${pw.x}" y="${yPos.toFixed(2)}" text-anchor="${pw.anchor}" font-family="Arial Narrow, Arial, Liberation Sans Narrow, sans-serif" font-size="${layout.fontSize}px" fill="${layout.textColor}" opacity="${op.toFixed(2)}" filter="url(#bratBlur)">${escapeXml(pw.word)}</text>`;
  });

  return `
    <svg width="${layout.canvasSize}" height="${layout.canvasSize}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="bratBlur" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="0.9" />
        </filter>
      </defs>
      <rect width="100%" height="100%" fill="${layout.bg}" />
      ${textElements.join('\n      ')}
    </svg>
  `;
}

export function estimateWordWeight(word, isLast = false) {
  if (!word || typeof word !== 'string') return 1.0;
  const clean = word.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!clean) return 1.0;

  // Hitung jumlah kluster vokal (aproksimasi suku kata vokal lagu)
  const vowelMatches = clean.match(/[aeiouy]+/g);
  const syllables = vowelMatches ? vowelMatches.length : 1;

  // Bobot dasar suku kata (suku kata lebih banyak = durasi nada vokal lebih panjang)
  let weight = 1.0 + (syllables - 1) * 0.55;

  // Kata yang panjang butuh artikulasi artikulatoris lebih lama
  if (clean.length > 5) weight += 0.25;

  // Tanda baca (koma, titik, tanda tanya, seru, dash) menandakan nada ditahan / jeda frase
  if (/[,.\-!?;:~]$/.test(word.trim())) {
    weight += 0.5;
  }

  // Kata tugas / preposisi pendek biasanya nada lewat (passing note) yang cepat
  const passingWords = new Set([
    'a', 'an', 'the', 'to', 'in', 'on', 'at', 'of', 'and', 'or', 'is', 'it', 'my',
    'dan', 'di', 'ke', 'yg', 'yang', 'si', 'se', 'ini', 'itu', 'tak', 'kan',
  ]);
  if (passingWords.has(clean) && !isLast) {
    weight = Math.max(0.75, weight * 0.75);
  }

  // Kata terakhir di akhir baris hampir selalu nada panjang / sustain melodi
  if (isLast) {
    weight += 0.65;
  }

  return weight;
}

export function getAudioDuration(audioPath) {
  try {
    const out = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`, {
      encoding: 'utf-8',
      timeout: 5000,
    });
    const dur = parseFloat(out.trim());
    return !isNaN(dur) && dur > 0 ? dur : 5.0;
  } catch {
    return 5.0;
  }
}

export function groupSyllablesToWords(syllabus) {
  if (!Array.isArray(syllabus) || syllabus.length === 0) return [];
  const words = [];
  let curWord = '';
  let curStart = null;
  let curDuration = 0;

  for (let i = 0; i < syllabus.length; i++) {
    const s = syllabus[i];
    if (curStart === null) curStart = s.time;
    curWord += s.text;
    curDuration += s.duration || 0;

    if (s.text.endsWith(' ') || s.text.endsWith('\t') || i === syllabus.length - 1) {
      const cleanWord = curWord.trim();
      if (cleanWord) {
        words.push({
          word: cleanWord,
          time: curStart / 1000,
          duration: curDuration / 1000,
        });
      }
      curWord = '';
      curStart = null;
      curDuration = 0;
    }
  }

  return words;
}

export async function fetchLyricsPlus(title, artist = '') {
  const cleanTitle = (title || '').trim();
  if (!cleanTitle) return null;

  const mirrors = [
    'https://lyricsplus.binimum.org',
    'https://lyricsplus.prjktla.my.id',
    'https://lyricsplus.atomix.one',
  ];

  const queries = [];
  queries.push({ title: cleanTitle, artist: (artist || '').trim() });
  if (artist && cleanTitle.includes(artist)) {
    queries.push({ title: cleanTitle.replace(artist, '').replace(/[-–]/g, '').trim(), artist: artist.trim() });
  }

  for (const q of queries) {
    if (!q.title) continue;
    const promises = mirrors.map(async (m) => {
      const url = `${m}/v2/lyrics/get?title=${encodeURIComponent(q.title)}${q.artist ? `&artist=${encodeURIComponent(q.artist)}` : ''}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(3500) });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = await res.json();
      if (!data?.lyrics || !Array.isArray(data.lyrics) || data.lyrics.length === 0) {
        throw new Error('no lyrics');
      }
      return data;
    });

    try {
      const result = await Promise.any(promises);
      const hasWordSync = result.lyrics.some((l) => Array.isArray(l.syllabus) && l.syllabus.length > 0);
      return {
        type: result.type,
        hasWordSync,
        metadata: result.metadata,
        lyrics: result.lyrics,
      };
    } catch {}
  }

  return null;
}

export async function fetchSongLyricsWithSync(query) {
  const clean = sanitizeLrcMeta(query);
  if (!clean) return null;

  let canonicalTrack = clean;
  let canonicalArtist = '';
  let canonicalDuration = 0;

  // 1. Coba cari metadata lagu di iTunes untuk dapatkan judul resmi dan artis resmi
  try {
    const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(clean)}&entity=song&limit=3`;
    const itunesRes = await fetch(itunesUrl, { signal: AbortSignal.timeout(5000) });
    if (itunesRes.ok) {
      const itunesData = await itunesRes.json();
      if (itunesData.results && itunesData.results.length > 0) {
        let bestItem = itunesData.results[0];
        const qLower = clean.toLowerCase();
        for (const item of itunesData.results) {
          if (item.trackName?.toLowerCase() === qLower) {
            bestItem = item;
            break;
          }
        }
        canonicalTrack = sanitizeLrcMeta(bestItem.trackName) || clean;
        canonicalArtist = sanitizeLrcMeta(bestItem.artistName);
        canonicalDuration = (bestItem.trackTimeMillis || 0) / 1000;
      }
    }
  } catch {}

  const baseTrack = canonicalTrack.replace(/\(.*?\)|\[.*?\]/g, '').trim();
  const baseArtist = canonicalArtist.split(/[,&]/)[0].trim();

  // 2. Coba cari word-by-word synced lyrics dari LyricsPlus (Apple Music/Spotify official sync)
  try {
    const plusData = await fetchLyricsPlus(baseTrack, baseArtist);
    if (plusData && plusData.hasWordSync) {
      const wordSegments = plusData.lyrics
        .map((l) => {
          const rawText = (l.text || '').replace(/\0/g, ' ').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').trim();
          return {
            time: l.time / 1000,
            duration: (l.duration || 0) / 1000,
            text: rawText,
            words: groupSyllablesToWords(l.syllabus),
          };
        })
        .filter((s) => s.text && s.text.length > 0 && !/^\[.*?\]$/.test(s.text));

      if (wordSegments.length > 0) {
        return {
          trackName: canonicalTrack,
          artistName: canonicalArtist || 'Unknown Artist',
          albumName: plusData.metadata?.album || '',
          duration: canonicalDuration || (plusData.metadata?.duration_ms ? plusData.metadata.duration_ms / 1000 : 0),
          hasWordSync: true,
          wordSegments,
          syncedLyrics: wordSegments.map((s) => {
            const m = Math.floor(s.time / 60);
            const sec = (s.time % 60).toFixed(2);
            return `[${String(m).padStart(2, '0')}:${String(sec).padStart(5, '0')}] ${s.text}`;
          }).join('\n'),
          plainLyrics: wordSegments.map((s) => s.text).join('\n'),
        };
      }
    }
  } catch {}

  let items = [];

  // 3. Fallback: Cari di LRCLIB dengan track dan artist teridentifikasi
  if (baseArtist) {
    try {
      const u1 = `https://lrclib.net/api/search?track_name=${encodeURIComponent(baseTrack)}&artist_name=${encodeURIComponent(baseArtist)}`;
      const r = await fetch(u1, {
        headers: { 'User-Agent': 'NexBot/1.0 (Mozilla/5.0)' },
        signal: AbortSignal.timeout(8000),
      });
      if (r.ok) items = await r.json();
    } catch {}
  }

  if (!items || items.length === 0) {
    try {
      const u2 = `https://lrclib.net/api/search?track_name=${encodeURIComponent(baseTrack)}`;
      const r = await fetch(u2, {
        headers: { 'User-Agent': 'NexBot/1.0 (Mozilla/5.0)' },
        signal: AbortSignal.timeout(8000),
      });
      if (r.ok) items = await r.json();
    } catch {}
  }

  if (!items || items.length === 0) {
    try {
      const u3 = `https://lrclib.net/api/search?q=${encodeURIComponent(clean)}`;
      const r = await fetch(u3, {
        headers: { 'User-Agent': 'NexBot/1.0 (Mozilla/5.0)' },
        signal: AbortSignal.timeout(8000),
      });
      if (r.ok) items = await r.json();
    } catch {}
  }

  if (!Array.isArray(items) || items.length === 0) return null;

  items.forEach((item) => {
    item.trackName = sanitizeLrcMeta(item.trackName);
    item.artistName = sanitizeLrcMeta(item.artistName);
    item.albumName = sanitizeLrcMeta(item.albumName);
    if (typeof item.syncedLyrics === 'string') {
      item.syncedLyrics = item.syncedLyrics.replace(/\0/g, ' ').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
    }
    if (typeof item.plainLyrics === 'string') {
      item.plainLyrics = item.plainLyrics.replace(/\0/g, ' ').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
    }
  });

  // 3. Beri skor pada kandidat lirik agar tidak salah ambil cover/remix/artis lain
  const scored = items.map((item) => {
    let score = 0;
    if (item.syncedLyrics) score += 60;
    else if (item.plainLyrics) score += 20;

    if (canonicalDuration > 0 && item.duration) {
      const diff = Math.abs(item.duration - canonicalDuration);
      if (diff < 4) score += 40;
      else if (diff < 12) score += 20;
    }

    const itemArtist = (item.artistName || '').toLowerCase();
    if (baseArtist && itemArtist.includes(baseArtist.toLowerCase())) score += 30;

    const itemTrack = (item.trackName || '').toLowerCase();
    if (itemTrack.includes(baseTrack.toLowerCase()) || baseTrack.toLowerCase().includes(itemTrack)) score += 20;

    return { item, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const match = scored[0].item;

  return {
    trackName: match.trackName || canonicalTrack,
    artistName: match.artistName || canonicalArtist || 'Unknown Artist',
    albumName: match.albumName,
    duration: match.duration || canonicalDuration || 0,
    syncedLyrics: match.syncedLyrics || '',
    plainLyrics: match.plainLyrics || '',
  };
}

export function parseLrcLyrics(lrcString, offset = 0) {
  if (!lrcString || typeof lrcString !== 'string') return [];
  const lines = lrcString.split(/\r?\n/);
  const result = [];
  const timeRegex = /\[(\d{2}):(\d{2}(?:\.\d{1,3})?)\](.*)/;

  for (const line of lines) {
    const match = timeRegex.exec(line.trim());
    if (match) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseFloat(match[2]);
      const totalSeconds = minutes * 60 + seconds;
      const adjustedTime = Math.max(0, totalSeconds + offset);
      let text = match[3].replace(/\0/g, ' ').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').trim();
      if (text && !/^\[.*?\]$/.test(text)) {
        result.push({
          time: adjustedTime,
          text,
        });
      }
    }
  }

  result.sort((a, b) => a.time - b.time);

  // Filter duplicate timestamps atau lines berturut-turut yang identik
  const filtered = [];
  for (let i = 0; i < result.length; i++) {
    const cur = result[i];
    const prev = filtered[filtered.length - 1];
    if (prev && Math.abs(cur.time - prev.time) < 0.25) {
      if (cur.text.length > prev.text.length) {
        filtered[filtered.length - 1] = cur;
      }
    } else {
      filtered.push(cur);
    }
  }

  return filtered;
}

export function parseTimeSeconds(str) {
  if (!str) return null;
  const clean = String(str).trim();
  const parts = clean.split(':');
  if (parts.length === 2) {
    const m = parseFloat(parts[0]);
    const s = parseFloat(parts[1]);
    if (!isNaN(m) && !isNaN(s)) return m * 60 + s;
  }
  const val = parseFloat(clean);
  return !isNaN(val) ? val : null;
}

export function selectLrcWindow(segments, {
  isFull = false,
  isReff = false,
  isRap = false,
  isIntro = false,
  preferViral = false,
  fromTime = null,
  lyricSearch = '',
  maxDuration = 35,
} = {}) {
  if (!segments || segments.length === 0) {
    return { activeSegments: [], startTime: 0, partLabel: 'Intro', isFull };
  }

  let startIndex = 0;
  let partLabel = 'Awal Lagu (30s)';

  if (isFull) {
    partLabel = 'Full Lirik (Lengkap)';
    startIndex = 0;
  } else if (lyricSearch) {
    const q = lyricSearch.toLowerCase().trim();
    const foundIdx = segments.findIndex((s) => s.text.toLowerCase().includes(q));
    if (foundIdx !== -1) {
      startIndex = foundIdx;
      partLabel = `Kustom ("${segments[foundIdx].text.slice(0, 24)}")`;
    }
  } else if (fromTime !== null && !isNaN(fromTime) && fromTime >= 0) {
    let closestIdx = 0;
    let minDiff = Infinity;
    segments.forEach((s, idx) => {
      const diff = Math.abs(s.time - fromTime);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = idx;
      }
    });
    startIndex = closestIdx;
    const m = Math.floor(fromTime / 60);
    const s = Math.floor(fromTime % 60);
    partLabel = `Menit ${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  } else if (isIntro) {
    startIndex = 0;
    partLabel = 'Awal Lagu / Intro (30s)';
  } else if (isRap) {
    let highestWps = 0;
    let rapIdx = 0;
    for (let i = 0; i < segments.length - 1; i++) {
      const dur = Math.max(1, segments[i + 1].time - segments[i].time);
      const words = segments[i].text.trim().split(/\s+/).length;
      const wps = words / dur;
      if (wps > highestWps && segments[i].time > 8) {
        highestWps = wps;
        rapIdx = i;
      }
    }
    startIndex = rapIdx;
    partLabel = 'Bagian Rap / Verse Cepat (30s)';
  } else if (isReff || preferViral) {
    const textCounts = new Map();
    segments.forEach((s) => {
      const clean = s.text.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
      if (clean.length > 5) {
        textCounts.set(clean, (textCounts.get(clean) || 0) + 1);
      }
    });

    const totalSongDuration = segments[segments.length - 1].time;
    const minReffTime = totalSongDuration * 0.18;
    let bestReffIdx = -1;

    for (let i = 0; i < segments.length; i++) {
      const clean = segments[i].text.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
      if (segments[i].time >= minReffTime && (textCounts.get(clean) || 0) > 1) {
        bestReffIdx = i;
        break;
      }
    }

    if (bestReffIdx !== -1) {
      startIndex = bestReffIdx;
      partLabel = 'Reff / Chorus (30s)';
    } else {
      // Jika lirik tidak berulang persis, periksa apakah ada flow rap cepat
      let highestWps = 0;
      let rapIdx = -1;
      for (let i = 0; i < segments.length - 1; i++) {
        const dur = Math.max(1, segments[i + 1].time - segments[i].time);
        const words = segments[i].text.trim().split(/\s+/).length;
        const wps = words / dur;
        if (wps > highestWps && segments[i].time > 8 && words >= 6) {
          highestWps = wps;
          rapIdx = i;
        }
      }

      if (highestWps >= 4.5 && rapIdx !== -1) {
        startIndex = rapIdx;
        partLabel = 'Bagian Rap / Verse Cepat (30s)';
      } else {
        const targetTime = totalSongDuration * 0.30;
        startIndex = Math.max(0, segments.findIndex((s) => s.time >= targetTime));
        partLabel = 'Bagian Viral / Puncak Lagu (30s)';
      }
    }
  }

  const selectedFirst = segments[startIndex] || segments[0];
  let startTime = 0;
  if (isFull) {
    startTime = 0;
  } else if (startIndex === 0) {
    if (selectedFirst.time <= 6.0) {
      startTime = 0;
    } else {
      startTime = Math.max(0, selectedFirst.time - 2.0);
    }
  } else {
    startTime = Math.max(0, selectedFirst.time - 1.5);
  }

  let activeSegments = [];
  if (isFull) {
    activeSegments = segments.slice(startIndex);
  } else {
    for (let i = startIndex; i < segments.length; i++) {
      activeSegments.push(segments[i]);
      if (segments[i].time - selectedFirst.time >= maxDuration) {
        break;
      }
    }
  }

  if (activeSegments.length === 0) activeSegments.push(selectedFirst);

  return {
    startIndex,
    activeSegments,
    startTime,
    isFull,
    partLabel,
  };
}

export async function generateBratVideoMp4({
  text = '',
  audioBuffer = null,
  songQuery = '',
  theme = '',
  isFull = false,
  isReff = false,
  isRap = false,
  isIntro = false,
  preferViral = false,
  fromTime = null,
  lyricSearch = '',
  isLineMode = false,
  isTypingEffect = false,
  syncOffset = 0.20,
  isCustomOffset = false,
} = {}) {
  // Mode 1: Lagu dengan lirik sinkron otomatis
  if (songQuery) {
    const cleanQuery = songQuery.trim();
    const lyricsData = await fetchSongLyricsWithSync(cleanQuery);
    if (!lyricsData) {
      throw new Error(`Lirik untuk lagu "${cleanQuery}" tidak ditemukan.`);
    }

    let segments;
    if (lyricsData.hasWordSync && Array.isArray(lyricsData.wordSegments) && lyricsData.wordSegments.length > 0) {
      // Offset kata: Jika pengguna memasukkan offset kustom (-offset), gunakan nilai tersebut.
      // Jika default, lead offset -0.04s agar kata muncul tepat saat attack nada vokal dibunyikan.
      const actualOffset = isCustomOffset ? syncOffset : -0.04;
      segments = lyricsData.wordSegments.map((ws) => ({
        ...ws,
        time: Math.max(0, ws.time + actualOffset),
        words: (ws.words || []).map((w) => ({
          ...w,
          time: Math.max(0, w.time + actualOffset),
        })),
      }));
    } else {
      if (!lyricsData.syncedLyrics) {
        throw new Error(`Lirik tersinkronisasi (timestamp audio) belum tersedia untuk lagu "${lyricsData.trackName} - ${lyricsData.artistName}".`);
      }
      segments = parseLrcLyrics(lyricsData.syncedLyrics, syncOffset);
    }

    if (segments.length === 0) {
      throw new Error(`Format lirik lagu "${lyricsData.trackName}" tidak dapat diproses.`);
    }

    const searchTarget = `${lyricsData.artistName} - ${lyricsData.trackName}`;
    let musicTrack = null;
    try {
      musicTrack = await downloadMusicTrack(`ytsearch1:${searchTarget} audio`, {
        targetDuration: lyricsData.duration,
        title: lyricsData.trackName,
        artist: lyricsData.artistName,
      });
    } catch {
      musicTrack = await downloadMusicTrack(`ytsearch1:${cleanQuery} audio`, {
        targetDuration: lyricsData.duration,
      });
    }

    if (!musicTrack?.buffer) {
      throw new Error(`Gagal mengunduh audio lagu "${cleanQuery}".`);
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nex_bratsong_'));
    try {
      const audioPath = path.join(tmpDir, 'track.mp3');
      fs.writeFileSync(audioPath, musicTrack.buffer);

      const windowInfo = selectLrcWindow(segments, {
        isFull,
        isReff,
        isRap,
        isIntro,
        preferViral,
        fromTime,
        lyricSearch,
        maxDuration: 35,
      });

      const activeSegments = windowInfo.activeSegments;
      const startTime = windowInfo.startTime;
      const partLabel = windowInfo.partLabel;

      let globalFrameCount = 0;
      function pushFrame(imagePath, count = 1) {
        for (let c = 0; c < count; c++) {
          globalFrameCount++;
          const target = path.join(tmpDir, `frame_${String(globalFrameCount).padStart(5, '0')}.png`);
          try {
            fs.linkSync(imagePath, target);
          } catch {
            fs.copyFileSync(imagePath, target);
          }
        }
      }

      const introDuration = activeSegments[0].time - startTime;
      if (introDuration > 0.05) {
        const introFrames = Math.max(1, Math.round(introDuration * 24));
        const introText = `${lyricsData.trackName}\n${lyricsData.artistName}${theme ? ` ${theme}` : ''}`;
        const introLayout = computeBratLayout(introText);
        const introSvg = renderBratSvg(introLayout, introLayout.positionedWords);
        const introPath = path.join(tmpDir, 'base_intro.png');
        await sharp(Buffer.from(introSvg)).png().toFile(introPath);
        pushFrame(introPath, introFrames);
      }

      for (let i = 0; i < activeSegments.length; i++) {
        const cur = activeSegments[i];
        const next = activeSegments[i + 1];

        // Kunci frame awal dan akhir setiap baris terhadap timeline absolut audio agar bebas drift kumulatif
        const currentLineStartFrame = globalFrameCount;
        let nextLineStartFrame;
        if (next) {
          nextLineStartFrame = Math.round((next.time - startTime) * 24);
        } else {
          const lastDur = cur.duration && cur.duration > 0 ? Math.max(3.0, cur.duration + 0.8) : 4.0;
          nextLineStartFrame = currentLineStartFrame + Math.round(lastDur * 24);
        }

        const totalLineFrames = Math.max(6, nextLineStartFrame - currentLineStartFrame);
        const lineText = cur.text + (theme ? ` ${theme}` : '');
        const lineLayout = computeBratLayout(lineText);
        const numWords = lineLayout.positionedWords.length;

        const hasExactWords = !isLineMode && Boolean(cur.words && cur.words.length > 0);

        if (!isLineMode && numWords > 1 && totalLineFrames >= 10) {
          let wordFramesList = [];

          if (hasExactWords) {
            // Path 1: Sinkronisasi presisi tinggi per nada vokal dari Apple Music / Spotify
            const wordStartFrames = [currentLineStartFrame];
            for (let wIdx = 1; wIdx < numWords; wIdx++) {
              let targetTime;
              if (wIdx < cur.words.length) {
                targetTime = cur.words[wIdx].time;
              } else {
                const lastW = cur.words[cur.words.length - 1];
                targetTime = lastW.time + (wIdx - cur.words.length + 1) * 0.35;
              }
              const rawF = Math.round((targetTime - startTime) * 24);
              const minF = wordStartFrames[wIdx - 1] + 2;
              const maxF = nextLineStartFrame - (numWords - wIdx) * 2;
              const targetF = Math.min(Math.max(minF, rawF), Math.max(minF, maxF));
              wordStartFrames.push(targetF);
            }

            for (let wIdx = 0; wIdx < numWords - 1; wIdx++) {
              wordFramesList.push(Math.max(2, wordStartFrames[wIdx + 1] - wordStartFrames[wIdx]));
            }
            const usedSoFar = wordFramesList.reduce((a, b) => a + b, 0);
            wordFramesList.push(Math.max(2, totalLineFrames - usedSoFar));
          } else {
            // Path 2: Fallback berbasis bobot suku kata dengan alokasi jendela aktif menyanyi
            const pauseFrames = Math.max(3, Math.round(totalLineFrames * 0.18));
            const vocalFrames = Math.max(numWords * 2, totalLineFrames - pauseFrames);

            const wordWeights = lineLayout.positionedWords.map((pw, idx) => {
              const isLast = idx === numWords - 1;
              return estimateWordWeight(pw.word, isLast);
            });
            const totalWeight = wordWeights.reduce((a, b) => a + b, 0);

            let elapsedFrames = 0;
            for (let step = 1; step <= numWords; step++) {
              const activeIdx = step - 1;
              if (step === numWords) {
                wordFramesList.push(Math.max(2, totalLineFrames - elapsedFrames));
              } else {
                const wf = Math.max(2, Math.round((vocalFrames * wordWeights[activeIdx]) / totalWeight));
                wordFramesList.push(wf);
                elapsedFrames += wf;
              }
            }
          }

          // Render setiap kata dengan transisi ease-out halus dan solid hold
          for (let step = 1; step <= numWords; step++) {
            const visible = lineLayout.positionedWords.slice(0, step);
            const activeIdx = step - 1;
            const wordFrames = wordFramesList[activeIdx];

            // Animasi halus: transisi opacity dan micro-glide tanpa patah-patah
            let transitions = [];
            if (wordFrames >= 7) {
              transitions = [
                { op: 0.25, dy: 1.5 },
                { op: 0.55, dy: 0.8 },
                { op: 0.85, dy: 0.3 },
              ];
            } else if (wordFrames >= 4) {
              transitions = [
                { op: 0.35, dy: 1.2 },
                { op: 0.75, dy: 0.4 },
              ];
            } else if (wordFrames >= 2) {
              transitions = [
                { op: 0.50, dy: 0.8 },
              ];
            }

            for (let t = 0; t < transitions.length; t++) {
              const tr = transitions[t];
              const trSvg = renderBratSvg(lineLayout, visible, activeIdx, tr.op, tr.dy);
              const trPath = path.join(tmpDir, `base_w${i}_${step}_tr${t}.png`);
              await sharp(Buffer.from(trSvg)).png().toFile(trPath);
              pushFrame(trPath, 1);
            }

            const solidFrames = Math.max(1, wordFrames - transitions.length);
            const solidSvg = renderBratSvg(lineLayout, visible, activeIdx, 1.0, 0.0);
            const solidPath = path.join(tmpDir, `base_w${i}_${step}_solid.png`);
            await sharp(Buffer.from(solidSvg)).png().toFile(solidPath);
            pushFrame(solidPath, solidFrames);
          }
        } else {
          // Baris utuh (-line) atau baris dengan kata tunggal / durasi sangat singkat
          const lineSvg = renderBratSvg(lineLayout, lineLayout.positionedWords);
          const linePath = path.join(tmpDir, `base_line_${i}.png`);
          await sharp(Buffer.from(lineSvg)).png().toFile(linePath);
          pushFrame(linePath, totalLineFrames);
        }
      }

      const totalDuration = globalFrameCount / 24;
      const outMp4 = path.join(tmpDir, 'output.mp4');
      const ffmpegTimeout = isFull ? 180000 : 60000;
      execSync(
        `ffmpeg -y -framerate 24 -i "${path.join(tmpDir, 'frame_%05d.png')}" -ss ${startTime.toFixed(3)} -t ${totalDuration.toFixed(3)} -i "${audioPath}" -map 0:v -map 1:a -c:v libx264 -pix_fmt yuv420p -r 24 -c:a aac -b:a 192k -shortest -movflags +faststart "${outMp4}"`,
        { timeout: ffmpegTimeout }
      );

      return {
        buffer: fs.readFileSync(outMp4),
        trackName: lyricsData.trackName,
        artistName: lyricsData.artistName,
        duration: totalDuration,
        partLabel,
        hasWordSync: Boolean(lyricsData.hasWordSync),
      };
    } finally {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {}
    }
  }

  // Mode 2: Balas audio / voice note
  if (audioBuffer) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nex_brataud_'));
    try {
      const audioPath = path.join(tmpDir, 'input_audio');
      fs.writeFileSync(audioPath, audioBuffer);
      const audioDuration = getAudioDuration(audioPath);

      const rawText = String(text || '').trim();
      const lines = rawText.includes('\n') || rawText.includes('/') || rawText.includes('|')
        ? rawText.split(/[\r\n/|]+/).map((s) => s.trim()).filter(Boolean)
        : [rawText];

      const concatEntries = [];
      let frameCounter = 0;
      const durationPerLine = audioDuration / Math.max(1, lines.length);

      for (let i = 0; i < lines.length; i++) {
        const curLine = lines[i] + (theme ? ` ${theme}` : '');
        const lineLayout = computeBratLayout(curLine);
        const numWords = lineLayout.positionedWords.length;

        if (numWords > 1 && durationPerLine >= 1.2) {
          const typeDuration = Math.min(durationPerLine * 0.45, numWords * 0.22);
          const stepDuration = typeDuration / numWords;
          const holdDuration = durationPerLine - (stepDuration * (numWords - 1));

          for (let step = 1; step <= numWords; step++) {
            const visible = lineLayout.positionedWords.slice(0, step);
            const svg = renderBratSvg(lineLayout, visible);
            const framePath = path.join(tmpDir, `frame_${String(++frameCounter).padStart(4, '0')}.png`);
            await sharp(Buffer.from(svg)).png().toFile(framePath);
            const dur = step === numWords ? holdDuration : stepDuration;
            concatEntries.push({ file: framePath, duration: dur.toFixed(3) });
          }
        } else {
          const svg = renderBratSvg(lineLayout, lineLayout.positionedWords);
          const framePath = path.join(tmpDir, `frame_${String(++frameCounter).padStart(4, '0')}.png`);
          await sharp(Buffer.from(svg)).png().toFile(framePath);
          concatEntries.push({ file: framePath, duration: durationPerLine.toFixed(3) });
        }
      }

      const listPath = path.join(tmpDir, 'list.txt');
      const concatLines = [];
      concatEntries.forEach((e) => {
        concatLines.push(`file '${e.file}'`);
        concatLines.push(`duration ${e.duration}`);
      });
      concatLines.push(`file '${concatEntries[concatEntries.length - 1].file}'`);
      fs.writeFileSync(listPath, concatLines.join('\n'));

      const outMp4 = path.join(tmpDir, 'output.mp4');
      execSync(
        `ffmpeg -y -f concat -safe 0 -i "${listPath}" -t ${audioDuration.toFixed(2)} -i "${audioPath}" -map 0:v -map 1:a -c:v libx264 -pix_fmt yuv420p -r 24 -c:a aac -b:a 128k -shortest -movflags +faststart "${outMp4}"`,
        { timeout: 45000 }
      );

      return {
        buffer: fs.readFileSync(outMp4),
        duration: audioDuration,
      };
    } finally {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {}
    }
  }

  // Mode 3: Teks kustom murni (animasi video MP4)
  const rawText = String(text || '').trim();
  if (!rawText) {
    throw new Error('Teks tidak boleh kosong.');
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nex_bratmp4_'));
  try {
    const layout = computeBratLayout(rawText + (theme ? ` ${theme}` : ''));
    const numWords = layout.positionedWords.length;
    const concatEntries = [];
    let frameCounter = 0;

    if (numWords <= 1) {
      const svg = renderBratSvg(layout, layout.positionedWords);
      const framePath = path.join(tmpDir, 'frame_0001.png');
      await sharp(Buffer.from(svg)).png().toFile(framePath);
      concatEntries.push({ file: framePath, duration: '2.500' });
    } else {
      const typeDuration = Math.min(3.8, Math.max(1.2, numWords * 0.28));
      const stepDuration = Math.max(0.14, typeDuration / numWords);
      const holdDuration = 1.8;

      for (let step = 1; step <= numWords; step++) {
        const visible = layout.positionedWords.slice(0, step);
        const svg = renderBratSvg(layout, visible);
        const framePath = path.join(tmpDir, `frame_${String(++frameCounter).padStart(4, '0')}.png`);
        await sharp(Buffer.from(svg)).png().toFile(framePath);
        const dur = step === numWords ? holdDuration : stepDuration;
        concatEntries.push({ file: framePath, duration: dur.toFixed(3) });
      }
    }

    const listPath = path.join(tmpDir, 'list.txt');
    const concatLines = [];
    concatEntries.forEach((e) => {
      concatLines.push(`file '${e.file}'`);
      concatLines.push(`duration ${e.duration}`);
    });
    concatLines.push(`file '${concatEntries[concatEntries.length - 1].file}'`);
    fs.writeFileSync(listPath, concatLines.join('\n'));

    const outMp4 = path.join(tmpDir, 'output.mp4');
    execSync(
      `ffmpeg -y -f concat -safe 0 -i "${listPath}" -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 -c:v libx264 -pix_fmt yuv420p -r 24 -c:a aac -b:a 128k -shortest -movflags +faststart "${outMp4}"`,
      { timeout: 30000 }
    );

    const totalDuration = concatEntries.reduce((acc, e) => acc + parseFloat(e.duration), 0);
    return {
      buffer: fs.readFileSync(outMp4),
      duration: totalDuration,
    };
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }
}

export async function generateTtsAudio(text, lang = 'id') {
  const cleanText = text.trim().slice(0, 300);
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${lang}&client=tw-ob&q=${encodeURIComponent(cleanText)}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
    },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`Google TTS merespon HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function convertMediaToAudio(inputBuffer, isPtt = false) {
  const rand = Math.random().toString(36).slice(2, 8);
  const inExt = isPtt ? 'ogg' : 'mp3';
  const inPath = path.join(os.tmpdir(), `nex_audin_${Date.now()}_${rand}.bin`);
  const outPath = path.join(os.tmpdir(), `nex_audout_${Date.now()}_${rand}.${inExt}`);

  try {
    fs.writeFileSync(inPath, inputBuffer);
    const audioArgs = isPtt
      ? '-vn -c:a libopus -b:a 64k -ar 48000'
      : '-vn -c:a libmp3lame -b:a 128k -ar 44100';
    execSync(`ffmpeg -y -i "${inPath}" ${audioArgs} "${outPath}"`, { timeout: 30000 });
    return fs.readFileSync(outPath);
  } finally {
    try { if (fs.existsSync(inPath)) fs.unlinkSync(inPath); } catch {}
    try { if (fs.existsSync(outPath)) fs.unlinkSync(outPath); } catch {}
  }
}

export async function uploadToTmpfiles(buffer, fileName = 'file.bin') {
  const form = new FormData();
  form.append('file', new Blob([buffer]), fileName);

  const res = await fetch('https://tmpfiles.org/api/v1/upload', {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(20000),
  });

  if (!res.ok) throw new Error(`Tmpfiles server merespon status ${res.status}`);
  const json = await res.json();
  const rawUrl = json.data?.url;
  if (!rawUrl) throw new Error('Gagal mendapatkan tautan dari Tmpfiles.');

  const directUrl = rawUrl.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
  return { pageUrl: rawUrl, directUrl };
}

export async function generateMemeSticker(imageBuffer, topText = '', bottomText = '') {
  const width = 512;
  const height = 512;

  const cleanTop = escapeXml(topText.toUpperCase().slice(0, 60));
  const cleanBottom = escapeXml(bottomText.toUpperCase().slice(0, 60));

  const svg = `
    <svg width="${width}" height="${height}">
      <style>
        .meme-text {
          fill: #ffffff;
          stroke: #000000;
          stroke-width: 3.5px;
          paint-order: stroke fill;
          font-family: Impact, sans-serif;
          font-size: 38px;
          font-weight: 900;
          text-anchor: middle;
        }
      </style>
      <text x="50%" y="65" class="meme-text">${cleanTop}</text>
      <text x="50%" y="465" class="meme-text">${cleanBottom}</text>
    </svg>
  `;

  const resized = await sharp(imageBuffer)
    .resize(width, height, { fit: 'cover' })
    .png()
    .toBuffer();

  const composite = await sharp(resized)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toBuffer();

  return await imageToWebpSticker(composite);
}

export async function extractAnyMediaBuffer({ msg, ctx, platform }) {
  const photo = await extractPhotoBuffer({ msg, ctx, platform });
  if (photo) return { buffer: photo, ext: 'jpg', mime: 'image/jpeg' };

  const video = await extractVideoBuffer({ msg, ctx, platform });
  if (video) return { buffer: video, ext: 'mp4', mime: 'video/mp4' };

  if (platform === 'telegram' && ctx) {
    const target = ctx.message?.reply_to_message || ctx.message;
    if (target?.sticker) {
      const file = await ctx.api.getFile(target.sticker.file_id);
      const token = process.env.TELEGRAM_BOT_TOKEN;
      const res = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`);
      return { buffer: Buffer.from(await res.arrayBuffer()), ext: 'webp', mime: 'image/webp' };
    }
    if (target?.audio || target?.voice) {
      const aud = target.audio || target.voice;
      const file = await ctx.api.getFile(aud.file_id);
      const token = process.env.TELEGRAM_BOT_TOKEN;
      const res = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`);
      return { buffer: Buffer.from(await res.arrayBuffer()), ext: 'ogg', mime: 'audio/ogg' };
    }
  } else {
    let quoted = msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (quoted?.stickerMessage) {
      const fakeMsg = { key: { id: msg?.message?.extendedTextMessage?.contextInfo?.stanzaId }, message: quoted };
      const buf = await downloadMediaMessage(fakeMsg, 'buffer', {});
      return { buffer: buf, ext: 'webp', mime: 'image/webp' };
    }
    if (quoted?.audioMessage) {
      const fakeMsg = { key: { id: msg?.message?.extendedTextMessage?.contextInfo?.stanzaId }, message: quoted };
      const buf = await downloadMediaMessage(fakeMsg, 'buffer', {});
      return { buffer: buf, ext: 'mp3', mime: 'audio/mp4' };
    }
  }
  return null;
}

export async function extractAudioBuffer({ msg, ctx, platform }) {
  if (platform === 'telegram' && ctx) {
    const target = ctx.message?.reply_to_message || ctx.message;
    const aud = target?.audio || target?.voice;
    if (aud) {
      const file = await ctx.api.getFile(aud.file_id);
      const token = process.env.TELEGRAM_BOT_TOKEN;
      const res = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`);
      return Buffer.from(await res.arrayBuffer());
    }
  } else if (msg) {
    const quoted = msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (quoted?.audioMessage) {
      const fakeMsg = {
        key: {
          id: msg?.message?.extendedTextMessage?.contextInfo?.stanzaId,
          remoteJid: msg?.key?.remoteJid,
        },
        message: quoted,
      };
      return await downloadMediaMessage(fakeMsg, 'buffer', {});
    }
    if (msg?.message?.audioMessage) {
      return await downloadMediaMessage(msg, 'buffer', {});
    }
  }
  return null;
}
