import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { InputFile } from 'grammy';
import { registerCommand } from '../../bot/handler.js';
import { logger } from '../../utils/logger.js';
import { create8BitProgressTracker } from '../../utils/progress.js';

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

/**
 * 3. Spotify Music Downloader & Search Player
 */
export async function downloadSpotifyTrack(queryOrUrl) {
  let searchTerm = queryOrUrl.trim();
  let spotifyMeta = null;

  // Cek apakah berupa tautan Spotify
  if (/spotify\.com\/track\/[a-zA-Z0-9]+/i.test(searchTerm)) {
    try {
      const oembedRes = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(searchTerm)}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (oembedRes.ok) {
        spotifyMeta = await oembedRes.json();
        if (spotifyMeta.title) {
          searchTerm = spotifyMeta.title;
        }
      }
    } catch {}
  }

  const rand = Math.random().toString(36).slice(2, 8);
  const outTemplate = path.join(os.tmpdir(), `spot_${Date.now()}_${rand}.%(ext)s`);

  // Target pencarian audio
  const searchTarget = searchTerm.startsWith('http') ? searchTerm : `ytsearch1:${searchTerm}`;
  const cmd = `yt-dlp --no-warnings --no-playlist --playlist-items 1 -x --audio-format mp3 --max-filesize 35M -o "${outTemplate}" "${searchTarget}"`;

  try {
    await execAsync(cmd, { timeout: 45000 });
  } catch (err) {
    logger.warn('Spotify/Audio download failed:', err.message);
    throw new Error('Lagu tidak ditemukan atau ukuran terlalu besar.');
  }

  const files = fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith('spot_') && f.includes(rand));
  if (files.length === 0) {
    throw new Error('File audio tidak ditemukan.');
  }

  const downloadedPath = path.join(os.tmpdir(), files[0]);
  const stat = fs.statSync(downloadedPath);
  const buffer = fs.readFileSync(downloadedPath);
  await safeUnlink(downloadedPath);

  return {
    title: spotifyMeta?.title || searchTerm,
    artist: spotifyMeta?.author_name || 'Spotify Audio',
    thumbnail: spotifyMeta?.thumbnail_url || null,
    buffer,
    size: stat.size,
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
    async execute({ sock, jid, fullText, reply, prefix, ctx }) {
      const urlMatch = fullText?.match(/https?:\/\/(www\.|vm\.|vt\.|t\.)?tiktok\.com\/[^\s]+/i);
      const url = urlMatch ? urlMatch[0] : null;

      if (!url) {
        return reply(`[!] Masukkan tautan video TikTok.\nContoh: \`${prefix}tiktok https://vt.tiktok.com/xxxxxx/\``);
      }

      const tracker = await create8BitProgressTracker({ ctx, reply, title: 'TIKTOK' });

      try {
        const result = await downloadTikTokVideo(url);
        await tracker.finish('TIKTOK READY');

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
        await tracker.fail(err.message);
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
    async execute({ sock, jid, fullText, reply, prefix, ctx }) {
      const urlMatch = fullText?.match(/https?:\/\/(www\.)?instagram\.com\/[^\s]+/i);
      const url = urlMatch ? urlMatch[0] : null;

      if (!url) {
        return reply(`[!] Masukkan tautan video / reel Instagram.\nContoh: \`${prefix}ig https://www.instagram.com/reel/xxxxxx/\``);
      }

      const tracker = await create8BitProgressTracker({ ctx, reply, title: 'INSTAGRAM' });

      try {
        const media = await downloadWithYtDlp(url, { audio: false });
        await tracker.finish('INSTAGRAM READY');

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
        await tracker.fail(err.message);
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
    async execute({ sock, jid, fullText, reply, prefix, ctx }) {
      const urlMatch = fullText?.match(/https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/[^\s]+/i);
      const url = urlMatch ? urlMatch[0] : null;

      if (!url) {
        return reply(`[!] Masukkan tautan video YouTube.\nContoh: \`${prefix}yt https://youtu.be/xxxxxx\``);
      }

      const tracker = await create8BitProgressTracker({ ctx, reply, title: 'YOUTUBE' });

      try {
        const media = await downloadWithYtDlp(url, { audio: false });
        await tracker.finish('YOUTUBE READY');

        let caption = `[YOUTUBE DOWNLOADER]\n\nTautan: ${url}\nUkuran: ${(media.size / 1024 / 1024).toFixed(2)} MB`;

        await sock.sendMessage(jid, {
          video: media.buffer,
          caption,
          mimetype: 'video/mp4',
        });
      } catch (err) {
        logger.error('Error saat download YouTube:', err.message);
        await tracker.fail(err.message);
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
    async execute({ sock, jid, fullText, reply, prefix, ctx }) {
      const urlMatch = fullText?.match(/https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/[^\s]+/i);
      const url = urlMatch ? urlMatch[0] : null;

      if (!url) {
        return reply(`[!] Masukkan tautan video YouTube.\nContoh: \`${prefix}ytmp3 https://youtu.be/xxxxxx\``);
      }

      const tracker = await create8BitProgressTracker({ ctx, reply, title: 'YT MP3' });

      try {
        const media = await downloadWithYtDlp(url, { audio: true });
        await tracker.finish('AUDIO READY');

        let caption = `[YOUTUBE AUDIO MP3]\n\nTautan: ${url}\nUkuran: ${(media.size / 1024 / 1024).toFixed(2)} MB`;

        await sock.sendMessage(jid, {
          document: media.buffer,
          fileName: 'audio.mp3',
          caption,
          mimetype: 'audio/mpeg',
        });
      } catch (err) {
        logger.error('Error saat download YTMP3:', err.message);
        await tracker.fail(err.message);
        await reply(`[!] Gagal mengunduh audio YouTube: ${err.message}`);
      }
    },
  });

  // 5. Spotify Music Downloader & Player (.spotify / /spotify / /play)
  registerCommand({
    name: 'spotify',
    aliases: ['play', 'lagu', 'music', 'song'],
    category: 'downloader',
    description: 'Cari & putar lagu dari Spotify atau judul lagu favorit',
    usage: '.spotify <judul lagu / url spotify>',
    async execute({ sock, jid, fullText, reply, prefix, ctx, platform }) {
      const query = fullText?.trim();
      if (!query) {
        return reply(`[!] Masukkan judul lagu atau link Spotify.\nContoh: \`${prefix}play Bohemian Rhapsody\`\natau \`${prefix}spotify https://open.spotify.com/track/xxxxxx\``);
      }

      const tracker = await create8BitProgressTracker({ ctx, reply, title: 'SPOTIFY' });

      try {
        const track = await downloadSpotifyTrack(query);
        await tracker.finish('MUSIC READY');

        if (platform === 'telegram' && ctx?.replyWithAudio) {
          let caption = `<b>[ SPOTIFY MUSIC PLAYER ]</b>\n\n`;
          caption += `• Judul: <b>${track.title}</b>\n`;
          caption += `• Artis: ${track.artist}\n`;
          caption += `• Ukuran: ${(track.size / 1024 / 1024).toFixed(2)} MB`;

          await ctx.replyWithAudio(new InputFile(track.buffer, `${track.title.slice(0, 30)}.mp3`), {
            title: track.title,
            performer: track.artist,
            caption,
            parse_mode: 'HTML',
          });
        } else {
          let caption = `[SPOTIFY MUSIC PLAYER]\n\n• Judul: ${track.title}\n• Artis: ${track.artist}`;
          await sock.sendMessage(jid, {
            audio: track.buffer,
            mimetype: 'audio/mpeg',
            fileName: `${track.title}.mp3`,
          });
          await reply(caption);
        }
      } catch (err) {
        logger.error('Error saat download Spotify:', err.message);
        await tracker.fail(err.message);
        await reply(`[!] Gagal memutar lagu: ${err.message}`);
      }
    },
  });

  // 6. Twitter / X Downloader (.twitter / /twitter)
  registerCommand({
    name: 'twitter',
    aliases: ['x', 'twt', 'xdl', 'twitterdl'],
    category: 'downloader',
    description: 'Mengunduh video atau media dari Twitter / X',
    usage: '.twitter <url_tweet>',
    async execute({ sock, jid, fullText, reply, prefix, ctx }) {
      const urlMatch = fullText?.match(/https?:\/\/(www\.)?(twitter\.com|x\.com)\/[^\s]+/i);
      const url = urlMatch ? urlMatch[0] : null;

      if (!url) {
        return reply(`[!] Masukkan tautan postingan Twitter/X.\nContoh: \`${prefix}x https://x.com/username/status/xxxxxx\``);
      }

      const tracker = await create8BitProgressTracker({ ctx, reply, title: 'TWITTER / X' });

      try {
        const media = await downloadWithYtDlp(url, { audio: false });
        await tracker.finish('MEDIA READY');

        let caption = `[TWITTER / X DOWNLOADER]\n\nTautan: ${url}\nUkuran: ${(media.size / 1024 / 1024).toFixed(2)} MB`;

        await sock.sendMessage(jid, {
          video: media.buffer,
          caption,
          mimetype: 'video/mp4',
        });
      } catch (err) {
        logger.error('Error saat download Twitter:', err.message);
        await tracker.fail(err.message);
        await reply(`[!] Gagal mengunduh Twitter/X: ${err.message}`);
      }
    },
  });

  // 7. Facebook Downloader (.facebook / /facebook)
  registerCommand({
    name: 'facebook',
    aliases: ['fb', 'fbdl', 'fbreel'],
    category: 'downloader',
    description: 'Mengunduh video publik dari Facebook atau Reel Facebook',
    usage: '.fb <url_facebook>',
    async execute({ sock, jid, fullText, reply, prefix, ctx }) {
      const urlMatch = fullText?.match(/https?:\/\/(www\.|web\.|fb\.)?(facebook\.com|fb\.watch)\/[^\s]+/i);
      const url = urlMatch ? urlMatch[0] : null;

      if (!url) {
        return reply(`[!] Masukkan tautan video Facebook.\nContoh: \`${prefix}fb https://fb.watch/xxxxxx\``);
      }

      const tracker = await create8BitProgressTracker({ ctx, reply, title: 'FACEBOOK' });

      try {
        const media = await downloadWithYtDlp(url, { audio: false });
        await tracker.finish('FB READY');

        let caption = `[FACEBOOK DOWNLOADER]\n\nTautan: ${url}\nUkuran: ${(media.size / 1024 / 1024).toFixed(2)} MB`;

        await sock.sendMessage(jid, {
          video: media.buffer,
          caption,
          mimetype: 'video/mp4',
        });
      } catch (err) {
        logger.error('Error saat download FB:', err.message);
        await tracker.fail(err.message);
        await reply(`[!] Gagal mengunduh video Facebook: ${err.message}`);
      }
    },
  });

  // 8. Pinterest Downloader (.pinterest / /pinterest)
  registerCommand({
    name: 'pinterest',
    aliases: ['pin', 'pindl'],
    category: 'downloader',
    description: 'Mengunduh foto atau video dari Pinterest',
    usage: '.pin <url_pinterest>',
    async execute({ sock, jid, fullText, reply, prefix, ctx }) {
      const urlMatch = fullText?.match(/https?:\/\/([a-zA-Z0-9.-]+\.)?(pinterest\.[a-z]{2,6}|pin\.it)\/[^\s]+/i);
      const url = urlMatch ? urlMatch[0] : null;

      if (!url) {
        return reply(`[!] Masukkan tautan pin Pinterest.\nContoh: \`${prefix}pin https://pin.it/xxxxxx\``);
      }

      const tracker = await create8BitProgressTracker({ ctx, reply, title: 'PINTEREST' });

      try {
        let targetUrl = url;
        if (/pin\.it/i.test(url)) {
          try {
            const headRes = await fetch(url, {
              redirect: 'follow',
              headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
              signal: AbortSignal.timeout(8000),
            });
            if (headRes.url) {
              targetUrl = headRes.url;
            }
          } catch {}
        }

        const media = await downloadWithYtDlp(targetUrl, { audio: false });
        await tracker.finish('PIN READY');

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
        await tracker.fail(err.message);
        await reply(`[!] Gagal mengunduh Pinterest: ${err.message}`);
      }
    },
  });

  // 9. Universal Smart Downloader (.down / /down)
  registerCommand({
    name: 'down',
    aliases: ['dl', 'download', 'unduh'],
    category: 'downloader',
    description: 'Smart universal downloader (otomatis mendeteksi TikTok, IG, YT, X, FB, Pinterest)',
    usage: '.down <url_media>',
    async execute({ sock, jid, fullText, reply, prefix, ctx }) {
      const urlMatch = fullText?.match(/https?:\/\/[^\s]+/i);
      const url = urlMatch ? urlMatch[0] : null;

      if (!url) {
        return reply(`[!] Masukkan tautan media yang ingin diunduh.\nContoh: \`${prefix}down https://vt.tiktok.com/xxxxxx/\``);
      }

      const tracker = await create8BitProgressTracker({ ctx, reply, title: 'UNIVERSAL DL' });

      // Deteksi TikTok
      if (/tiktok\.com/i.test(url)) {
        try {
          const result = await downloadTikTokVideo(url);
          await tracker.finish('TIKTOK READY');
          return await sock.sendMessage(jid, {
            video: result.videoBuffer,
            caption: `[UNIVERSAL DOWNLOADER: TIKTOK]\n\n• Kreator: ${result.author}\n• Judul: ${result.title.slice(0, 100)}`,
            mimetype: 'video/mp4',
          });
        } catch {
          // Fallback ke yt-dlp jika TikWM gagal
        }
      }

      try {
        let targetUrl = url;
        if (/pin\.it/i.test(url)) {
          try {
            const headRes = await fetch(url, {
              redirect: 'follow',
              headers: { 'User-Agent': 'Mozilla/5.0' },
              signal: AbortSignal.timeout(8000),
            });
            if (headRes.url) targetUrl = headRes.url;
          } catch {}
        }

        const media = await downloadWithYtDlp(targetUrl, { audio: false });
        await tracker.finish('MEDIA READY');

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
        await tracker.fail(err.message);
        await reply(`[!] Gagal memproses media dari tautan tersebut: ${err.message}`);
      }
    },
  });
}
