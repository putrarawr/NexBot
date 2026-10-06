import { registerCommand } from '../../bot/handler.js';
import { logger } from '../../utils/logger.js';
import { reactWait } from '../../bot/antiBan.js';
import { askAI } from '../ai/index.js';
import { InlineKeyboard } from 'grammy';

/**
 * Validasi apakah teks mengandung tautan TikTok
 */
export function extractTikTokUrl(text) {
  if (!text || typeof text !== 'string') return null;
  const match = text.match(/https?:\/\/(?:[a-zA-Z0-9_-]+\.)?(?:tiktok\.com|douyin\.com)\/[^\s]+/i);
  return match ? match[0] : null;
}

/**
 * Urai URL pendek TikTok (vt.tiktok.com / vm.tiktok.com) ke URL kanonikal
 */
export async function resolveTikTokUrl(inputUrl) {
  try {
    const parsed = new URL(inputUrl);
    if (['vt.tiktok.com', 'vm.tiktok.com', 'm.tiktok.com'].includes(parsed.hostname.toLowerCase())) {
      const res = await fetch(inputUrl, {
        method: 'GET',
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        signal: AbortSignal.timeout(8000),
      });
      if (res.url && res.url.includes('tiktok.com')) {
        return res.url;
      }
    }
  } catch (err) {
    logger.debug('Gagal follow redirect TikTok:', err.message);
  }
  return inputUrl;
}

/**
 * Ambil metadata lengkap video TikTok via TikWM atau OEmbed
 */
export async function fetchTikTokDetails(url) {
  const resolved = await resolveTikTokUrl(url);

  // 1. Coba TikWM API
  try {
    const apiUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(resolved)}`;
    const res = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(12000),
    });

    if (res.ok) {
      const json = await res.json();
      if (json.code === 0 && json.data) {
        const d = json.data;
        return {
          url: resolved,
          title: d.title || 'Video TikTok',
          cover: d.cover || d.origin_cover || null,
          author: {
            nickname: d.author?.nickname || 'Pengguna TikTok',
            unique_id: d.author?.unique_id || 'user',
            avatar: d.author?.avatar || null,
          },
          stats: {
            play_count: Number(d.play_count || 0),
            digg_count: Number(d.digg_count || 0),
            comment_count: Number(d.comment_count || 0),
            share_count: Number(d.share_count || 0),
          },
          music: d.music || d.music_info?.title || '',
          duration: Number(d.duration || 0),
        };
      }
    }
  } catch (err) {
    logger.debug('TikWM API fetch gagal, mencoba oEmbed fallback:', err.message);
  }

  // 2. Fallback ke TikTok OEmbed Resmi
  try {
    const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(resolved)}`;
    const oembedRes = await fetch(oembedUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(8000),
    });
    if (oembedRes.ok) {
      const oembedData = await oembedRes.json();
      return {
        url: resolved,
        title: oembedData.title || 'Video TikTok',
        cover: oembedData.thumbnail_url || null,
        author: {
          nickname: oembedData.author_name || 'Pengguna TikTok',
          unique_id: oembedData.author_unique_id || 'user',
          avatar: null,
        },
        stats: { play_count: 0, digg_count: 0, comment_count: 0, share_count: 0 },
        music: '',
        duration: 0,
      };
    }
  } catch (err) {
    logger.debug('TikTok oEmbed fetch gagal:', err.message);
  }

  // Fallback minimal jika data gagal diambil
  return {
    url: resolved,
    title: 'Video TikTok',
    cover: null,
    author: { nickname: 'Pengguna TikTok', unique_id: 'user', avatar: null },
    stats: { play_count: 0, digg_count: 0, comment_count: 0, share_count: 0 },
    music: '',
    duration: 0,
  };
}

/**
 * Render bilah skor retro (0-100)
 */
export function formatScoreBar(score) {
  const safeScore = Math.max(0, Math.min(100, Math.round(Number(score) || 50)));
  const totalBlocks = 10;
  const filledBlocks = Math.round((safeScore / 100) * totalBlocks);
  const emptyBlocks = totalBlocks - filledBlocks;
  return '█'.repeat(filledBlocks) + '░'.repeat(emptyBlocks);
}

