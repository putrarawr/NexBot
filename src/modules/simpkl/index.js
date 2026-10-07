import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { InlineKeyboard } from 'grammy';
import { registerCommand } from '../../bot/handler.js';
import { logger } from '../../utils/logger.js';

const SIMPKL_DIR = process.env.SIMPKL_DIR || '/home/putra/Project-Coding/tools-scraping-jurnal';
const VENV_PYTHON = path.join(SIMPKL_DIR, '.venv/bin/python3');
const RUNNER_SCRIPT = path.join(SIMPKL_DIR, 'simpkl_runner.py');
const HISTORY_FILE = path.join(SIMPKL_DIR, 'history.json');

// In-memory draft stores
const draftNotes = new Map();
const batchDrafts = new Map();

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

const DEFAULT_WORK_NOTE = 'Melakukan pengujian fitur dan pemeliharaan aplikasi cafe-pos.';

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function safeEditOrReply(ctx, text, keyboard = null) {
  const opts = { parse_mode: 'HTML' };
  if (keyboard) opts.reply_markup = keyboard;

  try {
    if (ctx.callbackQuery?.message) {
      return await ctx.editMessageText(text, opts);
    }
  } catch {}

  try {
    return await ctx.reply(text, opts);
  } catch {
    return null;
  }
}

/**
 * Get Monday date string YYYY-MM-DD for a given date
 */
export function getMondayOfDate(dateInput = null) {
  const d = dateInput ? new Date(dateInput) : new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
}

/**
 * Execute simpkl_runner.py and parse JSON output
 */
export async function runSimpklRunner(action, params = {}) {
  const pythonBin = fs.existsSync(VENV_PYTHON) ? VENV_PYTHON : 'python3';

  if (!fs.existsSync(RUNNER_SCRIPT)) {
    throw new Error(`Script simpkl_runner.py tidak ditemukan di ${SIMPKL_DIR}`);
  }

  const args = [RUNNER_SCRIPT, '--action', action];
  if (params.date) args.push('--date', params.date);
  if (params.catatan) args.push('--catatan', params.catatan);
  if (params.entries) args.push('--entries', params.entries);
  if (params.limit) args.push('--limit', String(params.limit));
  if (params.count) args.push('--count', String(params.count));

  return new Promise((resolve, reject) => {
    execFile(
      pythonBin,
      args,
      { cwd: SIMPKL_DIR, timeout: 180000 },
      (error, stdout, stderr) => {
        if (error) {
          const errMsg = stderr?.trim() || error.message;
          return reject(new Error(errMsg));
        }

        try {
          const raw = stdout.trim();
          const json = JSON.parse(raw);
          resolve(json);
        } catch (err) {
          reject(new Error(`Gagal membaca output runner: ${stdout || err.message}`));
        }
      }
    );
  });
}

/**
 * Read submitted dates from history.json
 */
export function getSubmittedDatesSet() {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const data = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
      return new Set(Object.keys(data));
    }
  } catch {}
  return new Set();
}

/**
 * Build interactive Calendar Date Picker (NO EMOJIS)
 */
