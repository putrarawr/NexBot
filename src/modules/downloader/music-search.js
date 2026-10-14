import { exec, execSync } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { InputFile } from 'grammy';
import { logger } from '../../utils/logger.js';

const execAsync = promisify(exec);
const MUSIC_SELECTION_TTL = 10 * 60 * 1000;
const selections = new Map();
const selectionTokensByOwner = new Map();

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function ownerKey(platform, chatId, userId) {
  return `${platform}:${chatId}:${userId}`;
}

function createToken() {
  return Math.random().toString(36).slice(2, 10);
}

function clearSelection(token) {
  const selection = selections.get(token);
  if (!selection) return;
  clearTimeout(selection.timer);
  selections.delete(token);
  const key = ownerKey(selection.platform, selection.chatId, selection.userId);
  if (selectionTokensByOwner.get(key) === token) selectionTokensByOwner.delete(key);
}

export function createMusicSelection(platform, chatId, userId, candidates) {
  const key = ownerKey(platform, chatId, userId);
  const previousToken = selectionTokensByOwner.get(key);
  if (previousToken) clearSelection(previousToken);

  let token = createToken();
  while (selections.has(token)) token = createToken();

  const timer = setTimeout(() => clearSelection(token), MUSIC_SELECTION_TTL);
  selections.set(token, { platform, chatId: String(chatId), userId: String(userId), candidates, timer });
  selectionTokensByOwner.set(key, token);
  return token;
}

export function getMusicSelection({ token, platform, chatId, userId }) {
  const resolvedToken = token || selectionTokensByOwner.get(ownerKey(platform, chatId, userId));
  const selection = resolvedToken ? selections.get(resolvedToken) : null;
  if (!selection) return null;

  if (
    selection.platform !== platform ||
    selection.chatId !== String(chatId) ||
    selection.userId !== String(userId)
  ) {
    return null;
  }

  return { token: resolvedToken, ...selection };
}

export function consumeMusicSelection({ token, platform, chatId, userId, index }) {
  const selection = getMusicSelection({ token, platform, chatId, userId });
  if (!selection) return null;
  const candidate = selection.candidates[index];
  if (!candidate) return null;
  clearSelection(selection.token);
  return candidate;
}

export function cancelMusicSelection({ token, platform, chatId, userId }) {
  const selection = getMusicSelection({ token, platform, chatId, userId });
  if (selection) clearSelection(selection.token);
}

export async function searchMusicTracks(query, limit = 5) {
  const cleanQuery = String(query || '').trim();
  if (!cleanQuery) return [];

  const safeLimit = Math.min(Math.max(Number(limit) || 5, 1), 5);
  const printTemplate = '%(id)s\t%(title)s\t%(channel)s\t%(uploader)s\t%(duration_string)s\t%(webpage_url)s';
  const searchTarget = `ytsearch${safeLimit}:${cleanQuery}`;
  const cmd = [
    'yt-dlp',
    '--flat-playlist',
    '--skip-download',
    '--no-warnings',
    '--playlist-end',
    String(safeLimit),
    '--print',
    shellQuote(printTemplate),
    shellQuote(searchTarget),
  ].join(' ');

  try {
    const { stdout } = await execAsync(cmd, { timeout: 30000, maxBuffer: 1024 * 1024 });
    return stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const fields = line.split('\t');
        const id = fields[0] && fields[0] !== 'NA' ? fields[0] : '';
        const urlField = fields.at(-1);
        const duration = fields.at(-2);
        const uploader = fields.at(-3);
        const channel = fields.at(-4);
        const title = fields.slice(1, -4).join('\t').trim() || fields[1] || 'Untitled';
        const url = urlField && urlField !== 'NA'
          ? urlField
          : id
            ? `https://www.youtube.com/watch?v=${id}`
            : '';

        return {
          id,
          url,
          title: title.trim(),
          artist: (channel !== 'NA' && channel) || (uploader !== 'NA' && uploader) || 'Unknown Artist',
          duration: duration !== 'NA' ? duration : '',
          thumbnail: id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null,
        };
      })
      .filter((candidate) => candidate.url && candidate.title)
      .slice(0, safeLimit);
  } catch (err) {
    logger.warn('Music metadata search failed:', err.message);
    throw new Error('Pencarian lagu gagal atau layanan sedang tidak tersedia.');
  }
}

