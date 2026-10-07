import { exec } from 'node:child_process';
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

export async function downloadMusicTrack(target, metadata = {}) {
  let searchTerm = String(target || '').trim();
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
          signal: AbortSignal.timeout(6000),
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

  const rand = Math.random().toString(36).slice(2, 8);
  const outTemplate = path.join(os.tmpdir(), `spot_${Date.now()}_${rand}.%(ext)s`);
  const searchTarget = searchTerm.startsWith('http') ? searchTerm : `scsearch1:${searchTerm}`;
  const baseArgs = `--no-warnings --no-playlist --playlist-items 1 -f "bestaudio/best" -x --audio-format mp3 --audio-quality 0 --max-filesize 35M -o "${outTemplate}"`;
  const directArgs = isDirectMediaUrl ? '--extractor-args "youtube:player_client=android,web" ' : '';
  const cmd = `yt-dlp ${directArgs}${baseArgs} ${shellQuote(searchTarget)}`;

  try {
    await execAsync(cmd, { timeout: 60000 });
  } catch (err) {
    if (isDirectMediaUrl) {
      logger.warn('Direct music URL download failed, trying the candidate title:', err.message);
      const fallbackQuery = metadata.title || searchTerm;
      const fallbackCmd = `yt-dlp --extractor-args "youtube:player_client=android,web" ${baseArgs} ${shellQuote(`ytsearch1:${fallbackQuery}`)}`;
      try {
        await execAsync(fallbackCmd, { timeout: 60000 });
      } catch (fallbackErr) {
        logger.warn('Candidate title fallback failed:', fallbackErr.message);
        throw new Error('Lagu tidak ditemukan atau ukuran terlalu besar.');
      }
    } else {
      logger.warn('SoundCloud music download failed, trying YouTube fallback:', err.message);
      const ytCmd = `yt-dlp --extractor-args "youtube:player_client=android,web" ${baseArgs} ${shellQuote(`ytsearch1:${searchTerm}`)}`;
      try {
        await execAsync(ytCmd, { timeout: 60000 });
      } catch (ytErr) {
        logger.warn('YouTube music fallback failed:', ytErr.message);
        throw new Error('Lagu tidak ditemukan atau ukuran terlalu besar.');
      }
    }
  }

  const files = fs.readdirSync(os.tmpdir()).filter((file) => file.startsWith('spot_') && file.includes(rand));
  if (files.length === 0) throw new Error('File audio tidak ditemukan.');

  const downloadedPath = path.join(os.tmpdir(), files[0]);
  const stat = fs.statSync(downloadedPath);
  const buffer = fs.readFileSync(downloadedPath);
  await safeUnlink(downloadedPath);

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
