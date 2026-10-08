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
    usage: '/s [kirim foto/video dengan caption /s atau balas media]',
    async execute({ sock, msg, jid, reply, prefix, ctx, platform, react }) {
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

        let webpSticker;
        if (isVideo) {
          webpSticker = await videoToWebpSticker(mediaBuffer, false);
        } else {
          webpSticker = await imageToWebpSticker(mediaBuffer);
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

export async function generateBratSticker(text) {
  ensureSystemFontInstalled();
  const measure = getFontMeasure();

  let raw = String(text || '').trim();
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

  const escapeXml = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const textElements = [];

  lines.forEach((lineWords, lineIdx) => {
    const y = startY + (lineIdx * lineHeight);
    if (lineWords.length === 1) {
      textElements.push(`<text x="${canvasSize / 2}" y="${y.toFixed(2)}" text-anchor="middle" font-family="Arial Narrow, Arial, Liberation Sans Narrow, sans-serif" font-size="${fontSize}px" fill="${textColor}" filter="url(#bratBlur)">${escapeXml(lineWords[0])}</text>`);
    } else {
      const wordWidths = lineWords.map((w) => measure(w, fontSize));
      const totalWordW = wordWidths.reduce((a, b) => a + b, 0);
      const totalGap = contentWidth - totalWordW;
      const gap = totalGap > 0 ? (totalGap / (lineWords.length - 1)) : measure(' ', fontSize);

      let curX = startX;
      lineWords.forEach((w, wIdx) => {
        textElements.push(`<text x="${curX.toFixed(2)}" y="${y.toFixed(2)}" text-anchor="start" font-family="Arial Narrow, Arial, Liberation Sans Narrow, sans-serif" font-size="${fontSize}px" fill="${textColor}" filter="url(#bratBlur)">${escapeXml(w)}</text>`);
        curX += wordWidths[wIdx] + gap;
      });
    }
  });

  const svg = `
    <svg width="${canvasSize}" height="${canvasSize}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="bratBlur" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="0.9" />
        </filter>
      </defs>
      <rect width="100%" height="100%" fill="${bg}" />
      ${textElements.join('\n      ')}
    </svg>
  `;

  return await sharp(Buffer.from(svg))
    .webp({ quality: 95 })
    .toBuffer();
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

  const escapeXml = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