async function safeUnlink(...filePaths) {
  for (const filePath of filePaths) {
    if (filePath && fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch {}
    }
  }
}

function getCookieArgs() {
  if (process.env.YT_COOKIES || process.env.YOUTUBE_COOKIES) {
    const raw = (process.env.YT_COOKIES || process.env.YOUTUBE_COOKIES).trim();
    if (raw) {
      const cookiePath = path.join(os.tmpdir(), 'yt_cookies.txt');
      try {
        fs.writeFileSync(cookiePath, raw, 'utf8');
        return `--cookies ${shellQuote(cookiePath)} `;
      } catch {}
    }
  }
  const candidateFiles = [
    path.join(process.cwd(), 'cookies.txt'),
    path.join(process.cwd(), 'data', 'cookies.txt'),
  ];
  for (const cf of candidateFiles) {
    if (fs.existsSync(cf)) {
      return `--cookies ${shellQuote(cf)} `;
    }
  }
  return '';
}

function getProxyArgs() {
  const proxy = process.env.YT_PROXY || process.env.HTTP_PROXY || process.env.HTTPS_PROXY;
  if (proxy && proxy.trim()) {
    return `--proxy ${shellQuote(proxy.trim())} `;
  }
  return '';
}

export async function downloadMusicTrack(target, metadata = {}) {
  let searchTerm = String(target || '').replace(/\0/g, ' ').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').trim();
  if (metadata.title) metadata.title = String(metadata.title).replace(/\0/g, ' ').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').trim();
  if (metadata.artist) metadata.artist = String(metadata.artist).replace(/\0/g, ' ').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').trim();
  let spotifyMeta = null;
  let itunesMeta = null;
  const isSpotifyUrl = /spotify\.com\/track\/[a-zA-Z0-9]+/i.test(searchTerm);
  const isDirectMediaUrl = /^https?:\/\//i.test(searchTerm) && !isSpotifyUrl;

  if (isSpotifyUrl) {
    try {
      const oembedRes = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(searchTerm)}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (oembedRes.ok) {
        spotifyMeta = await oembedRes.json();
        if (spotifyMeta.title) searchTerm = spotifyMeta.title;
      }
    } catch {}
  } else {
    // Ambil metadata & HD album art resmi dari Apple / iTunes
    const cleanSearch = (metadata.title || searchTerm).replace(/https?:\/\/\S+/g, '').trim();
    if (cleanSearch) {
      try {
        const itunesRes = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(cleanSearch)}&entity=song&limit=1`, {
          signal: AbortSignal.timeout(3500),
        });
        if (itunesRes.ok) {
          const itunesJson = await itunesRes.json();
          if (itunesJson.results && itunesJson.results.length > 0) {
            itunesMeta = itunesJson.results[0];
          }
        }
      } catch (err) {
        logger.debug('iTunes album art fetch fallback:', err.message);
      }
    }
  }

  const isGenericSearch = !isDirectMediaUrl;
  if (metadata.targetDuration && isGenericSearch) {
    try {
      const safeDuration = Number(metadata.targetDuration);
      const cleanTerm = searchTerm.replace(/^(ytsearch\d*:|scsearch\d*:)/i, '').replace(/\baudio\b/gi, '').trim();
      const searchTargetCand = `ytsearch10:${cleanTerm} audio`;
      const printTemplate = '%(id)s\t%(duration)s\t%(title)s\t%(channel)s';
      const candCmd = `yt-dlp ${getCookieArgs()}${getProxyArgs()}--flat-playlist --skip-download --no-warnings --extractor-args "youtube:player_client=android_creator,android,ios,web" ${shellQuote(searchTargetCand)} --print ${shellQuote(printTemplate)}`;
      const { stdout: candOut } = await execAsync(candCmd, { timeout: 20000 });
      const candLines = candOut.split(/\r?\n/).filter(Boolean);
      let bestId = null;
      let highestScore = -Infinity;

      const unwantedRegex = /\b(instrumental|karaoke|backing track|beat only|off vocal|minus one|no vocal|violin|piano cover|guitar cover|remake|reprod|sped up|slowed|reverb|8d audio|nightcore|live|concert|parody|parodi|remix|dj)\b/i;
      const userWantsSpecial = unwantedRegex.test(cleanTerm);

      for (const line of candLines) {
        const parts = line.split('\t');
        const id = parts[0];
        const durStr = parts[1];
        const title = parts[2] || '';
        const channel = parts[3] || '';
        const d = parseFloat(durStr);
        if (id && !isNaN(d) && d > 0) {
          // Abaikan video pendek jika lagu aslinya berdurasi panjang
          if (safeDuration >= 60 && d < 45) continue;

          // Abaikan versi instrumental/karaoke jika pengguna tidak memintanya
          if (!userWantsSpecial && unwantedRegex.test(title)) {
            continue;
          }

          let score = 50;
          const diff = Math.abs(d - safeDuration);

          // Presisi durasi sangat penting agar intro audio persis sama dengan timestamp lirik studio
          if (diff <= 1.5) score += 60;
          else if (diff <= 3.0) score += 45;
          else if (diff <= 6.0) score += 20;
          else if (diff <= 12.0) score -= 10;
          else score -= 55;

          // Prioritaskan channel resmi YouTube Music (- Topic) & Official Audio studio
          if (/- topic$/i.test(channel.trim())) {
            score += 85;
          }
          if (/official audio|album version|\b(audio)\b|official lyric/i.test(title)) {
            score += 45;
          }

          // Beri penalti kuat pada Official Music Video (MV) karena hampir selalu memiliki intro cerita/skit/hening/dialog
          if (/official (music )?video|\bm\/?v\b|video klip|music video/i.test(title) && !/official audio/i.test(title)) {
            score -= 65;
          }

          if (metadata.artist) {
            const normArtist = metadata.artist.replace(/[^a-z0-9]/gi, '').toLowerCase();
            const normTitleChan = `${title} ${channel}`.replace(/[^a-z0-9]/gi, '').toLowerCase();
            const artistTokens = metadata.artist.toLowerCase().split(/[\s,&/]+/).filter((t) => t.length > 2 && !['feat', 'featuring', 'with'].includes(t));
            if ((normArtist && normTitleChan.includes(normArtist)) || artistTokens.some((t) => normTitleChan.includes(t))) {
              score += 25;
            }
          }

          if (score > highestScore) {
            highestScore = score;
            bestId = id;
          }
        }
      }
      if (bestId && highestScore > 0) {
        searchTerm = `https://www.youtube.com/watch?v=${bestId}`;
      }
    } catch (e) {
      logger.debug('Target duration candidate lookup fallback:', e.message);
    }
  }

  const rand = Math.random().toString(36).slice(2, 8);
  const outTemplate = path.join(os.tmpdir(), `spot_${Date.now()}_${rand}.%(ext)s`);
  const resolvedSearchPrefixed = /^(https?:\/\/|ytsearch\d*:|scsearch\d*:)/i.test(searchTerm);
  const searchTarget = resolvedSearchPrefixed
    ? searchTerm
    : `ytsearch1:${searchTerm.replace(/\baudio\s*$/i, '').trim()} official audio`;
  const baseArgs = `--no-warnings --no-playlist --playlist-items 1 -f "ba[ext=m4a]/ba[ext=mp3]/ba/b/best" -x --audio-format mp3 --audio-quality 4 --max-filesize 45M -o "${outTemplate}"`;
  const directArgs = '--js-runtimes node --extractor-args "youtube:player_client=ios,mweb,android,web" ';
  const cmd = `yt-dlp ${getCookieArgs()}${getProxyArgs()}${directArgs}${baseArgs} ${shellQuote(searchTarget)}`;

  try {
    await execAsync(cmd, { timeout: 55000 });
  } catch (err) {
    logger.warn('Primary music download failed, trying YouTube fallback:', err.message);
    const cleanTerm = searchTerm.replace(/^(https?:\/\/[^\s]+|ytsearch\d*:|scsearch\d*:)/i, '').trim();
    const fallbackTitle = metadata.title && metadata.artist ? `${metadata.artist} ${metadata.title}` : (metadata.title || cleanTerm || searchTerm);
    const cleanFallback = fallbackTitle
      .replace(/\s*[\(\[](?:feat|ft|with|prod|remaster|version|refix|remix|edit|mix)\b.*?[\]\)]/gi, '')
      .replace(/^https?:\/\/[^\s]+/i, '')
      .trim() || cleanTerm;
    const fallbackCmd = `yt-dlp ${getCookieArgs()}${getProxyArgs()}${directArgs}${baseArgs} ${shellQuote(`ytsearch1:${cleanFallback} official audio`)}`;
    let youtubeOk = false;
    try {
      await execAsync(fallbackCmd, { timeout: 45000 });
      youtubeOk = true;
    } catch {
      try {
        const rawYtCmd = `yt-dlp ${getCookieArgs()}${getProxyArgs()}${baseArgs} ${shellQuote(`ytsearch1:${cleanFallback} audio`)}`;
        await execAsync(rawYtCmd, { timeout: 40000 });
        youtubeOk = true;
      } catch {}
    }

    if (!youtubeOk) {
      logger.warn('YouTube fallback failed, trying SoundCloud fallback');
      const cleanScFallback = cleanFallback.replace(/[&,]/g, ' ').replace(/\s+/g, ' ').trim();
      let scTarget = `scsearch1:${cleanScFallback}`;
      if (metadata.targetDuration && Number(metadata.targetDuration) >= 60) {
        try {
          const safeDur = Number(metadata.targetDuration);
          const scCandCmd = `yt-dlp ${getProxyArgs()}--flat-playlist --skip-download --no-warnings ${shellQuote(`scsearch5:${cleanScFallback}`)} --print "%(url)s\t%(duration)s\t%(title)s"`;
          const { stdout: scOut } = await execAsync(scCandCmd, { timeout: 15000 });
          const scLines = scOut.split(/\r?\n/).filter(Boolean);
          let bestScUrl = null;
          let minDiff = Infinity;
          for (const line of scLines) {
            const [url, durStr] = line.split('\t');
            const d = parseFloat(durStr);
            // Abaikan preview klip pendek 30s di SoundCloud jika lagu berdurasi panjang
            if (url && !isNaN(d) && d >= 50) {
              const diff = Math.abs(d - safeDur);
              if (diff < minDiff && diff <= 45) {
                minDiff = diff;
                bestScUrl = url;
              }
            }
          }
          if (bestScUrl) {
            scTarget = bestScUrl;
          }
        } catch {}
      }

      const scCmd = `yt-dlp ${getProxyArgs()}--no-warnings --no-playlist --playlist-items 1 -f "ba/b" -x --audio-format mp3 --audio-quality 4 -o "${outTemplate}" ${shellQuote(scTarget)}`;
      try {
        await execAsync(scCmd, { timeout: 30000 });
      } catch (scErr) {
        logger.warn('Primary SoundCloud fallback failed, trying simplified title:', scErr.message);
        const simpleTitle = (metadata.title || cleanTerm).replace(/[&,]/g, ' ').replace(/\s+/g, ' ').trim();
        const altScCmd = `yt-dlp ${getProxyArgs()}--no-warnings --no-playlist --playlist-items 1 -f "ba/b" -x --audio-format mp3 --audio-quality 4 -o "${outTemplate}" ${shellQuote(`scsearch1:${simpleTitle}`)}`;
        try {
          await execAsync(altScCmd, { timeout: 25000 });
        } catch (altScErr) {
          logger.warn('SoundCloud fallback failed completely:', altScErr.message);
          throw new Error('Gagal mengunduh audio lagu dari YouTube/SoundCloud (koneksi dibatasi penyedia atau audio dilindungi hak cipta).');
        }
      }
    }
  }

  const files = fs.readdirSync(os.tmpdir()).filter((file) => file.startsWith('spot_') && file.includes(rand));
  if (files.length === 0) throw new Error('File audio tidak ditemukan.');

  const downloadedFile = files.find((f) => f.endsWith('.mp3')) || files.find((f) => !f.endsWith('.part') && !f.endsWith('.ytdl')) || files[0];
  const downloadedPath = path.join(os.tmpdir(), downloadedFile);
  const stat = fs.statSync(downloadedPath);
  if (stat.size < 50000) {
    await safeUnlink(...files.map((f) => path.join(os.tmpdir(), f)));
    throw new Error('File audio yang diunduh tidak lengkap atau rusak.');
  }

  if (metadata.targetDuration && Number(metadata.targetDuration) >= 60) {
    try {
      const probeOut = execSync(`ffprobe -v error -show_entries format=duration:stream=duration -of default=noprint_wrappers=1:nokey=1 "${downloadedPath}"`, { timeout: 10000 }).toString();
      const durList = probeOut.split(/\r?\n/).map((l) => parseFloat(l.trim())).filter((d) => !isNaN(d) && d > 0);
      const measuredDur = durList.length > 0 ? Math.max(...durList) : 0;
      if (measuredDur > 0 && measuredDur < 45) {
        await safeUnlink(...files.map((f) => path.join(os.tmpdir(), f)));
        throw new Error('File audio yang diunduh adalah klip preview berdurasi terlalu pendek.');
      }
    } catch (probeErr) {
      if (probeErr.message.includes('preview')) throw probeErr;
    }
  }

  const buffer = fs.readFileSync(downloadedPath);
  await safeUnlink(...files.map((f) => path.join(os.tmpdir(), f)));

  const resolvedTitle = metadata.title || spotifyMeta?.title || itunesMeta?.trackName || searchTerm;
  const resolvedArtist = metadata.artist || spotifyMeta?.author_name || itunesMeta?.artistName || 'Spotify Music';
  const resolvedThumbnail =
    spotifyMeta?.thumbnail_url ||
    itunesMeta?.artworkUrl100?.replace('100x100bb', '600x600bb') ||
    metadata.thumbnail ||
    (metadata.id ? `https://i.ytimg.com/vi/${metadata.id}/hqdefault.jpg` : null);

  const resolvedSourceUrl = isSpotifyUrl
    ? searchTerm
    : (itunesMeta?.trackViewUrl || metadata.url || `https://open.spotify.com/search/${encodeURIComponent(`${resolvedTitle} ${resolvedArtist}`)}`);

  return {
    title: resolvedTitle,
    artist: resolvedArtist,
    thumbnail: resolvedThumbnail,
    sourceUrl: resolvedSourceUrl,
    buffer,
    size: stat.size,
  };
}

