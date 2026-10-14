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
    topGrad: '#0c1610',
    midGrad: '#080e0a',
    botGrad: '#040705',
    cardBg: 'rgba(18, 26, 21, 0.88)',
    cardBorder: 'rgba(255, 255, 255, 0.08)',
    mutedText: '#6f7b73',
    subText: '#9da8a0',
  },
  cyan: {
    id: 'cyan',
    name: 'Electric Cyan',
    glowColor: '#00f2fe',
    topGrad: '#09151d',
    midGrad: '#060e14',
    botGrad: '#03070a',
    cardBg: 'rgba(16, 26, 33, 0.88)',
    cardBorder: 'rgba(255, 255, 255, 0.08)',
    mutedText: '#5e7585',
    subText: '#91b0c4',
  },
  purple: {
    id: 'purple',
    name: 'Cyber Violet',
    glowColor: '#c084fc',
    topGrad: '#150d1e',
    midGrad: '#0e0814',
    botGrad: '#07040a',
    cardBg: 'rgba(26, 17, 36, 0.88)',
    cardBorder: 'rgba(255, 255, 255, 0.08)',
    mutedText: '#7b6891',
    subText: '#bfa7de',
  },
  pink: {
    id: 'pink',
    name: 'Neon Magenta',
    glowColor: '#f43f5e',
    topGrad: '#1c0c14',
    midGrad: '#13080e',
    botGrad: '#0a0407',
    cardBg: 'rgba(32, 16, 24, 0.88)',
    cardBorder: 'rgba(255, 255, 255, 0.08)',
    mutedText: '#875d71',
    subText: '#d49ab3',
  },
  gold: {
    id: 'gold',
    name: 'Sunset Gold',
    glowColor: '#fbbf24',
    topGrad: '#1a140a',
    midGrad: '#110d06',
    botGrad: '#090703',
    cardBg: 'rgba(30, 23, 13, 0.88)',
    cardBorder: 'rgba(255, 255, 255, 0.08)',
    mutedText: '#877559',
    subText: '#d6be98',
  },
  blue: {
    id: 'blue',
    name: 'Deep Blue',
    glowColor: '#38bdf8',
    topGrad: '#09121d',
    midGrad: '#060c14',
    botGrad: '#03060a',
    cardBg: 'rgba(16, 24, 34, 0.88)',
    cardBorder: 'rgba(255, 255, 255, 0.08)',
    mutedText: '#5d7391',
    subText: '#93b1d9',
  },
  white: {
    id: 'white',
    name: 'Diamond White',
    glowColor: '#ffffff',
    topGrad: '#141416',
    midGrad: '#0d0d0f',
    botGrad: '#070708',
    cardBg: 'rgba(25, 25, 28, 0.88)',
    cardBorder: 'rgba(255, 255, 255, 0.08)',
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

export function getSegmentWords(seg, nextSegTime) {
  if (Array.isArray(seg.words) && seg.words.length > 0) {
    return seg.words;
  }
  const rawWords = (seg.text || '').trim().split(/\s+/).filter(Boolean);
  if (rawWords.length === 0) return [];
  const lineStart = seg.time;
  const lineEnd = nextSegTime ? Math.min(seg.time + 6.0, nextSegTime) : seg.time + (seg.duration || 3.5);
  const totalDuration = Math.max(0.8, lineEnd - lineStart);

  const totalChars = rawWords.reduce((acc, w) => acc + Math.max(2, w.length), 0);
  let curTime = lineStart;
  return rawWords.map((word) => {
    const weight = Math.max(2, word.length) / totalChars;
    const dur = totalDuration * weight;
    const wObj = {
      text: word,
      time: curTime,
      duration: dur,
      endTime: curTime + dur,
    };
    curTime += dur;
    return wObj;
  });
}

export function wrapLyricsWords(words, maxChars = 26) {
  if (!words || words.length === 0) return [];
  const lines = [];
  let currentLine = [];
  let currentLen = 0;

  for (const w of words) {
    const wordLen = (w.text || '').length;
    if (currentLine.length === 0) {
      currentLine.push(w);
      currentLen = wordLen;
    } else if (currentLen + 1 + wordLen <= maxChars) {
      currentLine.push(w);
      currentLen += 1 + wordLen;
    } else {
      lines.push(currentLine);
      currentLine = [w];
      currentLen = wordLen;
    }
  }
  if (currentLine.length > 0) {
    lines.push(currentLine);
  }
  return lines;
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

export function prepareSegments(segments, isStory = false) {
  const wrapLimit = isStory ? 22 : 26;
  const segmentGap = isStory ? 24 : 28;

  const prepared = segments.map((seg, idx) => {
    const nextSeg = segments[idx + 1];
    const words = getSegmentWords(seg, nextSeg ? nextSeg.time : null);
    const wrappedLines = wrapLyricsWords(words, wrapLimit);
    const segH = Math.max(1, wrappedLines.length) * 36 + segmentGap;
    return {
      ...seg,
      words,
      wrappedLines,
      segH,
    };
  });

  let cum = 0;
  const cumulativeY = [];
  for (let i = 0; i < prepared.length; i++) {
    cumulativeY.push(cum);
    cum += prepared[i].segH;
  }

  const height = isStory ? 960 : 720;
  const viewportCenterY = Math.round(height * 0.46);
  const idealScrollY = prepared.map((seg, i) => {
    const centerOfSeg = cumulativeY[i] + (seg.segH - segmentGap) / 2;
    return viewportCenterY - centerOfSeg;
  });

  return {
    preparedSegments: prepared,
    cumulativeY,
    idealScrollY,
  };
}

export function computeWordLighting(w, currentTime) {
  const start = w.time;
  const end = w.time + Math.max(0.18, w.duration || 0.38);

  // 1. Sebelum kata dimulai (lebih dari 0.12s sebelum mulai)
  if (currentTime < start - 0.12) {
    return {
      glowAlpha: 0,
      textAlpha: 0.32,
      isCurrent: false,
    };
  }

  // 2. Fase attack / mekar halus (dari start - 0.12s hingga start + 0.12s)
  if (currentTime < start + 0.12) {
    const t = Math.max(0, Math.min(1, (currentTime - (start - 0.12)) / 0.24));
    // Smooth cubic ease-in
    const easeIn = t * t * (3 - 2 * t);
    return {
      glowAlpha: easeIn * 0.96,
      textAlpha: 0.32 + 0.68 * easeIn,
      isCurrent: true,
    };
  }

  // 3. Fase artikulasi stabil (saat vokal kata sedang dinyanyikan)
  if (currentTime < end - 0.08) {
    return {
      glowAlpha: 1.0,
      textAlpha: 1.0,
      isCurrent: true,
    };
  }

  // 4. Fase decay / crossfade halus ke kata berikutnya (dari end - 0.08s hingga end + 0.24s)
  if (currentTime < end + 0.24) {
    const t = Math.max(0, Math.min(1, (currentTime - (end - 0.08)) / 0.32));
    const easeOut = 1 - Math.pow(t, 2);
    return {
      glowAlpha: easeOut * 0.80,
      textAlpha: 1.0,
      isCurrent: t < 0.4,
    };
  }

  // 5. Kata yang sudah selesai dinyanyikan (putih bersih permanen)
  return {
    glowAlpha: 0,
    textAlpha: 0.95,
    isCurrent: false,
  };
}

function renderActiveTspans(wrappedLines, currentTime, activeLineHeight, theme, isGlowLayer) {
  let out = '';
  for (let lIdx = 0; lIdx < wrappedLines.length; lIdx++) {
    const line = wrappedLines[lIdx];
    for (let wIdx = 0; wIdx < line.length; wIdx++) {
      const w = line[wIdx];
      const isLineStart = wIdx === 0;
      const posAttr = isLineStart ? (lIdx === 0 ? 'x="54"' : `x="54" dy="${activeLineHeight}"`) : '';

      const lighting = computeWordLighting(w, currentTime);

      if (isGlowLayer) {
        if (lighting.glowAlpha > 0.02) {
          out += `<tspan ${posAttr} fill="${theme.glowColor}" opacity="${lighting.glowAlpha.toFixed(2)}">${escapeXml(w.text)} </tspan>`;
        } else {
          out += `<tspan ${posAttr} fill="transparent" opacity="0">${escapeXml(w.text)} </tspan>`;
        }
      } else {
        out += `<tspan ${posAttr} fill="#ffffff" opacity="${lighting.textAlpha.toFixed(2)}">${escapeXml(w.text)} </tspan>`;
      }
    }
  }
  return out;
}

export function renderSpotifyGlowSvg({
  trackName = 'Unknown Track',
  artistName = 'Unknown Artist',
  segments = [],
  preparedSegments: inputPrepared = null,
  cumulativeY: inputCumulative = null,
  idealScrollY: inputIdeal = null,
  activeIndex = 0,
  currentSegIdx = null,
  currentTime = 0,
  windowStartTime = 0,
  windowDuration = 30,
  themeKey = 'green',
  width = 720,
  height = 720,
  currentScrollY = null,
  scrollDy = 0,
  albumArtBase64 = null,
  ambientColor = null,
}) {
  const theme = SPOTIFY_GLOW_THEMES[themeKey] || SPOTIFY_GLOW_THEMES.green;
  const isStory = height > width;

  // Header geometry
  const headerX = isStory ? 32 : 36;
  const headerY = isStory ? 48 : 32;
  const headerW = width - (headerX * 2);
  const headerH = 78;

  // Progress
  const elapsed = Math.max(0, currentTime - windowStartTime);
  const progressRatio = Math.min(1.0, Math.max(0, elapsed / Math.max(1, windowDuration)));
  const progressW = Math.max(8, (width - 108) * progressRatio);

  // Dynamic Audio Visualizer Equalizer Bars
  const barHeights = [
    Math.max(6, Math.min(32, Math.round(12 + Math.abs(Math.sin(currentTime * 6.2)) * 14 + Math.sin(currentTime * 14) * 4))),
    Math.max(8, Math.min(34, Math.round(18 + Math.abs(Math.sin(currentTime * 8.5 + 1.2)) * 16 + Math.cos(currentTime * 17) * 4))),
    Math.max(6, Math.min(32, Math.round(14 + Math.abs(Math.sin(currentTime * 7.1 + 2.5)) * 18 + Math.sin(currentTime * 12) * 5))),
    Math.max(8, Math.min(34, Math.round(16 + Math.abs(Math.sin(currentTime * 9.3 + 3.8)) * 12 + Math.cos(currentTime * 15) * 3))),
  ];

  const footerY = height - (isStory ? 80 : 64);
  const badgeY = height - (isStory ? 44 : 36);

  // Prepare segments if not passed precalculated
  let prepList = inputPrepared;
  let cumList = inputCumulative;
  let idealList = inputIdeal;
  if (!prepList || !cumList || !idealList) {
    const sourceSegs = segments && segments.length > 0 ? segments : [{ text: '...' }];
    const prepResult = prepareSegments(sourceSegs, isStory);
    prepList = prepResult.preparedSegments;
    cumList = prepResult.cumulativeY;
    idealList = prepResult.idealScrollY;
  }

  const activeIdx = Math.max(0, Math.min(prepList.length - 1, currentSegIdx !== null ? currentSegIdx : activeIndex));
  const activeLineHeight = isStory ? 38 : 42;
  const activeFontSize = isStory ? 28 : 32;

  // Camera scroll position
  const activeScroll = currentScrollY !== null ? currentScrollY : (idealList[activeIdx] + scrollDy);

  // Ambient aura color
  let ambientFill = theme.glowColor;
  if (ambientColor && typeof ambientColor.r === 'number') {
    ambientFill = `rgb(${ambientColor.r}, ${ambientColor.g}, ${ambientColor.b})`;
  }

  // Build rendered lyrics elements with graduated depth-of-field blur on upcoming and past lines
  const lyricsElements = prepList.map((seg, idx) => {
    const segY = cumList[idx] + activeScroll;
    const dist = idx - activeIdx;

    // Skip off-screen segments
    if (segY < -100 || segY > height + 80) {
      return '';
    }

    if (dist === 0) {
      return `
        <!-- Active Segment (Focal Center: Razor Sharp + Luminous Glow) -->
        <text x="54" y="${segY + 30}" xml:space="preserve" font-family="system-ui, -apple-system, sans-serif" font-size="${activeFontSize}px" font-weight="900" filter="url(#spotGlow)">
          ${renderActiveTspans(seg.wrappedLines, currentTime, activeLineHeight, theme, true)}
        </text>
        <text x="54" y="${segY + 30}" xml:space="preserve" font-family="system-ui, -apple-system, sans-serif" font-size="${activeFontSize}px" font-weight="900">
          ${renderActiveTspans(seg.wrappedLines, currentTime, activeLineHeight, theme, false)}
        </text>
      `;
    }

    // Inactive segments: determine blur and opacity based on relative distance
    let blurFilterAttr = '';
    let opacity = '0.18';

    if (dist > 0) {
      // Lines below active (Upcoming lyrics)
      if (dist === 1) {
        blurFilterAttr = 'filter="url(#spotBlurNext1)"';
        opacity = '0.55';
      } else if (dist === 2) {
        blurFilterAttr = 'filter="url(#spotBlurNext2)"';
        opacity = '0.32';
      } else {
        blurFilterAttr = 'filter="url(#spotBlurNext3)"';
        opacity = '0.16';
      }
    } else {
      // Lines above active (Past lyrics)
      if (dist === -1) {
        blurFilterAttr = 'filter="url(#spotBlurPast1)"';
        opacity = '0.42';
      } else {
        blurFilterAttr = 'filter="url(#spotBlurPast2)"';
        opacity = '0.20';
      }
    }

    const linesText = seg.wrappedLines.map((lineWords, lIdx) => {
      const lineStr = lineWords.map((w) => w.text).join(' ');
      const dy = lIdx === 0 ? 0 : 30;
      return `<tspan x="54" dy="${dy}">${escapeXml(lineStr)}</tspan>`;
    }).join('');

    return `
      <text x="54" y="${segY + 26}" xml:space="preserve" font-family="system-ui, -apple-system, sans-serif" font-size="22px" font-weight="700" fill="#ffffff" opacity="${opacity}" ${blurFilterAttr}>
        ${linesText}
      </text>
    `;
  }).filter(Boolean).join('\n');

  return `
  <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <!-- Background Gradients -->
      <linearGradient id="spotBg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${theme.topGrad}" />
        <stop offset="50%" stop-color="${theme.midGrad}" />
        <stop offset="100%" stop-color="${theme.botGrad}" />
      </linearGradient>
      <radialGradient id="spotAmbient" cx="30%" cy="40%" r="70%">
        <stop offset="0%" stop-color="${ambientFill}" stop-opacity="0.14" />
        <stop offset="100%" stop-color="${ambientFill}" stop-opacity="0" />
      </radialGradient>

      <!-- Glow Filter for Active Lyrics -->
      <filter id="spotGlow" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="6" result="blur1" />
        <feGaussianBlur stdDeviation="14" result="blur2" />
        <feMerge>
          <feMergeNode in="blur2" />
          <feMergeNode in="blur1" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>

      <!-- Depth-of-Field Blur Filters for Upcoming and Past Lyrics -->
      <filter id="spotBlurPast1" x="-10%" y="-10%" width="120%" height="120%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="1.2" />
      </filter>
      <filter id="spotBlurPast2" x="-10%" y="-10%" width="120%" height="120%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="2.8" />
      </filter>
      <filter id="spotBlurNext1" x="-10%" y="-10%" width="120%" height="120%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="1.6" />
      </filter>
      <filter id="spotBlurNext2" x="-10%" y="-10%" width="120%" height="120%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="3.6" />
      </filter>
      <filter id="spotBlurNext3" x="-10%" y="-10%" width="120%" height="120%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="5.8" />
      </filter>

      <!-- Lyrics Fade Mask for Cinematic Top and Bottom Dissolve -->
      <linearGradient id="fadeGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0" />
        <stop offset="16%" stop-color="#ffffff" stop-opacity="1" />
        <stop offset="84%" stop-color="#ffffff" stop-opacity="1" />
        <stop offset="100%" stop-color="#ffffff" stop-opacity="0" />
      </linearGradient>
      <mask id="lyricsMask">
        <rect x="0" y="${headerY + headerH + 10}" width="${width}" height="${footerY - headerY - headerH - 24}" fill="url(#fadeGrad)" />
      </mask>

      <!-- Clip Path for Album Artwork -->
      <clipPath id="artClip">
        <rect x="${headerX + 12}" y="${headerY + 11}" width="56" height="56" rx="10" />
      </clipPath>
    </defs>

    <!-- Canvas Background -->
    <rect width="100%" height="100%" fill="url(#spotBg)" />
    <rect width="100%" height="100%" fill="url(#spotAmbient)" />

    <!-- Masked Fluid Lyrics Stream with Depth of Field -->
    <g mask="url(#lyricsMask)">
      ${lyricsElements}
    </g>

    <!-- Top Glass Header Card -->
    <rect x="${headerX}" y="${headerY}" width="${headerW}" height="${headerH}" rx="18" fill="${theme.cardBg}" stroke="${theme.cardBorder}" stroke-width="1" />

    <!-- Album Artwork Integration or Vinyl Fallback -->
    <g clip-path="url(#artClip)">
      <rect x="${headerX + 12}" y="${headerY + 11}" width="56" height="56" fill="#141615" />
      ${albumArtBase64 ? `
      <image x="${headerX + 12}" y="${headerY + 11}" width="56" height="56" preserveAspectRatio="xMidYMid slice" href="${albumArtBase64}" />
      ` : `
      <circle cx="${headerX + 40}" cy="${headerY + 39}" r="24" fill="#1d211e" stroke="rgba(255,255,255,0.08)" stroke-width="1.5" />
      <circle cx="${headerX + 40}" cy="${headerY + 39}" r="16" fill="#141615" stroke="rgba(255,255,255,0.06)" stroke-width="1" />
      <circle cx="${headerX + 40}" cy="${headerY + 39}" r="9" fill="${theme.glowColor}" />
      <circle cx="${headerX + 40}" cy="${headerY + 39}" r="3" fill="#090a09" />
      `}
    </g>
    <rect x="${headerX + 12}" y="${headerY + 11}" width="56" height="56" rx="10" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="1" />

    <!-- Track Metadata Typography -->
    <text x="${headerX + 80}" y="${headerY + 34}" font-family="system-ui, -apple-system, sans-serif" font-weight="800" font-size="18px" fill="#ffffff">${escapeXml(trackName.slice(0, 32))}</text>
    <text x="${headerX + 80}" y="${headerY + 56}" font-family="system-ui, -apple-system, sans-serif" font-weight="600" font-size="13px" fill="${theme.subText}">${escapeXml(artistName.slice(0, 38))}</text>

    <!-- Dynamic Audio Waveform Equalizer Bars -->
    <rect x="${width - headerX - 44}" y="${headerY + 39 - (barHeights[0] / 2)}" width="4" height="${barHeights[0]}" rx="2" fill="${theme.glowColor}" />
    <rect x="${width - headerX - 35}" y="${headerY + 39 - (barHeights[1] / 2)}" width="4" height="${barHeights[1]}" rx="2" fill="${theme.glowColor}" />
    <rect x="${width - headerX - 26}" y="${headerY + 39 - (barHeights[2] / 2)}" width="4" height="${barHeights[2]}" rx="2" fill="${theme.glowColor}" />
    <rect x="${width - headerX - 17}" y="${headerY + 39 - (barHeights[3] / 2)}" width="4" height="${barHeights[3]}" rx="2" fill="${theme.glowColor}" />

    <!-- Footer Progress Bar Track & Filled Line -->
    <rect x="54" y="${footerY}" width="${width - 108}" height="4" rx="2" fill="rgba(255, 255, 255, 0.12)" />
    <rect x="54" y="${footerY}" width="${progressW}" height="4" rx="2" fill="${theme.glowColor}" />
    <circle cx="${54 + progressW}" cy="${footerY + 2}" r="4.5" fill="#ffffff" filter="url(#spotGlow)" />

    <!-- Footer Labels -->
    <text x="54" y="${badgeY}" font-family="system-ui, -apple-system, sans-serif" font-weight="800" font-size="11px" fill="${theme.glowColor}" letter-spacing="2">SPOTIFY GLOW</text>
    <text x="${width - 54}" y="${badgeY}" text-anchor="end" font-family="system-ui, -apple-system, sans-serif" font-weight="700" font-size="12px" fill="${theme.mutedText}">${formatDuration(elapsed)} / ${formatDuration(windowDuration)}</text>
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
  const FPS = 30;
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

  // Fetch official track artwork (iTunes 600x600, Spotify, or YouTube thumbnail)
  let albumArtBase64 = null;
  let ambientColor = null;

  const candidateThumbnail = musicTrack.thumbnail || lyricsData.metadata?.artworkUrl;
  if (candidateThumbnail) {
    try {
      const artRes = await fetch(candidateThumbnail, { signal: AbortSignal.timeout(5000) });
      if (artRes.ok) {
        const rawArtBuf = Buffer.from(await artRes.arrayBuffer());
        const resizedArtBuf = await sharp(rawArtBuf)
          .resize(128, 128, { fit: 'cover' })
          .png()
          .toBuffer();
        albumArtBase64 = `data:image/png;base64,${resizedArtBuf.toString('base64')}`;

        try {
          const stats = await sharp(rawArtBuf).stats();
          if (stats?.dominant && typeof stats.dominant.r === 'number') {
            ambientColor = stats.dominant;
          }
        } catch {}
      }
    } catch (artErr) {
      logger.debug('Gagal mengambil album art Spotify Glow:', artErr.message);
    }
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

    // Precalculate segment words, layouts, and camera scroll targets
    const { preparedSegments, cumulativeY, idealScrollY } = prepareSegments(activeSegments, isStory);

    const totalFrames = Math.max(30, Math.round(windowDuration * FPS));
    let scrollTargetIdx = 0;
    let vocalSegIdx = 0;
    let currentScrollY = idealScrollY[0];

    // Scroll anticipation lead (camera begins gliding 0.28s before next line starts)
    const SCROLL_LEAD = 0.28;

    // Frame batch processing for optimal memory and CPU performance
    const BATCH_SIZE = 12;

    for (let f = 0; f < totalFrames; f += BATCH_SIZE) {
      const batchPromises = [];
      const batchEnd = Math.min(totalFrames, f + BATCH_SIZE);

      for (let bf = f; bf < batchEnd; bf++) {
        const frameTime = activeSegments[0].time + (bf / FPS);

        // Advance scroll target index with smooth anticipation
        while (
          scrollTargetIdx < preparedSegments.length - 1 &&
          frameTime >= preparedSegments[scrollTargetIdx + 1].time - SCROLL_LEAD
        ) {
          scrollTargetIdx++;
        }

        // Advance active vocal index when vocal articulation begins
        while (
          vocalSegIdx < preparedSegments.length - 1 &&
          frameTime >= preparedSegments[vocalSegIdx + 1].time - 0.05
        ) {
          vocalSegIdx++;
        }

        const targetScrollY = idealScrollY[scrollTargetIdx];
        // Physical exponential smoothing for kinetic vertical scroll (critically damped)
        currentScrollY += (targetScrollY - currentScrollY) * 0.12;

        const svg = renderSpotifyGlowSvg({
          trackName: lyricsData.trackName || 'Unknown Track',
          artistName: lyricsData.artistName || 'Unknown Artist',
          preparedSegments,
          cumulativeY,
          idealScrollY,
          currentSegIdx: vocalSegIdx,
          currentTime: frameTime,
          windowStartTime: activeSegments[0].time,
          windowDuration,
          themeKey: glowTheme,
          width,
          height,
          currentScrollY,
          albumArtBase64,
          ambientColor,
        });

        const framePath = path.join(tmpDir, `frame_${String(bf + 1).padStart(5, '0')}.png`);
        batchPromises.push(
          sharp(Buffer.from(svg))
            .png()
            .toBuffer()
            .then((buf) => fs.promises.writeFile(framePath, buf))
        );
      }

      await Promise.all(batchPromises);
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
      '-c:v libx264 -preset veryfast -crf 22 -pix_fmt yuv420p',
      '-c:a aac -b:a 192k',
      '-movflags +faststart',
      `"${outMp4Path}"`,
    ].join(' ');

    await execAsync(ffmpegCmd, { timeout: 120000 });

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