export function buildDatePicker(year, month, submittedDates = new Set()) {
  const keyboard = new InlineKeyboard();

  const prevDate = new Date(year, month - 2, 1);
  const nextDate = new Date(year, month, 1);
  const prevY = prevDate.getFullYear();
  const prevM = prevDate.getMonth() + 1;
  const nextY = nextDate.getFullYear();
  const nextM = nextDate.getMonth() + 1;

  // Header bar: [ < ] [ Bulan YYYY ] [ > ]
  keyboard
    .text('[ < ]', `simpkl_cal:${prevY}:${prevM}`)
    .text(`[ ${MONTH_NAMES[month - 1]} ${year} ]`, 'simpkl_noop')
    .text('[ > ]', `simpkl_cal:${nextY}:${nextM}`)
    .row();

  // Day names: Sen, Sel, Rab, Kam, Jum, Sab, Min
  keyboard
    .text('Sen', 'simpkl_noop')
    .text('Sel', 'simpkl_noop')
    .text('Rab', 'simpkl_noop')
    .text('Kam', 'simpkl_noop')
    .text('Jum', 'simpkl_noop')
    .text('Sab', 'simpkl_noop')
    .text('Min', 'simpkl_noop')
    .row();

  // Calendar math: Monday = 0, Sunday = 6
  const firstDay = new Date(year, month - 1, 1).getDay();
  const offset = (firstDay + 6) % 7;
  const daysInMonth = new Date(year, month, 0).getDate();

  let col = 0;
  for (let i = 0; i < offset; i++) {
    keyboard.text('-', 'simpkl_noop');
    col++;
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dayStr = String(day).padStart(2, '0');
    const monthStr = String(month).padStart(2, '0');
    const dateStr = `${year}-${monthStr}-${dayStr}`;

    const isSubmitted = submittedDates.has(dateStr);
    const label = isSubmitted ? `${dayStr}*` : `${dayStr}`;

    keyboard.text(label, `simpkl_pick:${dateStr}`);
    col++;

    if (col === 7) {
      keyboard.row();
      col = 0;
    }
  }

  if (col > 0) {
    while (col < 7) {
      keyboard.text('-', 'simpkl_noop');
      col++;
    }
    keyboard.row();
  }

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  keyboard
    .text(`[ Hari Ini: ${todayStr} ]`, `simpkl_pick:${todayStr}`)
    .row()
    .text('[ Submit Batch 5 Hari ]', 'simpkl_batch_menu')
    .text('[ Menu Utama SIMPKL ]', 'simpkl_menu');

  let text = `<b>[ PEMILIH TANGGAL (DATE PICKER) ]</b>\n\n`;
  text += `Periode: <b>${MONTH_NAMES[month - 1]} ${year}</b>\n`;
  text += `Keterangan: Tanda (*) menandakan jurnal sudah tercatat di sistem.\n\n`;
  text += `Sentuh tanggal di atas untuk melihat rangkuman & submit:`;

  return { text, keyboard };
}

/**
 * Build Main SIMPKL Menu Dashboard (NO EMOJIS)
 */
export function buildSimpklMainMenu() {
  const keyboard = new InlineKeyboard()
    .text('[ Buka Date Picker / Kalender ]', 'simpkl_cal_open')
    .row()
    .text('[ Submit Batch 5 Hari Kerja ]', 'simpkl_batch_menu')
    .row()
    .text('[ Jurnal Hari Ini ]', 'simpkl_today')
    .text('[ Jurnal Kemarin ]', 'simpkl_yesterday')
    .row()
    .text('[ Riwayat 10 Jurnal ]', 'simpkl_history')
    .text('[ Info Konfigurasi ]', 'simpkl_info')
    .row()
    .text('[ Menu Utama Bot ]', 'menu_main');

  let text = `<b>[ SISTEM AUTO-FILLER JURNAL SIMPKL ]</b>\n\n`;
  text += `Target Portal: <code>pkl.smk1bws.sch.id</code>\n`;
  text += `Engine: GitHub Commits Summarizer + Selenium Headless\n\n`;
  text += `Pilih salah satu menu di bawah ini:`;

  return { text, keyboard };
}

/**
 * Handle date selection view
 */
