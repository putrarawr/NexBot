import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
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
  const inPath = getTempFilePath('svg');
  const outPath = getTempFilePath('webp');

  const cleanText = String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const cleanName = String(name)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const initial = cleanName.charAt(0).toUpperCase() || 'U';
  const timeStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

  const words = cleanText.split(' ');
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    if ((currentLine + ' ' + word).trim().length > 28) {
      lines.push(currentLine.trim());
      currentLine = word;
    } else {
      currentLine += ' ' + word;
    }
  }
  if (currentLine.trim()) lines.push(currentLine.trim());

  const displayedLines = lines.slice(0, 5);
  const textTspans = displayedLines
    .map((line, i) => `<tspan x="65" y="${220 + i * 28}">${line}</tspan>`)
    .join('');

  const svg = `
<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="cardBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e1e2e"/>
      <stop offset="100%" stop-color="#11111b"/>
    </linearGradient>
    <linearGradient id="avatarGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8"/>
      <stop offset="100%" stop-color="#6366f1"/>
    </linearGradient>
  </defs>

  <rect x="25" y="75" width="462" height="360" rx="28" fill="url(#cardBg)" stroke="#313244" stroke-width="2"/>
  <circle cx="95" cy="145" r="32" fill="url(#avatarGrad)"/>
  <text x="95" y="156" font-family="system-ui, sans-serif" font-size="26" font-weight="bold" fill="#ffffff" text-anchor="middle">${initial}</text>
  <text x="145" y="142" font-family="system-ui, sans-serif" font-size="20" font-weight="bold" fill="#cdd6f4">${cleanName}</text>
  <text x="145" y="165" font-family="system-ui, sans-serif" font-size="13" fill="#a6adc8">${senderNumber || 'User'}</text>
  <text font-family="system-ui, sans-serif" font-size="20" font-weight="500" fill="#f5e0dc">
    ${textTspans}
  </text>
  <text x="445" y="405" font-family="system-ui, sans-serif" font-size="13" fill="#6c7086" text-anchor="end">${timeStr}</text>
</svg>
`;

  try {
    fs.writeFileSync(inPath, svg);
    const cmd = `ffmpeg -y -i "${inPath}" -vcodec libwebp -lossless 1 "${outPath}"`;
    await execAsync(cmd);
    const webpBuffer = fs.readFileSync(outPath);
    return webpBuffer;
  } catch (err) {
    logger.error('Gagal generate Quote Sticker:', err.message);
    throw err;
  } finally {
    await safeUnlink(inPath, outPath);
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
