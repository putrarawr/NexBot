import sharp from 'sharp';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { logger } from '../../utils/logger.js';

const execAsync = promisify(exec);

function getTempFilePath(ext) {
  const rand = Math.random().toString(36).slice(2, 8);
  return path.join(os.tmpdir(), `nex_enh_${Date.now()}_${rand}.${ext}`);
}

async function safeUnlink(...paths) {
  for (const p of paths) {
    try {
      if (p && fs.existsSync(p)) fs.unlinkSync(p);
    } catch {}
  }
}

/**
 * 1. HD / Remini Photo Enhancer
 * Meningkatkan ketajaman, dynamic range, dan resolusi foto
 */
export async function enhanceImageHd(imageBuffer) {
  const meta = await sharp(imageBuffer).metadata();
  const width = Math.min((meta.width || 800) * 2, 2048);
  const height = Math.min((meta.height || 800) * 2, 2048);

  return await sharp(imageBuffer)
    .resize(width, height, {
      kernel: sharp.kernel.lanczos3,
      withoutEnlargement: false,
    })
    .sharpen({
      sigma: 1.8,
      m1: 1.5,
      m2: 0.8,
    })
    .modulate({
      brightness: 1.04,
      saturation: 1.18,
    })
    .linear(1.12, -12)
    .jpeg({ quality: 95, mozjpeg: true })
    .toBuffer();
}

/**
 * 2. Deep Contrast Booster
 */
export async function enhanceImageContrast(imageBuffer) {
  return await sharp(imageBuffer)
    .linear(1.28, -22)
    .sharpen({ sigma: 1.2 })
    .modulate({ saturation: 1.12 })
    .jpeg({ quality: 92 })
    .toBuffer();
}

/**
 * 3. Aesthetic Vintage / Retro Film Grade
 */
export async function enhanceImageVintage(imageBuffer) {
  return await sharp(imageBuffer)
    .modulate({ brightness: 0.96, saturation: 0.82 })
    .tint({ r: 242, g: 218, b: 180 })
    .linear(1.14, -10)
    .jpeg({ quality: 90 })
    .toBuffer();
}

/**
 * 4. High-Contrast Noir Black & White
 */
export async function enhanceImageNoir(imageBuffer) {
  return await sharp(imageBuffer)
    .grayscale()
    .linear(1.32, -26)
    .sharpen({ sigma: 1.4 })
    .jpeg({ quality: 92 })
    .toBuffer();
}

/**
 * 5. Pembuat Video Story IG/WA Aesthetic (9:16 Vertical 720x1280)
 * Ken Burns zoompan halus, vignette sinematik, color grade
 */
export async function generateAestheticStoryVideo(imageBuffer) {
  const inImg = getTempFilePath('jpg');
  const outMp4 = getTempFilePath('mp4');

  try {
    fs.writeFileSync(inImg, imageBuffer);

    // Filter 9:16 vertical 720x1280 dengan zoompan halus 5 detik (30fps) dan vignette
    const filter = `scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,zoompan=z='min(zoom+0.0012,1.15)':d=150:s=720x1280:fps=30,vignette=PI/5,eq=contrast=1.15:saturation=1.2`;
    const cmd = `ffmpeg -y -loop 1 -i "${inImg}" -vf "${filter}" -c:v libx264 -t 5 -pix_fmt yuv420p -preset fast "${outMp4}"`;

    await execAsync(cmd, { timeout: 35000 });
    const buffer = fs.readFileSync(outMp4);
    return buffer;
  } catch (err) {
    logger.error('Error saat membuat aesthetic story video:', err.message);
    throw err;
  } finally {
    await safeUnlink(inImg, outMp4);
  }
}

/**
 * 6. Video HD Enhancer
 * Meningkatkan ketajaman, kontras, dan saturasi video
 */
export async function enhanceVideoHd(videoBuffer) {
  const inVid = getTempFilePath('mp4');
  const outVid = getTempFilePath('mp4');

  try {
    fs.writeFileSync(inVid, videoBuffer);

    // Unsharp filter dan color clarity booster
    const filter = `unsharp=5:5:1.0:5:5:0.0,eq=contrast=1.16:brightness=0.02:saturation=1.22`;
    const cmd = `ffmpeg -y -i "${inVid}" -vf "${filter}" -c:v libx264 -c:a copy -preset fast -crf 20 "${outVid}"`;

    await execAsync(cmd, { timeout: 45000 });
    const buffer = fs.readFileSync(outVid);
    return buffer;
  } catch (err) {
    logger.error('Error saat membuat video HD:', err.message);
    throw err;
  } finally {
    await safeUnlink(inVid, outVid);
  }
}