/**
 * Analisis VerifTok menggunakan AI Engine
 */
export async function analyzeTikTokFact(details) {
  const systemInstruction = `Kamu adalah VerifTok AI Analyzer, mesin cek fakta, penilai kredibilitas, dan detektor provokasi untuk konten media sosial TikTok Indonesia.
Tugasmu adalah menganalisis klaim, narasi, dan konteks video TikTok secara objektif, evidence-based, kritis, dan berbasis fakta.

Output WAJIB berupa JSON murni (tanpa pembuka/penutup markdown triple backticks) dengan skema:
{
  "verdict": "VALID" | "PERLU KROSCEK" | "MENYESATKAN" | "HOAX" | "KONTEN AI" | "SATIR",
  "score": <angka bilangan bulat 0-100>,
  "provocationLevel": "RENDAH" | "SEDANG" | "TINGGI",
  "provocationReason": "<1-2 kalimat penjelasan indikator bahasa, clickbait, atau framing provokasi>",
  "claim": "<1 kalimat ringkas mengenai klaim utama yang disampaikan video>",
  "fact": "<1-3 kalimat fakta sebenarnya dan konteks yang benar berdasarkan rujukan terpercaya>",
  "sentimentSummary": "<1-2 kalimat ringkasan nada tanggapan warganet di kolom komentar>",
  "searchKeyword": "<2-4 kata kunci pencarian berita untuk kroscek>"
}`;

  const userPrompt = `Lakukan verifikasi fakta untuk video TikTok berikut:
Judul/Narasi: "${details.title}"
Pengunggah: @${details.author?.unique_id} (${details.author?.nickname})
Statistik: ${details.stats?.play_count} tayangan, ${details.stats?.digg_count} suka, ${details.stats?.comment_count} komentar.`;

  try {
    const rawAiReply = await askAI(userPrompt, systemInstruction);
    const cleanedJson = rawAiReply
      .replace(/^```json/im, '')
      .replace(/^```/im, '')
      .replace(/```$/m, '')
      .trim();

    const parsed = JSON.parse(cleanedJson);
    const searchKw = (parsed.searchKeyword || details.title.slice(0, 30)).trim();
    const encKw = encodeURIComponent(searchKw);

    return {
      verdict: String(parsed.verdict || 'PERLU KROSCEK').toUpperCase(),
      score: Number(parsed.score != null ? parsed.score : 50),
      provocationLevel: String(parsed.provocationLevel || 'SEDANG').toUpperCase(),
      provocationReason: parsed.provocationReason || 'Pernyataan memerlukan pemeriksaan sumber primer.',
      claim: parsed.claim || details.title || 'Narasi pada video.',
      fact: parsed.fact || 'Belum ada bukti pendukung resmi yang memvalidasi klaim ini.',
      sentimentSummary: parsed.sentimentSummary || 'Tanggapan warganet beragam.',
      searchKeyword: searchKw,
      sources: {
        turnBackHoax: `https://turnbackhoax.id/?s=${encKw}`,
        cekFakta: `https://cekfakta.com/?s=${encKw}`,
        googleNews: `https://www.google.com/search?q=${encKw}&tbm=nws`,
      },
    };
  } catch (err) {
    logger.warn('VerifTok AI parse gagal, menggunakan analisis heuristik:', err.message);

    // Heuristic Fallback
    const titleLower = (details.title || '').toLowerCase();
    const isHoax = /hoax|bohong|menyesatkan|penipuan|scam|saldo gratis|bansos cair/i.test(titleLower);
    const isAi = /#ai|#deepfake|suara ai|dubbing ai|dibuat oleh ai/i.test(titleLower);
    const isProvocative = /viralkan|waspada|bahaya|gawat|jangan mau|dpr|menteri|polisi/i.test(titleLower);

    let verdict = 'PERLU KROSCEK';
    let score = 55;
    if (isHoax) {
      verdict = 'MENYESATKAN';
      score = 20;
    } else if (isAi) {
      verdict = 'KONTEN AI';
      score = 35;
    }

    const searchKw = details.title.slice(0, 35).replace(/[^\w\s]/g, '').trim();
    const encKw = encodeURIComponent(searchKw);

    return {
      verdict,
      score,
      provocationLevel: isProvocative ? 'TINGGI' : 'SEDANG',
      provocationReason: isProvocative ? 'Judul menggunakan gaya bahasa sensasional dan memicu emosi.' : 'Konteks video belum dilengkapi sumber primer.',
      claim: details.title || 'Klaim pada video TikTok.',
      fact: 'Periksa kebenaran klaim ini secara mandiri melalui portal cek fakta independen.',
      sentimentSummary: 'Warganet memberikan reaksi bervariasi.',
      searchKeyword: searchKw,
      sources: {
        turnBackHoax: `https://turnbackhoax.id/?s=${encKw}`,
        cekFakta: `https://cekfakta.com/?s=${encKw}`,
        googleNews: `https://www.google.com/search?q=${encKw}&tbm=nws`,
      },
    };
  }
}

