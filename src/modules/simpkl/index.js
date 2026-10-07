import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { InlineKeyboard } from 'grammy';
import { registerCommand } from '../../bot/handler.js';
import { logger } from '../../utils/logger.js';

// In-memory draft stores
export const draftNotes = new Map();
export const batchDrafts = new Map();

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

export const DEFAULT_WORK_NOTE = 'Melakukan pengujian fitur dan pemeliharaan aplikasi cafe-pos.';

export const LOOP_PRESETS = [
  {
    id: '1',
    title: 'Testing & Maintenance',
    text: 'Melakukan pengujian fungsional modul, debugging issue, dan pemeliharaan aplikasi cafe-pos.',
  },
  {
    id: '2',
    title: 'Refactoring & Bugfix',
    text: 'Melakukan refactoring kode sumber, optimalisasi struktur controller, dan perbaikan exception.',
  },
  {
    id: '3',
    title: 'Optimalisasi Database',
    text: 'Optimalisasi query relasional database, penyesuaian indexing tabel, dan validasi data transaksi.',
  },
  {
    id: '4',
    title: 'UI & Responsivitas',
    text: 'Penyempurnaan tampilan antarmuka kasir, penyesuaian tata letak form, dan pengujian responsivitas.',
  },
];

export const VARY_PACKAGES = [
  {
    id: 'A',
    name: 'Software Engineering',
    notes: [
      'Refactoring struktur endpoint backend dan optimalisasi kecepatan proses transaksi kasir.',
      'Pengujian integrasi modul kasir, validasi format data, dan penanganan exception sistem.',
      'Optimalisasi indeks relasi database serta perbaikan performa query agregasi stok barang.',
      'Review kode berkala, pembersihan branch kerja, dan dokumentasi arsitektur modul sistem.',
    ],
  },
  {
    id: 'B',
    name: 'QA & Bug Fixing',
    notes: [
      'Investigasi temuan error log dan debugging kalkulasi diskon pada modul kasir.',
      'Pengujian fungsional modul pembayaran tunai/non-tunai dan cetak struk nota belanja.',
      'Pengujian ketahanan form input terhadap anomali data serta perbaikan sanitasi input.',
      'Penyusunan laporan ringkas hasil pengujian modul dan sinkronisasi repo kerja.',
    ],
  },
  {
    id: 'C',
    name: 'Frontend & UI/UX',
    notes: [
      'Perbaikan responsivitas tabel daftar produk dan perataan tombol aksi transaksi kasir.',
      'Implementasi modal konfirmasi transaksi dan peningkatan feedback visual pengguna.',
      'Pengujian alur pengguna pada layar tablet dan penyesuaian responsivitas komponen form.',
      'Dokumentasi komponen visual antarmuka dan review kesesuaian sprint mingguan.',
    ],
  },
];

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
 * Robust SIMPKL Directory & Python Resolution
 */
