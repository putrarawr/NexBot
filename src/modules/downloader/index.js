import { registerCommand } from '../../bot/handler.js';
import { logger } from '../../utils/logger.js';

export async function downloadTikTokVideo(tiktokUrl) {
  // Bersihkan URL dari parameter tracking
  const cleanUrl = tiktokUrl.trim();

  // API 1: TikWM (No Watermark)
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

  // Unduh buffer video (batas maksimal 25 MB agar tidak boros RAM)
  const videoRes = await fetch(videoUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(25000),
  });

  const contentLength = Number(videoRes.headers.get('content-length') || 0);
  if (contentLength > 25 * 1024 * 1024) {
    throw new Error('Ukuran video terlalu besar (> 25 MB) untuk dikirim langsung via WhatsApp.');
  }

  const videoBuffer = Buffer.from(await videoRes.arrayBuffer());

  return {
    title: json.data.title || 'TikTok Video',
    author: json.data.author?.nickname || json.data.author?.unique_id || 'User',
    duration: json.data.duration || 0,
    videoBuffer,
  };
}

export function registerDownloaderCommands() {
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
        return reply(`⚠️ Masukkan tautan video TikTok!\nContoh: \`${prefix}tiktok https://vt.tiktok.com/xxxxxx/\``);
      }

      await reply('⏳ _Sedang mengunduh video TikTok tanpa watermark..._');

      try {
        const result = await downloadTikTokVideo(url);

        let caption = `🎬 *TIKTOK DOWNLOADER*\n\n`;
        caption += `👤 *Kreator:* ${result.author}\n`;
        caption += `⏱️ *Durasi:* ${result.duration}s\n`;
        if (result.title) {
          caption += `📝 *Deskripsi:* ${result.title.slice(0, 150)}\n\n`;
        }
        caption += `✨ _Unduhan berhasil tanpa watermark!_`;

        await sock.sendMessage(jid, {
          video: result.videoBuffer,
          caption,
          mimetype: 'video/mp4',
        });
      } catch (err) {
        logger.error('Error saat download TikTok:', err.message);
        await reply(`❌ Gagal mengunduh TikTok: ${err.message}`);
      }
    },
  });
}