export async function handleDateSelection(ctx, dateStr) {
  await safeEditOrReply(
    ctx,
    `<b>[ MEMUAT ]</b> Mengambil data commit GitHub untuk tanggal <code>${dateStr}</code>...`
  );

  try {
    const res = await runSimpklRunner('fetch', { date: dateStr });
    if (res.status !== 'success') {
      throw new Error(res.message || 'Gagal memproses data');
    }

    const userId = String(ctx.from?.id || 'default');
    const customCatatan = draftNotes.get(`${userId}:${dateStr}`);
    const activeSummary = customCatatan || res.summary;

    let text = `<b>[ DETAIL JURNAL SIMPKL ]</b>\n\n`;
    text += `Tanggal: <b>${res.date}</b> (${res.day})\n`;
    text += `Status: <b>${res.already_submitted ? '[SUDAH TERCATAT]' : '[BELUM DISUBMIT]'}</b>\n`;
    text += `Jumlah Commit: <b>${res.commit_count} commit</b>\n\n`;

    if (activeSummary) {
      text += `<b>Rangkuman Catatan Kegiatan:</b>\n`;
      text += `<i>${escapeHtml(activeSummary)}</i>\n\n`;
    } else {
      text += `<i>Tidak ada aktivitas commit pada tanggal ini. Anda dapat menulis catatan kegiatan manual.</i>\n\n`;
    }

    if (res.commits && res.commits.length > 0) {
      text += `<b>Daftar Commit:</b>\n`;
      for (const c of res.commits.slice(0, 5)) {
        text += `• [${c.sha}] ${escapeHtml(c.message)} (${escapeHtml(c.author)})\n`;
      }
      text += `\n`;
    }

    const keyboard = new InlineKeyboard();

    if (activeSummary) {
      keyboard.text(
        res.already_submitted ? '[ Re-Submit ke SIMPKL ]' : '[ Submit ke SIMPKL ]',
        `simpkl_submit:${dateStr}`
      ).row();
    }

    keyboard
      .text('[ Mulai 5 Hari dari Tanggal Ini ]', `simpkl_batch_start:${dateStr}`)
      .row()
      .text('[ Edit Catatan ]', `simpkl_edit:${dateStr}`)
      .text('[ Date Picker ]', 'simpkl_cal_open')
      .row()
      .text('[ Menu SIMPKL ]', 'simpkl_menu');

    await safeEditOrReply(ctx, text, keyboard);
  } catch (err) {
    const keyboard = new InlineKeyboard()
      .text('[ Coba Lagi ]', `simpkl_pick:${dateStr}`)
      .text('[ Date Picker ]', 'simpkl_cal_open');

    await safeEditOrReply(
      ctx,
      `<b>[ ERROR ]</b> Gagal memproses ${dateStr}: ${escapeHtml(err.message)}`,
      keyboard
    );
  }
}

/**
 * Handle date submission to SIMPKL
 */
export async function handleDateSubmit(ctx, dateStr) {
  const userId = String(ctx.from?.id || 'default');
  const customCatatan = draftNotes.get(`${userId}:${dateStr}`);

  await safeEditOrReply(
    ctx,
    `<b>[ PROSES ]</b> Membuka browser headless, login ke SIMPKL, dan mengisi jurnal tanggal <code>${dateStr}</code>...\n\nProses memerlukan waktu sekitar 15-30 detik.`
  );

  try {
    let catatan = customCatatan;
    if (!catatan) {
      const fetchRes = await runSimpklRunner('fetch', { date: dateStr });
      catatan = fetchRes.summary;
    }

    if (!catatan) {
      throw new Error('Catatan jurnal kosong. Silakan tulis catatan terlebih dahulu.');
    }

    const submitRes = await runSimpklRunner('submit', { date: dateStr, catatan });
    if (submitRes.status !== 'success') {
      throw new Error(submitRes.message || 'Gagal mengirim jurnal');
    }

    draftNotes.delete(`${userId}:${dateStr}`);

    let text = `<b>[ BERHASIL DISUBMIT ]</b>\n\n`;
    text += `Tanggal: <b>${dateStr}</b>\n`;
    text += `Catatan: <i>${escapeHtml(catatan)}</i>\n\n`;
    text += `Jurnal berhasil tersimpan di portal SIMPKL dan dicatat ke history.`;

    const keyboard = new InlineKeyboard()
      .text('[ Pilih Tanggal Lain ]', 'simpkl_cal_open')
      .text('[ Riwayat Jurnal ]', 'simpkl_history')
      .row()
      .text('[ Menu SIMPKL ]', 'simpkl_menu');

    await safeEditOrReply(ctx, text, keyboard);
  } catch (err) {
    const keyboard = new InlineKeyboard()
      .text('[ Coba Submit Lagi ]', `simpkl_submit:${dateStr}`)
      .text('[ Kembali ke Draf ]', `simpkl_pick:${dateStr}`);

    await safeEditOrReply(
      ctx,
      `<b>[ GAGAL SUBMIT ]</b>\n\nTanggal: <b>${dateStr}</b>\nKeterangan: ${escapeHtml(err.message)}`,
      keyboard
    );
  }
}

