import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { registerCommand } from '../../bot/handler.js';
import { logger } from '../../utils/logger.js';

const execAsync = promisify(exec);

async function safeUnlink(...filePaths) {
  for (const fp of filePaths) {
    if (fp && fs.existsSync(fp)) {
      try {
        fs.unlinkSync(fp);
      } catch {}
    }
  }
}

/**
 * 1. TikTok Downloader via TikWM (Super cepat, tanpa watermark)
 */
export async function downloadTikTokVideo(tiktokUrl) {
  const cleanUrl = tiktokUrl.trim();

  const apiUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(cleanUrl)}`;
  const res = await fetch(apiUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    throw new Error(`Server downloader merespon status HTTP ${res.status}`);
  }

  const json = await res.json();
  if (json.code !== 0 || !json.data) {
    throw new Error(json.msg || 'Gagal memproses video TikTok. Pastikan video bersifat publik.');
  }

  const videoUrl = json.data.play || json.data.hdplay || json.data.wmplay;
  if (!videoUrl) {
    throw new Error('Tautan video tidak ditemukan pada hasil parsing.');
  }

  const videoRes = await fetch(videoUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(25000),
  });

  const contentLength = Number(videoRes.headers.get('content-length') || 0);
  if (contentLength > 35 * 1024 * 1024) {
    throw new Error('Ukuran video terlalu besar (> 35 MB) untuk dikirim langsung.');
  }

  const videoBuffer = Buffer.from(await videoRes.arrayBuffer());

  return {
    title: json.data.title || 'TikTok Video',
    author: json.data.author?.nickname || json.data.author?.unique_id || 'User',
    duration: json.data.duration || 0,
    videoBuffer,
  };
}

/**
 * 2. Multi-Platform Downloader via yt-dlp (Instagram, YouTube, Twitter/X, FB, Pinterest)
 */
export async function downloadWithYtDlp(url, options = {}) {
  const rand = Math.random().toString(36).slice(2, 8);
  const outTemplate = path.join(os.tmpdir(), `nexdl_${Date.now()}_${rand}.%(ext)s`);
  const isAudio = options.audio === true;

  let formatArg = '-f "b[filesize<35M]/best[ext=mp4]/best"';
  if (isAudio) {
    formatArg = '-f "bestaudio" -x --audio-format mp3';
  }

  // Gunakan argumen client spoofing untuk stabilitas YouTube & media publik
  const cmd = `yt-dlp --extractor-args "youtube:player_client=android,web" --no-warnings --no-playlist --playlist-items 1 --max-filesize 35M ${formatArg} -o "${outTemplate}" "${url}"`;

  try {
    await execAsync(cmd, { timeout: 45000 });
  } catch (err) {
    logger.warn('yt-dlp download failed:', err.message);
    throw new Error('Gagal mengunduh media dari tautan tersebut. Pastikan konten bersifat publik.');
  }

  const files = fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith('nexdl_') && f.includes(rand));
  if (files.length === 0) {
    throw new Error('File hasil unduhan tidak ditemukan di server.');
  }

  const downloadedPath = path.join(os.tmpdir(), files[0]);
  const stat = fs.statSync(downloadedPath);
  const ext = path.extname(downloadedPath).replace('.', '').toLowerCase();
  const buffer = fs.readFileSync(downloadedPath);

  await safeUnlink(downloadedPath);

  return {
    buffer,
    size: stat.size,
    ext,
    isAudio,
  };
}

export function registerDownloaderCommands() {
  // 1. TikTok Downloader (.tiktok / /tiktok)
  registerCommand({
    name: 'tiktok',
    aliases: ['tt', 'ttdl', 'tiktokdl'],
    category: 'downloader',
    description: 'Mengunduh video TikTok tanpa watermark secara instan',
    usage: '.tiktok <url_tiktok>',
    async execute({ sock, jid, fullText, reply, prefix }) {
      const urlMatch = fullText?.match(/https?:\/\/(www\.|vm\.|vt\.|t\.)?tiktok\.com\/[^\s]+/i);
      const url = urlMatch ? urlMatch[0] : null;

      if (!url) {
        return reply(`[!] Masukkan tautan video TikTok.\nContoh: \`${prefix}tiktok https://vt.tiktok.com/xxxxxx/\``);
      }

      await reply('[-] Sedang mengunduh video TikTok...');

      try {
        const result = await downloadTikTokVideo(url);

        let caption = `[TIKTOK DOWNLOADER]\n\n`;
        caption += `• Kreator: ${result.author}\n`;
        caption += `• Durasi: ${result.duration}s\n`;
        if (result.title) {
          caption += `• Judul: ${result.title.slice(0, 150)}\n\n`;
        }
        caption += `Unduhan berhasil tanpa watermark.`;

        await sock.sendMessage(jid, {
          video: result.videoBuffer,
          caption,
          mimetype: 'video/mp4',
        });
      } catch (err) {
        logger.error('Error saat download TikTok:', err.message);
        await reply(`[!] Gagal mengunduh TikTok: ${err.message}`);
      }
    },
  });

  // 2. Instagram Downloader (.instagram / /instagram)
  registerCommand({
    name: 'instagram',
    aliases: ['ig', 'igdl', 'reel', 'reels', 'igreel'],
    category: 'downloader',
    description: 'Mengunduh video Instagram Reel, Post, atau Carousel',
    usage: '.ig <url_instagram>',
    async execute({ sock, jid, fullText, reply, prefix }) {
      const urlMatch = fullText?.match(/https?:\/\/(www\.)?instagram\.com\/[^\s]+/i);
      const url = urlMatch ? urlMatch[0] : null;

      if (!url) {
        return reply(`[!] Masukkan tautan video / reel Instagram.\nContoh: \`${prefix}ig https://www.instagram.com/reel/xxxxxx/\``);
      }

      await reply('[-] Sedang memproses unduhan Instagram...');

      try {
        const media = await downloadWithYtDlp(url, { audio: false });
        let caption = `[INSTAGRAM DOWNLOADER]\n\nTautan: ${url}\nUkuran: ${(media.size / 1024 / 1024).toFixed(2)} MB`;

        if (media.ext === 'mp4' || media.ext === 'mov') {
          await sock.sendMessage(jid, {
            video: media.buffer,
            caption,
            mimetype: 'video/mp4',
          });
        } else {
          await sock.sendMessage(jid, {
            image: media.buffer,
            caption,
          });
        }
      } catch (err) {
        logger.error('Error saat download IG:', err.message);
        await reply(`[!] Gagal mengunduh Instagram: ${err.message}`);
      }
    },
  });

  // 3. YouTube Video Downloader (.youtube / /youtube)
  registerCommand({
    name: 'youtube',
    aliases: ['yt', 'ytmp4', 'ytdl'],
    category: 'downloader',
    description: 'Mengunduh video YouTube dalam format MP4',
    usage: '.yt <url_youtube>',
    async execute({ sock, jid, fullText, reply, prefix }) {
      const urlMatch = fullText?.match(/https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/[^\s]+/i);
      const url = urlMatch ? urlMatch[0] : null;

      if (!url) {
        return reply(`[!] Masukkan tautan video YouTube.\nContoh: \`${prefix}yt https://youtu.be/xxxxxx\``);
      }

      await reply('[-] Sedang memproses video YouTube...');

      try {
        const media = await downloadWithYtDlp(url, { audio: false });
        let caption = `[YOUTUBE DOWNLOADER]\n\nTautan: ${url}\nUkuran: ${(media.size / 1024 / 1024).toFixed(2)} MB`;

        await sock.sendMessage(jid, {
          video: media.buffer,
          caption,
          mimetype: 'video/mp4',
        });
      } catch (err) {
        logger.error('Error saat download YouTube:', err.message);
        await reply(`[!] Gagal mengunduh YouTube: ${err.message}`);
      }
    },
  });

  // 4. YouTube MP3 Audio Downloader (.ytmp3 / /ytmp3)
  registerCommand({
    name: 'ytmp3',
    aliases: ['yta', 'ytaudio', 'ytmusic'],
    category: 'downloader',
    description: 'Mengunduh audio lagu dari YouTube dalam format MP3',
    usage: '.ytmp3 <url_youtube>',
    async execute({ sock, jid, fullText, reply, prefix }) {
      const urlMatch = fullText?.match(/https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/[^\s]+/i);
      const url = urlMatch ? urlMatch[0] : null;

      if (!url) {
        return reply(`[!] Masukkan tautan video YouTube.\nContoh: \`${prefix}ytmp3 https://youtu.be/xxxxxx\``);
      }

      await reply('[-] Sedang mengekstrak audio MP3 dari YouTube...');

      try {
        const media = await downloadWithYtDlp(url, { audio: true });
        let caption = `[YOUTUBE AUDIO MP3]\n\nTautan: ${url}\nUkuran: ${(media.size / 1024 / 1024).toFixed(2)} MB`;

        await sock.sendMessage(jid, {
          document: media.buffer,
          fileName: 'audio.mp3',
          caption,
          mimetype: 'audio/mpeg',
        });
      } catch (err) {
        logger.error('Error saat download YTMP3:', err.message);
        await reply(`[!] Gagal mengunduh audio YouTube: ${err.message}`);
      }
    },
  });

  // 5. Twitter / X Downloader (.twitter / /twitter)
  registerCommand({
    name: 'twitter',
    aliases: ['x', 'twt', 'xdl', 'twitterdl'],
    category: 'downloader',
    description: 'Mengunduh video atau media dari Twitter / X',
    usage: '.twitter <url_tweet>',
    async execute({ sock, jid, fullText, reply, prefix }) {
      const urlMatch = fullText?.match(/https?:\/\/(www\.)?(twitter\.com|x\.com)\/[^\s]+/i);
      const url = urlMatch ? urlMatch[0] : null;

      if (!url) {
        return reply(`[!] Masukkan tautan postingan Twitter/X.\nContoh: \`${prefix}x https://x.com/username/status/xxxxxx\``);
      }

      await reply('[-] Sedang mengunduh media dari Twitter/X...');

      try {
        const media = await downloadWithYtDlp(url, { audio: false });
        let caption = `[TWITTER / X DOWNLOADER]\n\nTautan: ${url}\nUkuran: ${(media.size / 1024 / 1024).toFixed(2)} MB`;

        await sock.sendMessage(jid, {
          video: media.buffer,
          caption,
          mimetype: 'video/mp4',
        });
      } catch (err) {
        logger.error('Error saat download Twitter:', err.message);
        await reply(`[!] Gagal mengunduh Twitter/X: ${err.message}`);
      }
    },
  });

  // 6. Facebook Downloader (.facebook / /facebook)
  registerCommand({
    name: 'facebook',
    aliases: ['fb', 'fbdl', 'fbreel'],
    category: 'downloader',
    description: 'Mengunduh video publik dari Facebook atau Reel Facebook',
    usage: '.fb <url_facebook>',
    async execute({ sock, jid, fullText, reply, prefix }) {
      const urlMatch = fullText?.match(/https?:\/\/(www\.|web\.|fb\.)?(facebook\.com|fb\.watch)\/[^\s]+/i);
      const url = urlMatch ? urlMatch[0] : null;

      if (!url) {
        return reply(`[!] Masukkan tautan video Facebook.\nContoh: \`${prefix}fb https://fb.watch/xxxxxx\``);
      }

      await reply('[-] Sedang mengunduh video Facebook...');

      try {
        const media = await downloadWithYtDlp(url, { audio: false });
        let caption = `[FACEBOOK DOWNLOADER]\n\nTautan: ${url}\nUkuran: ${(media.size / 1024 / 1024).toFixed(2)} MB`;

        await sock.sendMessage(jid, {
          video: media.buffer,
          caption,
          mimetype: 'video/mp4',
        });
      } catch (err) {
        logger.error('Error saat download FB:', err.message);
        await reply(`[!] Gagal mengunduh video Facebook: ${err.message}`);
      }
    },
  });

  // 7. Pinterest Downloader (.pinterest / /pinterest)
  registerCommand({
    name: 'pinterest',
    aliases: ['pin', 'pindl'],
    category: 'downloader',
    description: 'Mengunduh foto atau video dari Pinterest',
    usage: '.pin <url_pinterest>',
    async execute({ sock, jid, fullText, reply, prefix }) {
      const urlMatch = fullText?.match(/https?:\/\/(www\.|pin\.)?pinterest\.(com|it|fr|de|[a-z]{2,3})\/[^\s]+/i);
      const url = urlMatch ? urlMatch[0] : null;

      if (!url) {
        return reply(`[!] Masukkan tautan pin Pinterest.\nContoh: \`${prefix}pin https://pin.it/xxxxxx\``);
      }

      await reply('[-] Sedang mengambil media Pinterest...');

      try {
        const media = await downloadWithYtDlp(url, { audio: false });
        let caption = `[PINTEREST DOWNLOADER]\n\nTautan: ${url}`;

        if (media.ext === 'mp4' || media.ext === 'mov') {
          await sock.sendMessage(jid, {
            video: media.buffer,
            caption,
            mimetype: 'video/mp4',
          });
        } else {
          await sock.sendMessage(jid, {
            image: media.buffer,
            caption,
          });
        }
      } catch (err) {
        logger.error('Error saat download Pinterest:', err.message);
        await reply(`[!] Gagal mengunduh Pinterest: ${err.message}`);
      }
    },
  });

  // 8. Universal Smart Downloader (.down / /down)
  registerCommand({
    name: 'down',
    aliases: ['dl', 'download', 'unduh'],
    category: 'downloader',
    description: 'Smart universal downloader (otomatis mendeteksi TikTok, IG, YT, X, FB, Pinterest)',
    usage: '.down <url_media>',
    async execute({ sock, jid, fullText, reply, prefix }) {
      const urlMatch = fullText?.match(/https?:\/\/[^\s]+/i);
      const url = urlMatch ? urlMatch[0] : null;

      if (!url) {
        return reply(`[!] Masukkan tautan media yang ingin diunduh.\nContoh: \`${prefix}down https://vt.tiktok.com/xxxxxx/\``);
      }

      // Deteksi TikTok
      if (/tiktok\.com/i.test(url)) {
        await reply('[-] Terdeteksi tautan TikTok. Memulai unduhan...');
        try {
          const result = await downloadTikTokVideo(url);
          return await sock.sendMessage(jid, {
            video: result.videoBuffer,
            caption: `[UNIVERSAL DOWNLOADER: TIKTOK]\n\n• Kreator: ${result.author}\n• Judul: ${result.title.slice(0, 100)}`,
            mimetype: 'video/mp4',
          });
        } catch {
          // Fallback ke yt-dlp di bawah jika TikWM gagal
        }
      }

      await reply('[-] Sedang memproses tautan media dengan universal engine...');

      try {
        const media = await downloadWithYtDlp(url, { audio: false });
        let caption = `[UNIVERSAL DOWNLOADER]\n\nTautan: ${url}\nUkuran: ${(media.size / 1024 / 1024).toFixed(2)} MB`;

        if (media.ext === 'mp4' || media.ext === 'mov' || media.ext === 'webm') {
          await sock.sendMessage(jid, {
            video: media.buffer,
            caption,
            mimetype: 'video/mp4',
          });
        } else {
          await sock.sendMessage(jid, {
            image: media.buffer,
            caption,
          });
        }
      } catch (err) {
        logger.error('Error saat universal downloader:', err.message);
        await reply(`[!] Gagal memproses media dari tautan tersebut: ${err.message}`);
      }
    },
  });
}
