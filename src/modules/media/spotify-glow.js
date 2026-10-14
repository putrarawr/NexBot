import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { logger } from '../../utils/logger.js';
import { downloadMusicTrack } from '../downloader/music-search.js';
import {
  fetchSongLyricsWithSync,
  parseLrcLyrics,
  buildSyntheticLrcFromPlain,
  selectLrcWindow,
  parseReffParam,
  parseTimeSeconds,
} from './index.js';

const execAsync = promisify(exec);

export const SPOTIFY_GLOW_THEMES = {
  green: {
    id: 'green',
    name: 'Spotify Green',
    glowColor: '#1ed760',
    topGrad: '#131e17',
    midGrad: '#0e1410',
    botGrad: '#080a09',
    cardBg: '#18201a',
    cardBorder: '#26332a',
    mutedText: '#6f7b73',
    subText: '#9da8a0',
  },
  cyan: {
    id: 'cyan',
    name: 'Electric Cyan',
    glowColor: '#00f2fe',
    topGrad: '#0c1a24',
    midGrad: '#08121a',
    botGrad: '#050a0e',
    cardBg: '#101d26',
    cardBorder: '#1c3140',
    mutedText: '#5e7585',
    subText: '#91b0c4',
  },
  purple: {
    id: 'purple',
    name: 'Cyber Violet',
    glowColor: '#c084fc',
    topGrad: '#1d1229',
    midGrad: '#130b1c',
    botGrad: '#0b0610',
    cardBg: '#1e142b',
    cardBorder: '#35214d',
    mutedText: '#7b6891',
    subText: '#bfa7de',
  },
  pink: {
    id: 'pink',
    name: 'Neon Magenta',
    glowColor: '#f43f5e',
    topGrad: '#24101a',
    midGrad: '#170910',
    botGrad: '#0d0408',
    cardBg: '#26131c',
    cardBorder: '#451c2f',
    mutedText: '#875d71',
    subText: '#d49ab3',
  },
  gold: {
    id: 'gold',
    name: 'Sunset Gold',
    glowColor: '#fbbf24',
    topGrad: '#241c0e',
    midGrad: '#171107',
    botGrad: '#0d0903',
    cardBg: '#261d10',
    cardBorder: '#47361a',
    mutedText: '#877559',
    subText: '#d6be98',
  },
  blue: {
    id: 'blue',
    name: 'Deep Blue',
    glowColor: '#38bdf8',
    topGrad: '#0c1626',
    midGrad: '#070e1a',
    botGrad: '#04070e',
    cardBg: '#101c2e',
    cardBorder: '#1d3252',
    mutedText: '#5d7391',
    subText: '#93b1d9',
  },
  white: {
    id: 'white',
    name: 'Diamond White',
    glowColor: '#ffffff',
    topGrad: '#18191c',
    midGrad: '#101114',
    botGrad: '#0a0a0c',
    cardBg: '#1b1c21',
    cardBorder: '#2e3038',
    mutedText: '#727580',
    subText: '#b0b3bf',
  },
};