/**
 * Handle Batch 5 Days Selection & Preview
 */
export async function handleBatchSelection(ctx, startDate) {
  await safeEditOrReply(
    ctx,
    `<b>[ MEMUAT BATCH ]</b> Mengambil data commit GitHub untuk 5 hari kerja mulai tanggal <code>${startDate}</code>...`
  );

  try {
    const res = await runSimpklRunner('batch-fetch', { date: startDate, count: 5 });
    if (res.status !== 'success') {
      throw new Error(res.message || 'Gagal memproses batch');
    }

    const userId = String(ctx.from?.id || 'default');

    // Fill notes with custom drafts or fallback
    const enrichedItems = res.items.map((item) => {
      const custom = draftNotes.get(`${userId}:${item.date}`);
      const summary = custom || item.summary || item.previous_catatan || DEFAULT_WORK_NOTE;
      return {
        ...item,
        summary,
      };
    });

    batchDrafts.set(userId, {
      startDate,
      items: enrichedItems,
    });

    let text = `<b>[ DRAF BATCH 5 HARI KERJA ]</b>\n\n`;
    text += `Periode: <b>${res.start_date}</b> s.d. <b>${res.end_date}</b>\n`;
    text += `Total: <b>${res.total_days} Hari Kerja (Senin - Jumat)</b>\n\n`;

    enrichedItems.forEach((it, idx) => {
      const statusLabel = it.already_submitted ? '[SUDAH TERCATAT]' : '[BELUM TERSIMPAN]';
      const commitLabel = it.has_commits ? `${it.commit_count} commit` : '0 commit';
      text += `<b>${idx + 1}. ${it.date} (${it.day})</b> - ${commitLabel} - ${statusLabel}\n`;
      text += `<i>${escapeHtml(it.summary.slice(0, 120))}${it.summary.length > 120 ? '...' : ''}</i>\n\n`;
    });

    text += `Periksa catatan di atas. Tekan tombol di bawah untuk langsung mengirim seluruh 5 jurnal ke SIMPKL:`;

    const keyboard = new InlineKeyboard()
      .text('[ Submit 5 Hari Sekaligus ]', `simpkl_batch_submit:${startDate}`)
      .row()
      .text('[ Date Picker ]', 'simpkl_cal_open')
      .text('[ Menu SIMPKL ]', 'simpkl_menu');

    await safeEditOrReply(ctx, text, keyboard);
  } catch (err) {
    const keyboard = new InlineKeyboard()
      .text('[ Coba Lagi ]', `simpkl_batch_start:${startDate}`)
      .text('[ Date Picker ]', 'simpkl_cal_open');

    await safeEditOrReply(
      ctx,
      `<b>[ ERROR ]</b> Gagal memproses batch ${startDate}: ${escapeHtml(err.message)}`,
      keyboard
    );
  }
}

/**
 * Handle Batch 5 Days Submission to SIMPKL
 */
