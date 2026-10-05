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
    if ((currentLine + ' ' + word).trim().length > 30) {
      lines.push(currentLine.trim());
      currentLine = word;
    } else {
      currentLine += (currentLine ? ' ' : '') + word;
    }
  }
  if (currentLine.trim()) lines.push(currentLine.trim());
  const displayedLines = lines.slice(0, 5);

  const textTspans = displayedLines
    .map((line, i) => `<tspan x="62" y="${205 + i * 26}">${line}</tspan>`)
    .join('');

  // Authentic iOS Message Bubble (Hold/Context Menu Style)
  const svg = `
<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bubbleBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1C1C1E"/>
      <stop offset="100%" stop-color="#242426"/>
    </linearGradient>
    <linearGradient id="reactionBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#2C2C2E"/>
      <stop offset="100%" stop-color="#3A3A3C"/>
    </linearGradient>
    <linearGradient id="avatarGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0A84FF"/>
      <stop offset="100%" stop-color="#5E5CE6"/>
    </linearGradient>
  </defs>

  <!-- 1. iOS Reaction Bar Pill (Hold Action Reaction) -->
  <rect x="76" y="24" width="360" height="48" rx="24" fill="url(#reactionBg)" stroke="#48484A" stroke-width="1.5"/>
  <text x="114" y="56" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif" font-size="20" text-anchor="middle">❤️</text>
  <text x="168" y="56" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif" font-size="20" text-anchor="middle">👍</text>
  <text x="222" y="56" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif" font-size="20" text-anchor="middle">👎</text>
  <text x="276" y="56" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif" font-size="20" text-anchor="middle">😂</text>
  <text x="330" y="56" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif" font-size="20" text-anchor="middle">‼️</text>
  <text x="384" y="56" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif" font-size="20" text-anchor="middle">❓</text>

  <!-- 2. Main iOS Chat Bubble (Held State) -->
  <rect x="30" y="86" width="452" height="342" rx="26" fill="url(#bubbleBg)" stroke="#38383A" stroke-width="2"/>

  <!-- Avatar Header -->
  <circle cx="75" cy="134" r="26" fill="url(#avatarGrad)"/>
  <text x="75" y="143" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif" font-size="20" font-weight="700" fill="#FFFFFF" text-anchor="middle">${initial}</text>

  <!-- Sender Name & Subtitle -->
  <text x="115" y="130" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif" font-size="18" font-weight="600" fill="#FFFFFF">${cleanName}</text>
  <text x="115" y="149" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif" font-size="12" font-weight="500" fill="#8E8E93">iMessage • ${senderNumber || 'Verified'}</text>

  <!-- Divider line -->
  <line x1="62" y1="172" x2="450" y2="172" stroke="#2C2C2E" stroke-width="1.2"/>

  <!-- Message Body Text -->
  <text font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif" font-size="19" font-weight="400" fill="#F2F2F7" letter-spacing="-0.3">
    ${textTspans}
  </text>

  <!-- Status & Timestamp -->
  <text x="450" y="405" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif" font-size="11" font-weight="500" fill="#8E8E93" text-anchor="end">Terkirim • ${timeStr}</text>

  <!-- 3. iOS Bottom Context Menu Strip -->
  <rect x="86" y="442" width="340" height="42" rx="14" fill="#242426" stroke="#38383A" stroke-width="1.2"/>
  <text x="142" y="468" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif" font-size="13" font-weight="600" fill="#0A84FF" text-anchor="middle">Balas</text>
  <text x="198" y="468" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif" font-size="13" fill="#636366" text-anchor="middle">•</text>
  <text x="256" y="468" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif" font-size="13" font-weight="600" fill="#0A84FF" text-anchor="middle">Salin</text>
  <text x="314" y="468" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif" font-size="13" fill="#636366" text-anchor="middle">•</text>
  <text x="370" y="468" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif" font-size="13" font-weight="600" fill="#0A84FF" text-anchor="middle">Teruskan</text>
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
