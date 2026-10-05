import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import { logger } from '../../utils/logger.js';

const execAsync = promisify(exec);

function getTempFilePath(ext) {
  const rand = Math.random().toString(36).slice(2, 8);
  return path.join(os.tmpdir(), `nexbot_${Date.now()}_${rand}.${ext}`);
}

async function safeUnlink(...paths) {
  for (const p of paths) {
    try {
      if (p && fs.existsSync(p)) {
        fs.unlinkSync(p);
      }
    } catch {
      // ignore
    }
  }
}

// 1. Gambar Statis ke Stiker WebP (512x512 with aspect ratio pad)
export async function imageToWebpSticker(imageBuffer) {
  const inPath = getTempFilePath('img');
  const outPath = getTempFilePath('webp');

  try {
    fs.writeFileSync(inPath, imageBuffer);
    const cmd = `ffmpeg -y -i "${inPath}" -vcodec libwebp -filter:v "scale='if(gt(a,1),512,-1)':'if(gt(a,1),-1,512)',pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black@0.0" -lossless 1 "${outPath}"`;
    await execAsync(cmd);
    const webpBuffer = fs.readFileSync(outPath);
    return webpBuffer;
  } catch (err) {
    logger.error('Gagal convert image to sticker:', err.message);
    throw err;
  } finally {
    await safeUnlink(inPath, outPath);
  }
}

// 2. Video / GIF / Live Photo ke Animated WebP Sticker Boomerang Loop (Mulus & Seamless)
export async function videoToWebpSticker(videoBuffer, isLivePhoto = false) {
  const inPath = getTempFilePath('mp4');
  const outPath = getTempFilePath('webp');

  try {
    fs.writeFileSync(inPath, videoBuffer);
    let cmd;

    if (isLivePhoto) {
      // Boomerang Ping-Pong effect (Maju lalu Mundur) agar looping mulus tanpa patah
      cmd = `ffmpeg -y -i "${inPath}" -filter_complex "[0:v]reverse[r];[0:v][r]concat=n=2:v=1[v];[v]scale='if(gt(a,1),512,-1)':'if(gt(a,1),-1,512)',pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black@0.0,fps=15" -vcodec libwebp -loop 0 -ss 0 -t 6 -preset default -an -s 512:512 "${outPath}"`;
    } else {
      cmd = `ffmpeg -y -i "${inPath}" -vcodec libwebp -filter:v "scale='if(gt(a,1),512,-1)':'if(gt(a,1),-1,512)',pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black@0.0,fps=15" -loop 0 -ss 0 -t 6 -preset default -an -s 512:512 "${outPath}"`;
    }

    await execAsync(cmd);
    const webpBuffer = fs.readFileSync(outPath);
    return webpBuffer;
  } catch (err) {
    logger.error('Gagal convert video to animated sticker:', err.message);
    throw err;
  } finally {
    await safeUnlink(inPath, outPath);
  }
}

// 3. Stiker WebP ke Gambar PNG
export async function stickerToPng(webpBuffer) {
  const inPath = getTempFilePath('webp');
  const outPath = getTempFilePath('png');

  try {
    fs.writeFileSync(inPath, webpBuffer);
    const cmd = `ffmpeg -y -i "${inPath}" -vframes 1 "${outPath}"`;
    await execAsync(cmd);
    const pngBuffer = fs.readFileSync(outPath);
    return pngBuffer;
  } catch (err) {
    logger.error('Gagal convert sticker to PNG:', err.message);
    throw err;
  } finally {
    await safeUnlink(inPath, outPath);
  }
}