export async function handleBatchSubmit(ctx, startDate) {
  const userId = String(ctx.from?.id || 'default');
  let batchData = batchDrafts.get(userId);

  if (!batchData || batchData.startDate !== startDate) {
    const fetchRes = await runSimpklRunner('batch-fetch', { date: startDate, count: 5 });
    const items = fetchRes.items.map((it) => ({
      ...it,
      summary: it.summary || it.previous_catatan || DEFAULT_WORK_NOTE,
    }));
    batchData = { startDate, items };
  }

  await safeEditOrReply(
    ctx,
    `<b>[ PROSES BATCH ]</b> Membuka browser headless, login ke SIMPKL, dan mengirim 5 jurnal sekaligus...\n\nProses memerlukan waktu sekitar 30 - 60 detik. Mohon tunggu...`
  );

  try {
    const entries = batchData.items.map((it) => ({
      date: it.date,
      catatan: it.summary,
    }));

    const res = await runSimpklRunner('batch-submit', {
      entries: JSON.stringify(entries),
    });

    if (res.status !== 'success') {
      throw new Error(res.message || 'Gagal batch submit');
    }

    batchDrafts.delete(userId);

    let text = `<b>[ LAPORAN BATCH 5 HARI SIMPKL ]</b>\n\n`;
    text += `Periode Mulai: <b>${startDate}</b>\n`;
    text += `Total Entri: <b>${res.total} Jurnal Diproses</b>\n\n`;

    res.results.forEach((r) => {
      text += `• <b>${r.date}</b>: [${r.status.toUpperCase()}] - ${escapeHtml(r.message)}\n`;
    });

    text += `\nSeluruh jurnal yang berhasil telah tersimpan di portal SIMPKL dan dicatat ke history.`;

    const keyboard = new InlineKeyboard()
      .text('[ Date Picker ]', 'simpkl_cal_open')
      .text('[ Riwayat Jurnal ]', 'simpkl_history')
      .row()
      .text('[ Menu SIMPKL ]', 'simpkl_menu');

    await safeEditOrReply(ctx, text, keyboard);
  } catch (err) {
    const keyboard = new InlineKeyboard()
      .text('[ Coba Submit Lagi ]', `simpkl_batch_submit:${startDate}`)
      .text('[ Kembali ke Draf ]', `simpkl_batch_start:${startDate}`);

    await safeEditOrReply(
      ctx,
      `<b>[ GAGAL BATCH SUBMIT ]</b>\n\nKeterangan: ${escapeHtml(err.message)}`,
      keyboard
    );
  }
}

/**
 * Main Telegram Callback Query Handler for SIMPKL (NO EMOJIS)
 */