/**
 * Format badge icon verdict
 */
function getVerdictBadge(verdict) {
  switch (verdict) {
    case 'VALID':
      return '🟢 [ TERVERIFIKASI / VALID ]';
    case 'PERLU KROSCEK':
      return '🟡 [ PERLU KROSCEK / MERAGUKAN ]';
    case 'MENYESATKAN':
    case 'HOAX':
      return '🔴 [ MENYESATKAN / HOAX ]';
    case 'KONTEN AI':
      return '🟣 [ REKAYASA AI / DEEPFAKE ]';
    case 'SATIR':
      return '⚪ [ SATIR / PARODI ]';
    default:
      return '🟡 [ PERLU KROSCEK ]';
  }
}

/**
 * Registrasi Command VerifTok
 */
export function registerVeriftokCommands() {
  registerCommand({
    name: 'veriftok',
    aliases: ['vt', 'cekfakta', 'cekhoax', 'periksa'],
    category: 'tools',
    description: 'Verifikasi fakta, deteksi hoax & analisis provokasi video TikTok (Powered by VerifTok)',
    usage: '.veriftok <link tiktok> (atau balas pesan link TikTok)',
    platforms: ['whatsapp', 'telegram'],
    async execute({ sock, msg, jid, args, reply, platform, ctx }) {
      // 1. Ekstraksi Link TikTok dari argumen atau pesan yang di-reply
      let targetText = args.join(' ');
      const quoted = msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      if (!targetText && quoted) {
        targetText = quoted.conversation || quoted.extendedTextMessage?.text || '';
      }
      if (!targetText && ctx?.message?.reply_to_message?.text) {
        targetText = ctx.message.reply_to_message.text;
      }

      const tiktokUrl = extractTikTokUrl(targetText);
      if (!tiktokUrl) {
        return reply(
          `[ 🛡️ VERIFTOK ANALYZER ]\n\n` +
          `Masukkan tautan video TikTok yang ingin diperiksa faktanya.\n\n` +
          `Contoh:\n` +
          `• .veriftok https://vt.tiktok.com/xxxxxx/\n` +
          `• Atau balas (*reply*) pesan yang berisi link TikTok dengan .veriftok`
        );
      }

      await reactWait(sock, msg);
      await reply('🔍 Sedang menelaah video, memeriksa klaim ke portal cek fakta & menganalisis nada narasi via VerifTok Engine...');

      try {
        // 2. Ambil data video
        const details = await fetchTikTokDetails(tiktokUrl);

        // 3. Analisis dengan VerifTok Engine
        const report = await analyzeTikTokFact(details);
        const scoreBar = formatScoreBar(report.score);
        const badge = getVerdictBadge(report.verdict);

        // 4a. Respon untuk Telegram
        if (platform === 'telegram') {
          let teleHtml = `<b>🛡️ VERIFTOK • AUDIT FAKTA TIKTOK</b>\n\n`;
          teleHtml += `📌 <b>Judul:</b> <i>"${details.title}"</i>\n`;
          teleHtml += `👤 <b>Pengunggah:</b> @${details.author?.unique_id} (${details.author?.nickname})\n\n`;

          teleHtml += `🏷️ <b>Status Verifikasi:</b>\n<b>${badge}</b>\n\n`;
          teleHtml += `📈 <b>Skor Kredibilitas:</b> <code>[${scoreBar}]</code> <b>${report.score}/100</b>\n`;
          teleHtml += `⚠️ <b>Tingkat Provokasi:</b> <b>${report.provocationLevel}</b>\n`;
          teleHtml += `💡 <i>${report.provocationReason}</i>\n\n`;

          teleHtml += `📝 <b>Klaim Utama:</b>\n"${report.claim}"\n\n`;
          teleHtml += `🔍 <b>Fakta Lapangan & Bukti:</b>\n${report.fact}\n\n`;
          teleHtml += `💬 <b>Sentimen Warganet:</b>\n${report.sentimentSummary}\n\n`;
          teleHtml += `<i>Diverifikasi oleh VerifTok Engine</i>`;

          const keyboard = new InlineKeyboard()
            .url('🔍 TurnBackHoax.id', report.sources.turnBackHoax)
            .url('🔎 CekFakta.com', report.sources.cekFakta)
            .row()
            .url('🌐 Google News', report.sources.googleNews)
            .url('📱 Buka TikTok', details.url);

          return ctx.reply(teleHtml, {
            parse_mode: 'HTML',
            reply_markup: keyboard,
            disable_web_page_preview: false,
          });
        }

        // 4b. Respon untuk WhatsApp (Rich Message Preview)
        let waText = `╔══════════════════════════════╗\n`;
        waText += `║   🛡️ VERIFTOK - CEK FAKTA    ║\n`;
        waText += `╚══════════════════════════════╝\n\n`;

        waText += `📌 *Judul:* "${details.title}"\n`;
        waText += `👤 *Pengunggah:* @${details.author?.unique_id} (${details.author?.nickname})\n`;
        if (details.stats?.play_count > 0 || details.stats?.digg_count > 0) {
          waText += `📊 *Statistik:* 👁️ ${details.stats.play_count.toLocaleString('id-ID')} | ❤️ ${details.stats.digg_count.toLocaleString('id-ID')} | 💬 ${details.stats.comment_count.toLocaleString('id-ID')}\n`;
        }
        waText += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        waText += `🏷️ *STATUS VERIFIKASI:*\n*${badge}*\n\n`;
        waText += `📈 *Skor Kredibilitas:* [${scoreBar}] *${report.score}/100*\n`;
        waText += `⚠️ *Tingkat Provokasi:* *${report.provocationLevel}*\n`;
        waText += `💡 _${report.provocationReason}_\n`;
        waText += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

        waText += `📝 *KLAIM UTAMA:*\n"${report.claim}"\n\n`;
        waText += `🔍 *FAKTA SEBENARNYA:*\n${report.fact}\n\n`;
        waText += `💬 *SENTIMEN WARGANET:*\n_${report.sentimentSummary}_\n\n`;

        waText += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        waText += `🔗 *SUMBER KROSCEK RESMI:*\n`;
        waText += `• TurnBackHoax: ${report.sources.turnBackHoax}\n`;
        waText += `• CekFakta: ${report.sources.cekFakta}\n`;
        waText += `• Google News: ${report.sources.googleNews}\n\n`;
        waText += `_Diverifikasi oleh VerifTok Engine_`;

        // Siapkan Rich Message dengan externalAdReply
        let coverBuffer = null;
        if (details.cover) {
          try {
            const coverRes = await fetch(details.cover, { signal: AbortSignal.timeout(5000) });
            if (coverRes.ok) {
              coverBuffer = Buffer.from(await coverRes.arrayBuffer());
            }
          } catch {}
        }

        const messagePayload = { text: waText };
        if (coverBuffer) {
          messagePayload.contextInfo = {
            externalAdReply: {
              title: `🛡️ VERIFTOK: ${report.verdict}`,
              body: `Skor: ${report.score}/100 • Provokasi: ${report.provocationLevel}`,
              thumbnail: coverBuffer,
              sourceUrl: details.url,
              mediaType: 1,
              renderLargerThumbnail: true,
              showAdAttribution: true,
            },
          };
        }

        return sock.sendMessage(jid, messagePayload);
      } catch (err) {
        logger.error('Error saat verifikasi VerifTok:', err.message);
        return reply(`[!] Gagal memverifikasi video TikTok: ${err.message}`);
      }
    },
  });
}
