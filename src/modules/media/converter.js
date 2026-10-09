import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import webpmux from 'node-webpmux';
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

// Menambahkan metadata EXIF (pack dan author) ke stiker WebP
export async function addStickerExif(webpBuffer, { pack = 'NexusBot', author = 'nexusbot' } = {}) {
  if (!webpBuffer || webpBuffer.length === 0) return webpBuffer;

  try {
    const img = new webpmux.Image();
    await img.load(webpBuffer);

    const json = {
      'sticker-pack-id': `nexusbot-${Date.now()}`,
      'sticker-pack-name': String(pack || 'NexusBot').trim(),
      'sticker-pack-publisher': String(author || 'nexusbot').trim(),
      'emojis': [],
    };

    const data = JSON.stringify(json);
    const exif = Buffer.concat([
      Buffer.from([
        0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,
        0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x16, 0x00, 0x00, 0x00,
      ]),
      Buffer.from(data, 'utf-8'),
    ]);
    exif.writeUIntLE(Buffer.byteLength(data, 'utf-8'), 14, 4);

    img.exif = exif;
    return await img.save(null);
  } catch (err) {
    logger.error('Gagal menambahkan metadata EXIF ke stiker:', err.message);
    return webpBuffer;
  }
}

// 1. Gambar Statis ke Stiker WebP (512x512 with aspect ratio pad)
export async function imageToWebpSticker(imageBuffer, metadata = { pack: 'NexusBot', author: 'nexusbot' }) {
  const inPath = getTempFilePath('img');
  const outPath = getTempFilePath('webp');

  try {
    fs.writeFileSync(inPath, imageBuffer);
    const cmd = `ffmpeg -y -i "${inPath}" -vcodec libwebp -filter:v "scale='if(gt(a,1),512,-1)':'if(gt(a,1),-1,512)',pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black@0.0" -lossless 1 "${outPath}"`;
    await execAsync(cmd);
    const webpBuffer = fs.readFileSync(outPath);
    return await addStickerExif(webpBuffer, metadata);
  } catch (err) {
    logger.error('Gagal convert image to sticker:', err.message);
    throw err;
  } finally {
    await safeUnlink(inPath, outPath);
  }
}

// 2. Video / GIF / Live Photo ke Animated WebP Sticker Boomerang Loop (Mulus & Seamless)
export async function videoToWebpSticker(videoBuffer, isLivePhoto = false, metadata = { pack: 'NexusBot', author: 'nexusbot' }) {
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
    return await addStickerExif(webpBuffer, metadata);
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
    if ((currentLine + ' ' + word).trim().length > 25) {
      lines.push(currentLine.trim());
      currentLine = word;
    } else {
      currentLine += (currentLine ? ' ' : '') + word;
    }
  }
  if (currentLine.trim()) lines.push(currentLine.trim());
  const displayedLines = lines.slice(0, 5);

  const textTspans = displayedLines
    .map((line, i) => `<tspan x="65" y="${208 + i * 30}">${line}</tspan>`)
    .join('');

  const svg = `
<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="avatarGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0A84FF"/>
      <stop offset="100%" stop-color="#5E5CE6"/>
    </linearGradient>
    <linearGradient id="bubbleBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1C1C1E"/>
      <stop offset="100%" stop-color="#262629"/>
    </linearGradient>
  </defs>

  <!-- 1. Floating iOS Reaction Bar Pill -->
  <rect x="80" y="24" width="352" height="46" rx="23" fill="#2C2C2E" stroke="#3A3A3C" stroke-width="1.5"/>
  <circle cx="118" cy="47" r="11" fill="#FF453A"/>
  <circle cx="170" cy="47" r="11" fill="#FF9F0A"/>
  <circle cx="222" cy="47" r="11" fill="#0A84FF"/>
  <circle cx="274" cy="47" r="11" fill="#BF5AF2"/>
  <circle cx="326" cy="47" r="11" fill="#30D158"/>
  <circle cx="378" cy="47" r="11" fill="#64D2FF"/>

  <!-- 2. Authentic Floating iOS Chat Bubble -->
  <rect x="30" y="86" width="452" height="342" rx="26" fill="url(#bubbleBg)" stroke="#38383A" stroke-width="2"/>
  <rect x="30" y="98" width="4" height="318" rx="2" fill="#0A84FF"/>

  <!-- Avatar Header -->
  <circle cx="78" cy="136" r="26" fill="url(#avatarGrad)"/>
  <text x="78" y="145" font-family="Arial, Liberation Sans, DejaVu Sans, Noto Sans, sans-serif" font-size="20" font-weight="bold" fill="#FFFFFF" text-anchor="middle">${initial}</text>

  <!-- Author Name & Subtitle -->
  <text x="120" y="132" font-family="Arial, Liberation Sans, DejaVu Sans, Noto Sans, sans-serif" font-size="19" font-weight="bold" fill="#FFFFFF">${cleanName}</text>
  <text x="120" y="152" font-family="Arial, Liberation Sans, DejaVu Sans, Noto Sans, sans-serif" font-size="12" fill="#8E8E93">iMessage • ${senderNumber || 'Verified'}</text>

  <!-- Divider Line -->
  <line x1="55" y1="174" x2="455" y2="174" stroke="#323236" stroke-width="1.5"/>

  <!-- Message Body Text -->
  <text font-family="Arial, Liberation Sans, DejaVu Sans, Noto Sans, sans-serif" font-size="22" font-weight="500" fill="#F2F2F7">
    ${textTspans}
  </text>

  <!-- Timestamp with checkmarks -->
  <text x="450" y="405" font-family="Arial, Liberation Sans, DejaVu Sans, Noto Sans, sans-serif" font-size="12" fill="#8E8E93" text-anchor="end">${timeStr} ✓✓</text>

  <!-- 3. Bottom Context Action Menu Strip -->
  <rect x="86" y="442" width="340" height="42" rx="14" fill="#2C2C2E" stroke="#38383A" stroke-width="1.2"/>
  <text x="142" y="468" font-family="Arial, Liberation Sans, DejaVu Sans, Noto Sans, sans-serif" font-size="13" font-weight="bold" fill="#0A84FF" text-anchor="middle">Balas</text>
  <text x="198" y="468" font-family="Arial, Liberation Sans, DejaVu Sans, Noto Sans, sans-serif" font-size="13" fill="#636366" text-anchor="middle">•</text>
  <text x="256" y="468" font-family="Arial, Liberation Sans, DejaVu Sans, Noto Sans, sans-serif" font-size="13" font-weight="bold" fill="#0A84FF" text-anchor="middle">Salin</text>
  <text x="314" y="468" font-family="Arial, Liberation Sans, DejaVu Sans, Noto Sans, sans-serif" font-size="13" fill="#636366" text-anchor="middle">•</text>
  <text x="370" y="468" font-family="Arial, Liberation Sans, DejaVu Sans, Noto Sans, sans-serif" font-size="13" font-weight="bold" fill="#0A84FF" text-anchor="middle">Teruskan</text>
</svg>
`;

  try {
    const rawWebp = await sharp(Buffer.from(svg)).webp({ lossless: true }).toBuffer();
    return await addStickerExif(rawWebp, { pack: 'NexusBot', author: 'nexusbot' });
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