export async function handleSimpklCallback(ctx, data) {
  if (data === 'simpkl_menu') {
    const menu = buildSimpklMainMenu();
    return await safeEditOrReply(ctx, menu.text, menu.keyboard);
  }

  if (data === 'simpkl_cal_open') {
    const now = new Date();
    const submitted = getSubmittedDatesSet();
    const cal = buildDatePicker(now.getFullYear(), now.getMonth() + 1, submitted);
    return await safeEditOrReply(ctx, cal.text, cal.keyboard);
  }

  if (data === 'simpkl_batch_menu') {
    const mondayStr = getMondayOfDate();
    return await handleBatchSelection(ctx, mondayStr);
  }

  if (data.startsWith('simpkl_batch_start:')) {
    const startDate = data.replace('simpkl_batch_start:', '');
    return await handleBatchSelection(ctx, startDate);
  }

  if (data.startsWith('simpkl_batch_submit:')) {
    const startDate = data.replace('simpkl_batch_submit:', '');
    return await handleBatchSubmit(ctx, startDate);
  }

  if (data.startsWith('simpkl_cal:')) {
    const parts = data.split(':');
    const y = parseInt(parts[1], 10);
    const m = parseInt(parts[2], 10);
    const submitted = getSubmittedDatesSet();
    const cal = buildDatePicker(y, m, submitted);
    return await safeEditOrReply(ctx, cal.text, cal.keyboard);
  }

  if (data.startsWith('simpkl_pick:')) {
    const dateStr = data.replace('simpkl_pick:', '');
    return await handleDateSelection(ctx, dateStr);
  }

  if (data.startsWith('simpkl_submit:')) {
    const dateStr = data.replace('simpkl_submit:', '');
    return await handleDateSubmit(ctx, dateStr);
  }

  if (data.startsWith('simpkl_edit:')) {
    const dateStr = data.replace('simpkl_edit:', '');
    let text = `<b>[ EDIT CATATAN JURNAL ]</b>\n\n`;
    text += `Untuk mengganti catatan tanggal <b>${dateStr}</b>, kirim pesan dengan format:\n`;
    text += `<code>/simpkl set ${dateStr} &lt;isi catatan kegiatan kamu&gt;</code>\n\n`;
    text += `Contoh:\n`;
    text += `<code>/simpkl set ${dateStr} Melakukan pengujian sistem dan perbaikan modul kasir</code>`;

    const keyboard = new InlineKeyboard()
      .text('[ Kembali ke Draf ]', `simpkl_pick:${dateStr}`)
      .text('[ Date Picker ]', 'simpkl_cal_open');

    return await safeEditOrReply(ctx, text, keyboard);
  }

  if (data === 'simpkl_today') {
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return await handleDateSelection(ctx, dateStr);
  }

  if (data === 'simpkl_yesterday') {
    const now = new Date();
    now.setDate(now.getDate() - 1);
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return await handleDateSelection(ctx, dateStr);
  }

  if (data === 'simpkl_history') {
    try {
      const res = await runSimpklRunner('history', { limit: 10 });
      let text = `<b>[ RIWAYAT JURNAL TERAKHIR ]</b>\n\n`;
      text += `Total Tercatat: <b>${res.total} Jurnal</b>\n\n`;

      if (res.items && res.items.length > 0) {
        res.items.forEach((item, idx) => {
          text += `<b>${idx + 1}. ${item.date}</b>\n`;
          text += `<i>${escapeHtml(item.catatan)}</i>\n`;
          if (item.submitted_at) {
            text += `Waktu: <code>${item.submitted_at}</code>\n`;
          }
          text += `\n`;
        });
      } else {
        text += `<i>Belum ada catatan riwayat jurnal di history.json.</i>\n\n`;
      }

      const keyboard = new InlineKeyboard()
        .text('[ Date Picker ]', 'simpkl_cal_open')
        .text('[ Menu SIMPKL ]', 'simpkl_menu');

      return await safeEditOrReply(ctx, text, keyboard);
    } catch (err) {
      return await safeEditOrReply(
        ctx,
        `<b>[ ERROR ]</b> Gagal mengambil riwayat: ${escapeHtml(err.message)}`,
        new InlineKeyboard().text('[ Menu SIMPKL ]', 'simpkl_menu')
      );
    }
  }

  if (data === 'simpkl_info') {
    let text = `<b>[ INFORMASI INTEGRASI SIMPKL ]</b>\n\n`;
    text += `Portal: <code>https://pkl.smk1bws.sch.id</code>\n`;
    text += `Direktori Tools: <code>${SIMPKL_DIR}</code>\n`;
    text += `Python Environment: <code>${fs.existsSync(VENV_PYTHON) ? 'Virtualenv Terdeteksi' : 'System Python'}</code>\n`;
    text += `Runner Script: <code>${fs.existsSync(RUNNER_SCRIPT) ? 'Tersedia' : 'Belum Ada'}</code>\n\n`;
    text += `Perintah Cepat:\n`;
    text += `• <code>/simpkl</code> - Menu utama\n`;
    text += `• <code>/simpkl cal</code> - Buka Date Picker\n`;
    text += `• <code>/simpkl 5days [YYYY-MM-DD]</code> - Submit 5 hari kerja\n`;
    text += `• <code>/simpkl today</code> - Draf hari ini\n`;
    text += `• <code>/simpkl date YYYY-MM-DD</code> - Cek tanggal\n`;
    text += `• <code>/simpkl set YYYY-MM-DD &lt;catatan&gt;</code> - Edit draf\n`;
    text += `• <code>/simpkl fill YYYY-MM-DD &lt;catatan&gt;</code> - Submit instan`;

    const keyboard = new InlineKeyboard()
      .text('[ Date Picker ]', 'simpkl_cal_open')
      .text('[ Menu SIMPKL ]', 'simpkl_menu');

    return await safeEditOrReply(ctx, text, keyboard);
  }

  if (data === 'simpkl_noop') {
    return;
  }
}

/**
 * Register command /simpkl
 */