export function resolveSimpklConfig() {
  const fileDir = path.dirname(fileURLToPath(import.meta.url));

  const candidateDirs = [
    process.env.SIMPKL_DIR,
    path.resolve(fileDir, 'scripts'),
    path.resolve(process.cwd(), 'src/modules/simpkl/scripts'),
    '/home/putra/Project-Coding/tools-scraping-jurnal',
    path.join(os.homedir(), 'Project-Coding/tools-scraping-jurnal'),
    path.resolve(process.cwd(), '../tools-scraping-jurnal'),
    path.resolve(process.cwd(), 'tools-scraping-jurnal'),
  ].filter(Boolean);

  let selectedDir = candidateDirs.find((dir) => {
    try {
      return fs.existsSync(path.join(dir, 'simpkl_runner.py'));
    } catch {
      return false;
    }
  });

  if (!selectedDir) {
    const checked = candidateDirs.map((d) => `• ${d}`).join('\n');
    throw new Error(
      `Script simpkl_runner.py tidak ditemukan. Lokasi yang diperiksa:\n${checked}\nSilakan atur SIMPKL_DIR di .env.`
    );
  }

  const runnerScript = path.join(selectedDir, 'simpkl_runner.py');

  // Candidate python venvs
  const pythonCandidates = [
    path.join(selectedDir, '.venv/bin/python3'),
    '/home/putra/Project-Coding/tools-scraping-jurnal/.venv/bin/python3',
    path.join(os.homedir(), 'Project-Coding/tools-scraping-jurnal/.venv/bin/python3'),
    'python3',
  ];
  const pythonBin = pythonCandidates.find((bin) => bin === 'python3' || fs.existsSync(bin)) || 'python3';

  // Candidate history files
  const historyCandidates = [
    '/home/putra/Project-Coding/tools-scraping-jurnal/history.json',
    path.join(selectedDir, 'history.json'),
    path.join(os.homedir(), 'Project-Coding/tools-scraping-jurnal/history.json'),
  ];
  const historyFile = historyCandidates.find((f) => fs.existsSync(f)) || path.join(selectedDir, 'history.json');

  return {
    dir: selectedDir,
    runnerScript,
    pythonBin,
    historyFile,
    candidateDirs,
  };
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
  const config = resolveSimpklConfig();

  const args = [config.runnerScript, '--action', action];
  if (params.date) args.push('--date', params.date);
  if (params.catatan) args.push('--catatan', params.catatan);
  if (params.entries) args.push('--entries', params.entries);
  if (params.limit) args.push('--limit', String(params.limit));
  if (params.count) args.push('--count', String(params.count));

  return new Promise((resolve, reject) => {
    execFile(
      config.pythonBin,
      args,
      { cwd: config.dir, timeout: 180000 },
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
    const config = resolveSimpklConfig();
    if (config.historyFile && fs.existsSync(config.historyFile)) {
      const data = JSON.parse(fs.readFileSync(config.historyFile, 'utf-8'));
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

  // Days row: Sen Sel Rab Kam Jum Sab Min
  const daysHeader = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
  for (const d of daysHeader) {
    keyboard.text(d, 'simpkl_noop');
  }
  keyboard.row();

  // Calculate calendar grid
  const firstDayOfMonth = new Date(year, month - 1, 1).getDay();
  const offset = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;
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
 * Apply 1 repeated text to days 2 through 5 (Selasa..Jumat)
 * Preserves Monday (index 0) from GitHub commits!
 */
export function applyLoopToBatch(batchData, text, label = '') {
  if (!batchData?.items) return batchData;
  const newItems = batchData.items.map((item, idx) => {
    if (idx === 0) return item; // Senin preserved!
    return {
      ...item,
      summary: text,
    };
  });
  batchData.items = newItems;
  batchData.mode = label || 'Loop 1 Teks';
  return batchData;
}

/**
 * Apply 4 varied distinct notes to days 2 through 5 (Selasa..Jumat)
 * Preserves Monday (index 0) from GitHub commits!
 */
export function applyVaryToBatch(batchData, pkgId = 'A') {
  if (!batchData?.items) return batchData;
  const pkg = VARY_PACKAGES.find((p) => p.id === pkgId) || VARY_PACKAGES[0];
  const newItems = batchData.items.map((item, idx) => {
    if (idx === 0) return item; // Senin preserved!
    const note = pkg.notes[idx - 1] || DEFAULT_WORK_NOTE;
    return {
      ...item,
      summary: note,
    };
  });
  batchData.items = newItems;
  batchData.mode = `Variasi Paket ${pkg.id} (${pkg.name})`;
  return batchData;
}

/**
 * Render Batch Draft 5 Workdays Message & Navigation (NO EMOJIS)
 */
export function renderBatchDraftMessage(startDate, items, modeLabel = '') {
  let text = `<b>[ DRAF BATCH 5 HARI KERJA ]</b>\n\n`;
  text += `Periode: <b>${startDate}</b> (5 Hari Kerja: Senin - Jumat)\n`;
  if (modeLabel) {
    text += `Mode 4 Hari: <b>${escapeHtml(modeLabel)}</b>\n`;
  }
  text += `\n`;

  items.forEach((it, idx) => {
    const statusLabel = it.already_submitted ? '[SUDAH TERCATAT]' : '[BELUM TERSIMPAN]';
    const commitLabel = it.has_commits ? `${it.commit_count} commit` : '0 commit';
    text += `<b>${idx + 1}. ${it.date} (${it.day})</b> - ${commitLabel} - ${statusLabel}\n`;
    text += `<i>${escapeHtml(it.summary.slice(0, 130))}${it.summary.length > 130 ? '...' : ''}</i>\n\n`;
  });

  text += `Atur 4 hari (Selasa-Jumat) dengan tombol di bawah, atau tekan Submit jika sudah sesuai:`;

  const keyboard = new InlineKeyboard()
    .text('[ Submit 5 Hari Sekaligus ]', `simpkl_batch_submit:${startDate}`)
    .row()
    .text('[ Loop 1 Teks ke 4 Hari ]', `simpkl_bloop_menu:${startDate}`)
    .text('[ Variasi Beda Tiap Hari ]', `simpkl_bvary_menu:${startDate}`)
    .row()
    .text('[ Edit Catatan Per Hari ]', `simpkl_bedit_menu:${startDate}`)
    .text('[ Reset Draf ]', `simpkl_batch_reset:${startDate}`)
    .row()
    .text('[ Date Picker ]', 'simpkl_cal_open')
    .text('[ Menu SIMPKL ]', 'simpkl_menu');

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
export async function handleBatchSelection(ctx, startDate, modeLabel = '') {
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

    const batchData = {
      startDate,
      items: enrichedItems,
      mode: modeLabel || 'Otomatis (Senin Commit)',
    };
    batchDrafts.set(userId, batchData);

    const rendered = renderBatchDraftMessage(startDate, enrichedItems, batchData.mode);
    await safeEditOrReply(ctx, rendered.text, rendered.keyboard);
  } catch (err) {
    const keyboard = new InlineKeyboard()
      .text('[ Coba Lagi ]', `simpkl_batch_start:${startDate}`)
      .text('[ Date Picker ]', 'simpkl_cal_open');

    await safeEditOrReply(
      ctx,
      `<b>[ ERROR ]</b> Gagal memproses batch ${startDate}:\n${escapeHtml(err.message)}`,
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
    batchData = { startDate, items, mode: 'Otomatis' };
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
      .text('[ Kembali ke Draf ]', `simpkl_batch_view:${startDate}`);

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
  const userId = String(ctx.from?.id || 'default');

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

  if (data.startsWith('simpkl_batch_reset:')) {
    const startDate = data.replace('simpkl_batch_reset:', '');
    return await handleBatchSelection(ctx, startDate, 'Direset ke GitHub Commit');
  }

  if (data.startsWith('simpkl_batch_view:')) {
    const startDate = data.replace('simpkl_batch_view:', '');
    let batchData = batchDrafts.get(userId);
    if (!batchData || batchData.startDate !== startDate) {
      return await handleBatchSelection(ctx, startDate);
    }
    const rendered = renderBatchDraftMessage(startDate, batchData.items, batchData.mode);
    return await safeEditOrReply(ctx, rendered.text, rendered.keyboard);
  }

  if (data.startsWith('simpkl_batch_submit:')) {
    const startDate = data.replace('simpkl_batch_submit:', '');
    return await handleBatchSubmit(ctx, startDate);
  }

  // --- LOOPER 4 HARI WORKDAYS (SELASA - JUMAT) ---
  if (data.startsWith('simpkl_bloop_menu:')) {
    const startDate = data.replace('simpkl_bloop_menu:', '');
    let text = `<b>[ ATUR 4 HARI: MODE LOOP 1 TEKS ]</b>\n\n`;
    text += `Hari <b>Senin</b> tetap menggunakan catatan dari commit GitHub.\n`;
    text += `4 hari sisanya (<b>Selasa s.d. Jumat</b>) akan diisi dengan 1 teks catatan kegiatan yang sama.\n\n`;
    text += `Pilih salah satu template cepat di bawah, atau kirim perintah:\n`;
    text += `<code>/simpkl loop &lt;isi catatan kamu&gt;</code>\n\n`;
    text += `Daftar Template:\n`;
    LOOP_PRESETS.forEach((p) => {
      text += `• <b>${p.title}</b>:\n  <i>${escapeHtml(p.text)}</i>\n\n`;
    });

    const keyboard = new InlineKeyboard();
    LOOP_PRESETS.forEach((p) => {
      keyboard.text(`[ Loop: ${p.title} ]`, `simpkl_bloop_apply:${startDate}:${p.id}`).row();
    });
    keyboard
      .text('[ Tulis Teks Sendiri ]', `simpkl_bloop_custom:${startDate}`)
      .row()
      .text('[ Kembali ke Draf 5 Hari ]', `simpkl_batch_view:${startDate}`);

    return await safeEditOrReply(ctx, text, keyboard);
  }

  if (data.startsWith('simpkl_bloop_apply:')) {
    const parts = data.split(':');
    const startDate = parts[1];
    const presetId = parts[2];

    let batchData = batchDrafts.get(userId);
    if (!batchData || batchData.startDate !== startDate) {
      await handleBatchSelection(ctx, startDate);
      batchData = batchDrafts.get(userId);
    }

    const preset = LOOP_PRESETS.find((p) => p.id === presetId) || LOOP_PRESETS[0];
    applyLoopToBatch(batchData, preset.text, `Loop (${preset.title})`);

    const rendered = renderBatchDraftMessage(startDate, batchData.items, batchData.mode);
    return await safeEditOrReply(ctx, rendered.text, rendered.keyboard);
  }

  if (data.startsWith('simpkl_bloop_custom:')) {
    const startDate = data.replace('simpkl_bloop_custom:', '');
    let text = `<b>[ CARA INPUT SENDIRI: LOOP 4 HARI ]</b>\n\n`;
    text += `Kirimkan pesan ke bot menggunakan format:\n`;
    text += `<code>/simpkl loop &lt;isi catatan kegiatan kamu&gt;</code>\n\n`;
    text += `Contoh:\n`;
    text += `<code>/simpkl loop Melakukan pengujian alur transaksi kasir dan validasi cetak struk nota belanja.</code>\n\n`;
    text += `Catatan tersebut otomatis diterapkan ke 4 hari (Selasa s.d. Jumat), sedangkan Senin tetap mengambil commit GitHub.`;

    const keyboard = new InlineKeyboard()
      .text('[ Pilih Template Loop ]', `simpkl_bloop_menu:${startDate}`)
      .row()
      .text('[ Kembali ke Draf 5 Hari ]', `simpkl_batch_view:${startDate}`);

    return await safeEditOrReply(ctx, text, keyboard);
  }

  // --- VARIASI BEDA-BEDA 4 HARI (SELASA - JUMAT) ---
  if (data.startsWith('simpkl_bvary_menu:')) {
    const startDate = data.replace('simpkl_bvary_menu:', '');
    let text = `<b>[ ATUR 4 HARI: VARIASI BEDA-BEDA ]</b>\n\n`;
    text += `Hari <b>Senin</b> tetap menggunakan catatan dari commit GitHub.\n`;
    text += `4 hari sisanya (<b>Selasa s.d. Jumat</b>) akan diisi dengan catatan yang berbeda-beda per hari agar tidak monoton.\n\n`;
    text += `Pilih paket variasi kegiatan di bawah ini:`;

    const keyboard = new InlineKeyboard();
    VARY_PACKAGES.forEach((pkg) => {
      keyboard.text(`[ Paket ${pkg.id}: ${pkg.name} ]`, `simpkl_bvary_apply:${startDate}:${pkg.id}`).row();
    });
    keyboard.text('[ Kembali ke Draf 5 Hari ]', `simpkl_batch_view:${startDate}`);

    return await safeEditOrReply(ctx, text, keyboard);
  }

  if (data.startsWith('simpkl_bvary_apply:')) {
    const parts = data.split(':');
    const startDate = parts[1];
    const pkgId = parts[2];

    let batchData = batchDrafts.get(userId);
    if (!batchData || batchData.startDate !== startDate) {
      await handleBatchSelection(ctx, startDate);
      batchData = batchDrafts.get(userId);
    }

    applyVaryToBatch(batchData, pkgId);

    const rendered = renderBatchDraftMessage(startDate, batchData.items, batchData.mode);
    return await safeEditOrReply(ctx, rendered.text, rendered.keyboard);
  }

  // --- EDIT PER HARI DALAM BATCH ---
  if (data.startsWith('simpkl_bedit_menu:')) {
    const startDate = data.replace('simpkl_bedit_menu:', '');
    let batchData = batchDrafts.get(userId);
    if (!batchData || batchData.startDate !== startDate) {
      await handleBatchSelection(ctx, startDate);
      batchData = batchDrafts.get(userId);
    }

    let text = `<b>[ EDIT CATATAN PER HARI ]</b>\n\n`;
    text += `Pilih salah satu hari yang ingin diubah catatannya:\n`;

    const keyboard = new InlineKeyboard();
    batchData.items.forEach((it, idx) => {
      keyboard.text(`[ ${idx + 1}. ${it.day} (${it.date}) ]`, `simpkl_bedit_day:${startDate}:${idx}`).row();
    });
    keyboard.text('[ Kembali ke Draf 5 Hari ]', `simpkl_batch_view:${startDate}`);

    return await safeEditOrReply(ctx, text, keyboard);
  }

  if (data.startsWith('simpkl_bedit_day:')) {
    const parts = data.split(':');
    const startDate = parts[1];
    const dayIndex = parseInt(parts[2], 10);

    const batchData = batchDrafts.get(userId);
    const item = batchData?.items?.[dayIndex];
    if (!item) {
      return await handleBatchSelection(ctx, startDate);
    }

    let text = `<b>[ EDIT HARI ${item.day.toUpperCase()} (${item.date}) ]</b>\n\n`;
    text += `Catatan Saat Ini:\n<i>${escapeHtml(item.summary)}</i>\n\n`;
    text += `Ketik perintah untuk mengubah catatan hari ini:\n`;
    text += `<code>/simpkl set ${item.date} &lt;catatan baru kamu&gt;</code>\n\n`;
    text += `Atau pilih template cepat di bawah:`;

    const keyboard = new InlineKeyboard()
      .text('[ Template: Testing ]', `simpkl_bedit_set:${startDate}:${dayIndex}:1`)
      .text('[ Template: Refactor ]', `simpkl_bedit_set:${startDate}:${dayIndex}:2`)
      .row()
      .text('[ Template: Database ]', `simpkl_bedit_set:${startDate}:${dayIndex}:3`)
      .text('[ Template: UI Kasir ]', `simpkl_bedit_set:${startDate}:${dayIndex}:4`)
      .row()
      .text('[ Kembali ke Pilih Hari ]', `simpkl_bedit_menu:${startDate}`)
      .text('[ Kembali ke Draf 5 Hari ]', `simpkl_batch_view:${startDate}`);

    return await safeEditOrReply(ctx, text, keyboard);
  }

  if (data.startsWith('simpkl_bedit_set:')) {
    const parts = data.split(':');
    const startDate = parts[1];
    const dayIndex = parseInt(parts[2], 10);
    const templateId = parts[3];

    const batchData = batchDrafts.get(userId);
    if (batchData?.items?.[dayIndex]) {
      const preset = LOOP_PRESETS.find((p) => p.id === templateId) || LOOP_PRESETS[0];
      batchData.items[dayIndex].summary = preset.text;
      batchData.mode = `Custom (${batchData.items[dayIndex].day} diubah)`;
    }

    const rendered = renderBatchDraftMessage(startDate, batchData.items, batchData.mode);
    return await safeEditOrReply(ctx, rendered.text, rendered.keyboard);
  }

  // --- CALENDAR PICKER & DETAILS ---
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
    const conf = resolveSimpklConfig();
    let text = `<b>[ INFORMASI INTEGRASI SIMPKL ]</b>\n\n`;
    text += `Portal: <code>https://pkl.smk1bws.sch.id</code>\n`;
    text += `Direktori Tools: <code>${conf.dir}</code>\n`;
    text += `Python Environment: <code>${conf.pythonBin}</code>\n`;
    text += `Runner Script: <code>${conf.runnerScript}</code>\n\n`;
    text += `Perintah Cepat:\n`;
    text += `• <code>/simpkl</code> - Menu utama\n`;
    text += `• <code>/simpkl cal</code> - Buka Date Picker\n`;
    text += `• <code>/simpkl 5days [YYYY-MM-DD]</code> - Submit batch 5 hari kerja\n`;
    text += `• <code>/simpkl loop &lt;teks&gt;</code> - Loop 1 teks ke 4 hari sisa\n`;
    text += `• <code>/simpkl beda [A|B|C]</code> - Variasi teks beda tiap hari\n`;
    text += `• <code>/simpkl today</code> - Draf hari ini\n`;
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
    usage: '/simpkl [cal | 5days [tgl] | loop <teks> | beda [A|B|C] | today | date YYYY-MM-DD | history | set ... | fill ...]',
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

      // /simpkl loop <catatan> atau /simpkl 4days <catatan>
      if (sub === 'loop' || sub === '4days' || sub === 'loop4' || sub === '4hari') {
        const customText = args.slice(1).join(' ').trim();
        if (!customText) {
          return await ctx.reply(
            'Format salah. Gunakan:\n/simpkl loop <isi catatan kegiatan untuk 4 hari sisa>\n\nContoh:\n/simpkl loop Melakukan pengujian alur order kasir dan validasi cetak struk'
          );
        }
        const userId = String(ctx.from?.id || 'default');
        let batchData = batchDrafts.get(userId);
        if (!batchData) {
          const mondayStr = getMondayOfDate();
          const fetchRes = await runSimpklRunner('batch-fetch', { date: mondayStr, count: 5 });
          const items = fetchRes.items.map((it) => ({
            ...it,
            summary: it.summary || it.previous_catatan || DEFAULT_WORK_NOTE,
          }));
          batchData = { startDate: mondayStr, items, mode: 'Loop 1 Teks' };
          batchDrafts.set(userId, batchData);
        }
        applyLoopToBatch(batchData, customText, 'Loop Teks Kustom');
        const rendered = renderBatchDraftMessage(batchData.startDate, batchData.items, batchData.mode);
        return await ctx.reply(rendered.text, {
          parse_mode: 'HTML',
          reply_markup: rendered.keyboard,
        });
      }

      // /simpkl beda [A|B|C] atau /simpkl variasi [A|B|C]
      if (sub === 'beda' || sub === 'variasi' || sub === '4daysbeda' || sub === 'paket') {
        const pkgId = (args[1] || 'A').toUpperCase();
        const userId = String(ctx.from?.id || 'default');
        let batchData = batchDrafts.get(userId);
        if (!batchData) {
          const mondayStr = getMondayOfDate();
          const fetchRes = await runSimpklRunner('batch-fetch', { date: mondayStr, count: 5 });
          const items = fetchRes.items.map((it) => ({
            ...it,
            summary: it.summary || it.previous_catatan || DEFAULT_WORK_NOTE,
          }));
          batchData = { startDate: mondayStr, items, mode: 'Variasi' };
          batchDrafts.set(userId, batchData);
        }
        applyVaryToBatch(batchData, pkgId);
        const rendered = renderBatchDraftMessage(batchData.startDate, batchData.items, batchData.mode);
        return await ctx.reply(rendered.text, {
          parse_mode: 'HTML',
          reply_markup: rendered.keyboard,
        });
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

        // Also update batch draft if present
        const batchData = batchDrafts.get(userId);
        if (batchData?.items) {
          const item = batchData.items.find((it) => it.date === targetDate);
          if (item) {
            item.summary = newCatatan;
            batchData.mode = `Custom (${targetDate} diubah)`;
          }
        }

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