function escapeXml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatDuration(sec) {
  const safe = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function wrapLyricsText(text, maxChars = 28) {
  if (!text) return [];
  const words = text.trim().split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (!cur) {
      cur = w;
    } else if ((cur + ' ' + w).length <= maxChars) {
      cur = cur + ' ' + w;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

export function renderSpotifyGlowSvg({
  trackName = 'Unknown Track',
  artistName = 'Unknown Artist',
  segments = [],
  activeIndex = 0,
  currentTime = 0,
  windowStartTime = 0,
  windowDuration = 30,
  themeKey = 'green',
  width = 720,
  height = 720,
  scrollDy = 0,
}) {
  const theme = SPOTIFY_GLOW_THEMES[themeKey] || SPOTIFY_GLOW_THEMES.green;
  const isStory = height > width;

  // Header geometry
  const headerX = isStory ? 32 : 36;
  const headerY = isStory ? 48 : 32;
  const headerW = width - (headerX * 2);
  const headerH = 78;

  // Active Progress
  const elapsed = Math.max(0, currentTime - windowStartTime);
  const progressRatio = Math.min(1.0, Math.max(0, elapsed / Math.max(1, windowDuration)));
  const progressW = Math.max(8, (width - 108) * progressRatio);

  // Sound Bars Animation (cyclical pulse)
  const barHeights = [
    Math.round(14 + Math.sin(currentTime * 8) * 8),
    Math.round(24 + Math.sin(currentTime * 8 + 1.6) * 10),
    Math.round(18 + Math.sin(currentTime * 8 + 3.2) * 8),
    Math.round(26 + Math.sin(currentTime * 8 + 4.8) * 9),
  ];

  // Active segment
  const activeSeg = segments[activeIndex] || { text: '' };
  const prev1Seg = activeIndex > 0 ? segments[activeIndex - 1] : null;
  const prev2Seg = activeIndex > 1 ? segments[activeIndex - 2] : null;
  const next1Seg = activeIndex + 1 < segments.length ? segments[activeIndex + 1] : null;
  const next2Seg = activeIndex + 2 < segments.length ? segments[activeIndex + 2] : null;

  // Typography & Layout Coordinates
  const wrapLimit = isStory ? 22 : 28;
  const activeLines = wrapLyricsText(activeSeg.text, wrapLimit);
  const activeLineHeight = isStory ? 38 : 42;
  const activeBlockHeight = Math.max(1, activeLines.length) * activeLineHeight;

  // Center Y reference
  const centerY = (height / 2) + scrollDy;
  const activeStartY = centerY - (activeBlockHeight / 2) + 20;

  // Build Active Line Tspans
  const activeFontSize = isStory ? 28 : 32;
  const activeTspans = activeLines.map((line, idx) => {
    const dy = idx === 0 ? 0 : activeLineHeight;
    return `<tspan x="54" dy="${dy}">${escapeXml(line)}</tspan>`;
  }).join('');

  // Previous Lines
  const prev1Lines = prev1Seg ? wrapLyricsText(prev1Seg.text, wrapLimit + 4) : [];
  const prev1BlockH = prev1Lines.length * 30;
  const prev1Y = activeStartY - prev1BlockH - 24;
  const prev1Tspans = prev1Lines.map((l, idx) => `<tspan x="54" dy="${idx === 0 ? 0 : 30}">${escapeXml(l)}</tspan>`).join('');

  const prev2Lines = prev2Seg ? wrapLyricsText(prev2Seg.text, wrapLimit + 6) : [];
  const prev2BlockH = prev2Lines.length * 26;
  const prev2Y = prev1Y - prev2BlockH - 18;
  const prev2Tspans = prev2Lines.map((l, idx) => `<tspan x="54" dy="${idx === 0 ? 0 : 26}">${escapeXml(l)}</tspan>`).join('');

  // Next Lines
  const next1StartY = activeStartY + activeBlockHeight + 28;
  const next1Lines = next1Seg ? wrapLyricsText(next1Seg.text, wrapLimit + 4) : [];
  const next1Tspans = next1Lines.map((l, idx) => `<tspan x="54" dy="${idx === 0 ? 0 : 30}">${escapeXml(l)}</tspan>`).join('');

  const next2StartY = next1StartY + (next1Lines.length * 30) + 22;
  const next2Lines = next2Seg ? wrapLyricsText(next2Seg.text, wrapLimit + 6) : [];
  const next2Tspans = next2Lines.map((l, idx) => `<tspan x="54" dy="${idx === 0 ? 0 : 26}">${escapeXml(l)}</tspan>`).join('');

  const footerY = height - (isStory ? 80 : 64);
  const badgeY = height - (isStory ? 44 : 36);

  return `
  <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="spotBg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${theme.topGrad}" />
        <stop offset="45%" stop-color="${theme.midGrad}" />
        <stop offset="100%" stop-color="${theme.botGrad}" />
      </linearGradient>
      <radialGradient id="spotAura" cx="35%" cy="50%" r="65%">
        <stop offset="0%" stop-color="${theme.glowColor}" stop-opacity="0.16" />
        <stop offset="100%" stop-color="${theme.glowColor}" stop-opacity="0" />
      </radialGradient>
      <filter id="spotGlow" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur1" />
        <feGaussianBlur in="SourceGraphic" stdDeviation="12" result="blur2" />
        <feMerge>
          <feMergeNode in="blur2" />
          <feMergeNode in="blur1" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>

    <!-- Canvas Background -->
    <rect width="100%" height="100%" fill="url(#spotBg)" />
    <rect width="100%" height="100%" fill="url(#spotAura)" />

    <!-- Top Card Header -->
    <rect x="${headerX}" y="${headerY}" width="${headerW}" height="${headerH}" rx="16" fill="${theme.cardBg}" opacity="0.92" stroke="${theme.cardBorder}" stroke-width="1.5" />
    <rect x="${headerX + 12}" y="${headerY + 11}" width="56" height="56" rx="10" fill="${theme.glowColor}" />
    <path d="M ${headerX + 38} ${headerY + 24} L ${headerX + 50} ${headerY + 20} L ${headerX + 50} ${headerY + 38} A 5 5 0 1 1 ${headerX + 45} ${headerY + 33} L ${headerX + 45} ${headerY + 25} L ${headerX + 38} ${headerY + 28} Z" fill="#080a09" />
    <text x="${headerX + 80}" y="${headerY + 35}" font-family="Arial, Helvetica, sans-serif" font-weight="bold" font-size="19px" fill="#ffffff">${escapeXml(trackName.slice(0, 32))}</text>
    <text x="${headerX + 80}" y="${headerY + 57}" font-family="Arial, Helvetica, sans-serif" font-size="14px" fill="${theme.subText}">${escapeXml(artistName.slice(0, 38))}</text>

    <!-- Animated Audio Waveform Bars -->
    <rect x="${width - headerX - 44}" y="${headerY + 38 - (barHeights[0] / 2)}" width="4" height="${barHeights[0]}" rx="2" fill="${theme.glowColor}" />
    <rect x="${width - headerX - 35}" y="${headerY + 38 - (barHeights[1] / 2)}" width="4" height="${barHeights[1]}" rx="2" fill="${theme.glowColor}" />
    <rect x="${width - headerX - 26}" y="${headerY + 38 - (barHeights[2] / 2)}" width="4" height="${barHeights[2]}" rx="2" fill="${theme.glowColor}" />
    <rect x="${width - headerX - 17}" y="${headerY + 38 - (barHeights[3] / 2)}" width="4" height="${barHeights[3]}" rx="2" fill="${theme.glowColor}" />

    <!-- Dimmed Prior Lines -->
    ${prev2Seg && prev2Y > 110 ? `
    <text x="54" y="${prev2Y}" font-family="Arial, Helvetica, sans-serif" font-size="20px" font-weight="bold" fill="${theme.mutedText}" opacity="0.25">
      ${prev2Tspans}
    </text>` : ''}

    ${prev1Seg && prev1Y > 120 ? `
    <text x="54" y="${prev1Y}" font-family="Arial, Helvetica, sans-serif" font-size="23px" font-weight="bold" fill="${theme.subText}" opacity="0.55">
      ${prev1Tspans}
    </text>` : ''}

    <!-- Active Line: Glowing Layer -->
    <text x="54" y="${activeStartY}" font-family="Arial, Helvetica, sans-serif" font-size="${activeFontSize}px" font-weight="900" fill="${theme.glowColor}" filter="url(#spotGlow)">
      ${activeTspans}
    </text>
    <!-- Active Line: Crisp White Text Core -->
    <text x="54" y="${activeStartY}" font-family="Arial, Helvetica, sans-serif" font-size="${activeFontSize}px" font-weight="900" fill="#ffffff">
      ${activeTspans}
    </text>

    <!-- Dimmed Upcoming Lines -->
    ${next1Seg && next1StartY < footerY - 40 ? `
    <text x="54" y="${next1StartY}" font-family="Arial, Helvetica, sans-serif" font-size="23px" font-weight="bold" fill="${theme.subText}" opacity="0.50">
      ${next1Tspans}
    </text>` : ''}

    ${next2Seg && next2StartY < footerY - 20 ? `
    <text x="54" y="${next2StartY}" font-family="Arial, Helvetica, sans-serif" font-size="20px" font-weight="bold" fill="${theme.mutedText}" opacity="0.25">
      ${next2Tspans}
    </text>` : ''}

    <!-- Footer Progress Track & Filled Bar -->
    <rect x="54" y="${footerY}" width="${width - 108}" height="4" rx="2" fill="#222c25" />
    <rect x="54" y="${footerY}" width="${progressW}" height="4" rx="2" fill="${theme.glowColor}" />

    <!-- Footer Badge & Time Label -->
    <text x="54" y="${badgeY}" font-family="Arial, Helvetica, sans-serif" font-weight="bold" font-size="12px" fill="${theme.glowColor}" letter-spacing="2">SPOTIFY GLOW</text>
    <text x="${width - 54}" y="${badgeY}" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-weight="bold" font-size="12px" fill="${theme.mutedText}">${formatDuration(elapsed)} / ${formatDuration(windowDuration)}</text>
  </svg>
  `;
}

export async function generateSpotifyGlowVideoMp4({
  songQuery = '',
  lyricsData: initialLyricsData = null,
  glowTheme = 'green',
  isStory = false,
  isFull = false,
  isReff = false,
  customReff = null,
  isRap = false,
  isIntro = false,
  preferViral = false,
  fromTime = null,
  lyricSearch = '',
  syncOffset = 0,
  isCustomOffset = false,
} = {}) {
  const FPS = 25;
  const width = isStory ? 540 : 720;
  const height = isStory ? 960 : 720;

  const cleanQuery = (songQuery || '').trim();
  const lyricsData = initialLyricsData || (await fetchSongLyricsWithSync(cleanQuery));
  if (!lyricsData) {
    throw new Error(`Lirik untuk lagu "${cleanQuery}" tidak ditemukan.`);
  }

  let segments;
  if (lyricsData.hasWordSync && Array.isArray(lyricsData.wordSegments) && lyricsData.wordSegments.length > 0) {
    segments = lyricsData.wordSegments.map((ws) => ({
      ...ws,
      time: ws.time,
      words: (ws.words || []).map((w) => ({ ...w, time: w.time })),
    }));
  } else {
    const syncedStr = lyricsData.syncedLyrics || buildSyntheticLrcFromPlain(lyricsData.plainLyrics, lyricsData.duration);
    if (!syncedStr) {
      throw new Error(`Lirik tersinkronisasi belum tersedia untuk lagu "${lyricsData.trackName} - ${lyricsData.artistName}".`);
    }
    segments = parseLrcLyrics(syncedStr, 0);
  }

  if (segments.length === 0) {
    throw new Error(`Format lirik lagu "${lyricsData.trackName}" tidak dapat diproses.`);
  }

  const validArtist = (lyricsData.artistName && lyricsData.artistName !== 'Unknown Artist') ? lyricsData.artistName : '';
  const searchTarget = validArtist ? `${validArtist} - ${lyricsData.trackName}` : (lyricsData.trackName || cleanQuery);

  let musicTrack = null;
  try {
    musicTrack = await downloadMusicTrack(searchTarget, {
      targetDuration: lyricsData.duration,
      title: lyricsData.trackName,
      artist: validArtist,
    });
  } catch {
    musicTrack = await downloadMusicTrack(cleanQuery, {
      targetDuration: lyricsData.duration,
    });
  }

  if (!musicTrack?.buffer) {
    throw new Error(`Gagal mengunduh audio lagu "${cleanQuery}".`);
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nex_spotglow_'));
  try {
    const audioPath = path.join(tmpDir, 'track.mp3');
    fs.writeFileSync(audioPath, musicTrack.buffer);

    const windowInfo = selectLrcWindow(segments, {
      isFull,
      isReff,
      customReff,
      isRap,
      isIntro,
      preferViral,
      fromTime,
      lyricSearch,
      songParts: lyricsData.metadata?.songParts,
      maxDuration: 35,
    });

    const activeSegments = windowInfo.activeSegments;
    const windowStartTime = windowInfo.startTime;
    const partLabel = windowInfo.partLabel;

    if (activeSegments.length === 0) {
      throw new Error('Tidak ada segmen lirik yang dapat ditampilkan.');
    }

    const defaultLead = lyricsData.hasWordSync ? 0.08 : 0.16;
    const effectiveLead = isCustomOffset ? Math.abs(syncOffset) : defaultLead;

    let audioStartTime;
    if (windowStartTime === 0 && (isFull || isIntro || activeSegments[0].time <= 5.0)) {
      audioStartTime = 0;
    } else {
      audioStartTime = Math.max(0, activeSegments[0].time - effectiveLead);
    }

    const lastSeg = activeSegments[activeSegments.length - 1];
    const rawEndTime = (lastSeg.time + (lastSeg.duration || 3.5));
    const windowDuration = Math.min(isFull ? 300 : 35, Math.max(8, rawEndTime - activeSegments[0].time));

    const totalFrames = Math.max(25, Math.round(windowDuration * FPS));
    let currentSegIdx = 0;
    let lastTransitionFrame = 0;

    for (let f = 0; f < totalFrames; f++) {
      const frameTime = activeSegments[0].time + (f / FPS);

      // Cari segmen aktif saat ini
      while (
        currentSegIdx < activeSegments.length - 1 &&
        frameTime >= activeSegments[currentSegIdx + 1].time
      ) {
        currentSegIdx++;
        lastTransitionFrame = f;
      }

      // Smooth scroll interpolation (6 frames transition)
      let scrollDy = 0;
      const transAge = f - lastTransitionFrame;
      if (transAge >= 0 && transAge <= 6) {
        const t = transAge / 6;
        // Ease-out cubic: 1 - (1-t)^3
        const ease = 1 - Math.pow(1 - t, 3);
        scrollDy = (1 - ease) * 36;
      }

      const svg = renderSpotifyGlowSvg({
        trackName: lyricsData.trackName || 'Unknown Track',
        artistName: lyricsData.artistName || 'Unknown Artist',
        segments: activeSegments,
        activeIndex: currentSegIdx,
        currentTime: frameTime,
        windowStartTime: activeSegments[0].time,
        windowDuration,
        themeKey: glowTheme,
        width,
        height,
        scrollDy,
      });

      const framePngBuf = await sharp(Buffer.from(svg)).png().toBuffer();
      const framePath = path.join(tmpDir, `frame_${String(f + 1).padStart(5, '0')}.png`);
      fs.writeFileSync(framePath, framePngBuf);
    }

    const outMp4Path = path.join(tmpDir, 'output.mp4');
    const ffmpegCmd = [
      'ffmpeg -y',
      `-framerate ${FPS}`,
      `-i "${path.join(tmpDir, 'frame_%05d.png')}"`,
      `-ss ${audioStartTime.toFixed(3)}`,
      `-t ${windowDuration.toFixed(3)}`,
      `-i "${audioPath}"`,
      '-map 0:v -map 1:a',
      '-c:v libx264 -preset veryfast -crf 23 -pix_fmt yuv420p',
      '-c:a aac -b:a 192k',
      '-movflags +faststart',
      `"${outMp4Path}"`,
    ].join(' ');

    await execAsync(ffmpegCmd, { timeout: 90000 });

    if (!fs.existsSync(outMp4Path)) {
      throw new Error('Gagal merender video Spotify Glow MP4.');
    }

    const videoBuffer = fs.readFileSync(outMp4Path);
    return {
      buffer: videoBuffer,
      duration: windowDuration,
      partLabel,
      trackName: lyricsData.trackName,
      artistName: lyricsData.artistName,
      theme: glowTheme,
    };
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }
}