export function registerSimpklCommands() {
  registerCommand({
    name: 'simpkl',
    aliases: ['jurnal', 'pkl', 'prakerin'],
    category: 'tools',
    description: 'Auto-filler jurnal SIMPKL dari commit GitHub dengan Date Picker interaktif',
    usage: '/simpkl [cal | 5days [tgl] | today | date YYYY-MM-DD | history | set ... | fill ...]',
    platforms: ['telegram'],
    async execute({ ctx, reply, args }) {
      if (!ctx?.reply) {
        return reply('Perintah ini dikhususkan untuk Telegram dengan tombol interaktif.');
      }

      const sub = (args[0] || '').toLowerCase();

      // /simpkl cal atau /simpkl datepicker
      if (sub === 'cal' || sub === 'datepicker' || sub === 'kalender') {
        const now = new Date();
        const submitted = getSubmittedDatesSet();
        const cal = buildDatePicker(now.getFullYear(), now.getMonth() + 1, submitted);
        return await ctx.reply(cal.text, {
          parse_mode: 'HTML',
          reply_markup: cal.keyboard,
        });
      }

      // /simpkl 5days [YYYY-MM-DD] atau /simpkl batch [YYYY-MM-DD] atau /simpkl week
      if (sub === '5days' || sub === 'batch' || sub === 'week' || sub === '5hari') {
        const paramDate = args[1];
        let startDate = getMondayOfDate();
        if (paramDate && /^\d{4}-\d{2}-\d{2}$/.test(paramDate)) {
          startDate = paramDate;
        }
        return await handleBatchSelection(ctx, startDate);
      }

      // /simpkl today
      if (sub === 'today' || sub === 'hariini') {
        const now = new Date();
        const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        return await handleDateSelection(ctx, dateStr);
      }

      // /simpkl yesterday
      if (sub === 'yesterday' || sub === 'kemarin') {
        const now = new Date();
        now.setDate(now.getDate() - 1);
        const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        return await handleDateSelection(ctx, dateStr);
      }

      // /simpkl history
      if (sub === 'history' || sub === 'riwayat') {
        const res = await runSimpklRunner('history', { limit: 10 }).catch(() => null);
        if (!res) return await ctx.reply('[!] Gagal memuat riwayat.');

        let text = `<b>[ RIWAYAT JURNAL TERAKHIR ]</b>\n\n`;
        text += `Total Tercatat: <b>${res.total} Jurnal</b>\n\n`;
        res.items.forEach((item, idx) => {
          text += `<b>${idx + 1}. ${item.date}</b>\n`;
          text += `<i>${escapeHtml(item.catatan)}</i>\n\n`;
        });

        const keyboard = new InlineKeyboard()
          .text('[ Date Picker ]', 'simpkl_cal_open')
          .text('[ Menu SIMPKL ]', 'simpkl_menu');

        return await ctx.reply(text, {
          parse_mode: 'HTML',
          reply_markup: keyboard,
        });
      }

      // /simpkl date YYYY-MM-DD
      if (sub === 'date' || /^\d{4}-\d{2}-\d{2}$/.test(sub)) {
        const targetDate = sub === 'date' ? args[1] : sub;
        if (!targetDate || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
          return await ctx.reply('Format tanggal salah. Gunakan YYYY-MM-DD, contoh: /simpkl date 2026-10-07');
        }
        return await handleDateSelection(ctx, targetDate);
      }

      // /simpkl set YYYY-MM-DD <catatan>
      if (sub === 'set') {
        const targetDate = args[1];
        const newCatatan = args.slice(2).join(' ').trim();

        if (!targetDate || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate) || !newCatatan) {
          return await ctx.reply('Format salah. Gunakan:\n/simpkl set YYYY-MM-DD Catatan kegiatan kamu');
        }

        const userId = String(ctx.from?.id || 'default');
        draftNotes.set(`${userId}:${targetDate}`, newCatatan);

        await ctx.reply(`Catatan kustom untuk tanggal ${targetDate} berhasil disimpan sebagai draf.`);
        return await handleDateSelection(ctx, targetDate);
      }

      // /simpkl fill YYYY-MM-DD <catatan> (Submit instan)
      if (sub === 'fill' || sub === 'submit') {
        const targetDate = args[1];
        const newCatatan = args.slice(2).join(' ').trim();

        if (!targetDate || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate) || !newCatatan) {
          return await ctx.reply('Format salah. Gunakan:\n/simpkl fill YYYY-MM-DD Catatan kegiatan kamu');
        }

        const userId = String(ctx.from?.id || 'default');
        draftNotes.set(`${userId}:${targetDate}`, newCatatan);
        return await handleDateSubmit(ctx, targetDate);
      }

      // Default: Buka Menu Utama SIMPKL
      const menu = buildSimpklMainMenu();
      return await ctx.reply(menu.text, {
        parse_mode: 'HTML',
        reply_markup: menu.keyboard,
      });
    },
  });
}