// 4. Quote Chat Estetik (SVG to WebP)
export async function generateQuoteSticker(name = 'User', text = '', senderNumber = '') {
  const cleanText = String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const cleanName = String(name)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const initial = cleanName.charAt(0).toUpperCase() || 'U';
  const timeStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

  const words = cleanText.split(/\s+/);
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    if ((currentLine + ' ' + word).trim().length > 24) {
      lines.push(currentLine.trim());
      currentLine = word;
    } else {
      currentLine += (currentLine ? ' ' : '') + word;
    }
  }
  if (currentLine.trim()) lines.push(currentLine.trim());
  const displayedLines = lines.slice(0, 5);

  const textTspans = displayedLines
    .map((line, i) => `<tspan x="82" y="${213 + i * 32}">${line}</tspan>`)
    .join('');

  // iOS-style quote card with a soft blurred background. Keep the artwork
  // limited to shapes and regular text so librsvg renders it consistently.
  const svg = `
<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="softBlur" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="24"/>
    </filter>
    <linearGradient id="pageBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0d1324"/>
      <stop offset="55%" stop-color="#20152d"/>
      <stop offset="100%" stop-color="#08131b"/>
    </linearGradient>
    <linearGradient id="cardBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#141827" stop-opacity="0.96"/>
      <stop offset="100%" stop-color="#0a0d16" stop-opacity="0.96"/>
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#55d6ff"/>
      <stop offset="100%" stop-color="#9b7bff"/>
    </linearGradient>
  </defs>

  <rect width="512" height="512" fill="url(#pageBg)"/>
  <g filter="url(#softBlur)" opacity="0.8">
    <circle cx="70" cy="100" r="100" fill="#1f75b5"/>
    <circle cx="430" cy="105" r="120" fill="#7c3fa4"/>
    <circle cx="392" cy="438" r="130" fill="#176f75"/>
    <circle cx="112" cy="420" r="105" fill="#4a245f"/>
  </g>
  <rect width="512" height="512" fill="#050811" opacity="0.42"/>

  <!-- Floating reaction bar -->
  <rect x="76" y="24" width="360" height="48" rx="24" fill="#111624" fill-opacity="0.94" stroke="#8793b5" stroke-opacity="0.55" stroke-width="1.5"/>
  <circle cx="114" cy="48" r="11" fill="#ff6f91"/><circle cx="168" cy="48" r="11" fill="#ffc857"/>
  <circle cx="222" cy="48" r="11" fill="#5ed3ff"/><circle cx="276" cy="48" r="11" fill="#9b7bff"/>
  <circle cx="330" cy="48" r="11" fill="#69e6a5"/><circle cx="384" cy="48" r="11" fill="#f3f5ff"/>

  <!-- Main quote card -->
  <rect x="30" y="86" width="452" height="342" rx="30" fill="url(#cardBg)" stroke="#7582a6" stroke-opacity="0.55" stroke-width="2"/>
  <rect x="30" y="86" width="452" height="5" rx="2.5" fill="url(#accent)"/>

  <circle cx="75" cy="134" r="26" fill="url(#accent)"/>
  <text x="75" y="142" font-family="sans-serif" font-size="20" font-weight="700" fill="#07101c" text-anchor="middle">${initial}</text>
  <text x="115" y="130" font-family="sans-serif" font-size="18" font-weight="700" fill="#ffffff">${cleanName}</text>
  <text x="115" y="150" font-family="sans-serif" font-size="12" fill="#9aa8c7">Chat quote  •  ${senderNumber || 'Verified'}</text>
  <line x1="62" y1="172" x2="450" y2="172" stroke="#5d6888" stroke-opacity="0.45" stroke-width="1.2"/>

  <!-- iMessage-style inner bubble and tail -->
  <path d="M62 186 H414 C432 186 446 200 446 218 V320 C446 338 432 352 414 352 H92 C76 352 62 340 62 322 Z" fill="#252b3d" fill-opacity="0.92"/>
  <path d="M93 352 C81 374 63 382 45 384 C59 367 62 351 62 329 C70 343 80 350 93 352 Z" fill="#252b3d" fill-opacity="0.92"/>
  <text x="82" y="216" font-family="sans-serif" font-size="23" font-weight="400" fill="#f5f7ff">
    ${textTspans}
  </text>

  <text x="450" y="405" font-family="sans-serif" font-size="11" fill="#9aa8c7" text-anchor="end">Terkirim  •  ${timeStr}</text>

  <rect x="86" y="442" width="340" height="42" rx="14" fill="#111624" fill-opacity="0.94" stroke="#7582a6" stroke-opacity="0.45" stroke-width="1.2"/>
  <text x="142" y="468" font-family="sans-serif" font-size="13" font-weight="700" fill="#65d7ff" text-anchor="middle">Balas</text>
  <text x="198" y="468" font-family="sans-serif" font-size="13" fill="#687592" text-anchor="middle">|</text>
  <text x="256" y="468" font-family="sans-serif" font-size="13" font-weight="700" fill="#65d7ff" text-anchor="middle">Salin</text>
  <text x="314" y="468" font-family="sans-serif" font-size="13" fill="#687592" text-anchor="middle">|</text>
  <text x="370" y="468" font-family="sans-serif" font-size="13" font-weight="700" fill="#65d7ff" text-anchor="middle">Teruskan</text>
</svg>
`;

  try {
    // Alpine's FFmpeg build may not include an SVG decoder. Sharp uses
    // librsvg for the rasterization step, then encodes the final sticker as WebP.
    return await sharp(Buffer.from(svg)).webp({ lossless: true }).toBuffer();
  } catch (err) {
    logger.error('Gagal generate Quote Sticker:', err.message);
    throw err;
  }
}

// 5. PhotoLive Motion: Zoompan anti-jitter berkecepatan tinggi & mulus tanpa getar
export async function createPhotoLiveMotion(imageBuffer) {
  const inPath = getTempFilePath('jpg');
  const outPath = getTempFilePath('mp4');

  try {
    fs.writeFileSync(inPath, imageBuffer);
    // Skala resolusi tinggi 4000px sebelum zoompan agar pembulatan koordinat integer tidak menyebabkan getaran/jitter
    const cmd = `ffmpeg -y -loop 1 -i "${inPath}" -vf "scale=4000:-1,zoompan=z='min(zoom+0.0008,1.15)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=120:s=512x512:fps=30" -c:v libx264 -t 4 -pix_fmt yuv420p "${outPath}"`;
    await execAsync(cmd);
    const videoBuffer = fs.readFileSync(outPath);
    return videoBuffer;
  } catch (err) {
    logger.error('Gagal create PhotoLive motion:', err.message);
    throw err;
  } finally {
    await safeUnlink(inPath, outPath);
  }
}