export async function sendMusicAudio({ platform, ctx, sock, jid, track }) {
  const title = String(track.title || 'Lagu').slice(0, 120);
  const artist = String(track.artist || 'Unknown Artist').slice(0, 80);
  const sourceUrl = track.sourceUrl || `https://open.spotify.com/search/${encodeURIComponent(`${title} ${artist}`)}`;

  // Download thumbnail buffer jika tersedia untuk cover art
  let coverBuffer = null;
  if (track.thumbnail) {
    try {
      const coverRes = await fetch(track.thumbnail, { signal: AbortSignal.timeout(6000) });
      if (coverRes.ok) {
        coverBuffer = Buffer.from(await coverRes.arrayBuffer());
      }
    } catch (err) {
      logger.debug('Gagal download cover album music:', err.message);
    }
  }

  // 1. Respon Telegram
  if (platform === 'telegram' && ctx?.replyWithAudio) {
    const caption = `<b>🎵 [ SPOTIFY MUSIC ]</b>\n\n` +
                    `<b>${title}</b>\n` +
                    `<i>${artist}</i>\n\n` +
                    `<a href="${sourceUrl}">Buka di Spotify</a>`;

    const audioOpts = {
      title,
      performer: artist,
      caption,
      parse_mode: 'HTML',
    };
    if (coverBuffer) {
      audioOpts.thumbnail = new InputFile(coverBuffer, 'cover.jpg');
    }

    return ctx.replyWithAudio(
      new InputFile(track.buffer, `${title.replace(/[^a-z0-9 _-]/gi, '').trim() || 'audio'}.mp3`),
      audioOpts
    );
  }

  // 2. Respon WhatsApp (Rich Message Spotify Player Card via externalAdReply)
  const messagePayload = {
    audio: track.buffer,
    mimetype: 'audio/mp4',
    fileName: `${title.replace(/[\\/:*?"<>|]/g, '').trim() || 'audio'}.mp3`,
    ptt: false,
    contextInfo: {
      externalAdReply: {
        title: title,
        body: `${artist} • Spotify`,
        mediaType: 1,
        sourceUrl: sourceUrl,
        renderLargerThumbnail: true, // ⭐ Tampilan banner album art besar di WhatsApp
        showAdAttribution: true,
      },
    },
  };

  if (coverBuffer) {
    messagePayload.contextInfo.externalAdReply.thumbnail = coverBuffer;
  }

  return sock.sendMessage(jid, messagePayload);
}
