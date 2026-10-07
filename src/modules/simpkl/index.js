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
    path.resolve(fileDir, 'scripts'),
    path.resolve(process.cwd(), 'src/modules/simpkl/scripts'),
    process.env.SIMPKL_DIR,
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
    path.resolve(fileDir, 'scripts/.venv/bin/python3'),
    '/home/putra/Project-Coding/tools-scraping-jurnal/.venv/bin/python3',
    path.join(os.homedir(), 'Project-Coding/tools-scraping-jurnal/.venv/bin/python3'),
    'python3',
  ];
  const pythonBin = pythonCandidates.find((bin) => bin === 'python3' || fs.existsSync(bin)) || 'python3';

  // Candidate history files
  const historyCandidates = [
    process.env.SIMPKL_HISTORY_FILE,
    path.resolve(process.cwd(), 'data/simpkl_history.json'),
    path.join(selectedDir, 'history.json'),
    path.resolve(fileDir, 'scripts/history.json'),
    '/home/putra/Project-Coding/tools-scraping-jurnal/history.json',
    path.join(os.homedir(), 'Project-Coding/tools-scraping-jurnal/history.json'),
  ].filter(Boolean);
  const historyFile = historyCandidates.find((f) => fs.existsSync(f)) || path.resolve(process.cwd(), 'data/simpkl_history.json');

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
  let d;
  if (!dateInput) {
    d = new Date();
  } else if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    const [y, m, day] = dateInput.split('-').map(Number);
    d = new Date(y, m - 1, day);
  } else {
    d = new Date(dateInput);
  }
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
}

/**
 * Get SIMPKL credentials from env or config files
 */
export function getSimpklCredentials() {
  let username = (process.env.SIMPKL_USERNAME || '').trim();
  let password = (process.env.SIMPKL_PASSWORD || '').trim();

  if (!username || !password) {
    const fileDir = path.dirname(fileURLToPath(import.meta.url));
    const authFiles = [
      path.resolve(process.cwd(), 'data/simpkl_auth.json'),
      path.resolve(process.cwd(), 'data/config.json'),
      path.resolve(fileDir, 'scripts/simpkl_auth.json'),
      path.resolve(fileDir, '../../data/simpkl_auth.json'),
      path.resolve(fileDir, '../../data/config.json'),
    ];
    for (const af of authFiles) {
      if (fs.existsSync(af)) {
        try {
          const raw = fs.readFileSync(af, 'utf-8');
          const data = JSON.parse(raw);
          if (!username) username = (data.simpklUsername || data.username || '').trim();
          if (!password) password = (data.simpklPassword || data.password || '').trim();
          if (username && password) break;
        } catch {}
      }
    }
  }

  return { username, password };
}

/**
 * Save SIMPKL credentials to data/simpkl_auth.json and data/config.json
 */
export function saveSimpklCredentials(username, password) {
  const u = (username || '').trim();
  const p = (password || '').trim();
  process.env.SIMPKL_USERNAME = u;
  process.env.SIMPKL_PASSWORD = p;

  const fileDir = path.dirname(fileURLToPath(import.meta.url));
  const targets = [
    path.resolve(process.cwd(), 'data/simpkl_auth.json'),
    path.resolve(fileDir, 'scripts/simpkl_auth.json'),
  ];
  for (const t of targets) {
    try {
      fs.mkdirSync(path.dirname(t), { recursive: true });
      fs.writeFileSync(t, JSON.stringify({ username: u, password: p }, null, 2), 'utf-8');
    } catch {}
  }

  try {
    const cfgFile = path.resolve(process.cwd(), 'data/config.json');
    if (fs.existsSync(cfgFile)) {
      const cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf-8'));
      cfg.simpklUsername = u;
      cfg.simpklPassword = p;
      fs.writeFileSync(cfgFile, JSON.stringify(cfg, null, 2), 'utf-8');
    }
  } catch {}
}

/**
 * Save SIMPKL session cookie (ci_session) directly
 */
export function saveSimpklSessionCookie(cookieValue) {
  const cleanVal = cookieValue.replace(/^ci_session=/i, '').replace(/;.*$/, '').trim();
  const cookieData = [
    {
      name: 'ci_session',
      value: cleanVal,
      domain: 'pkl.smk1bws.sch.id',
      path: '/',
      secure: true,
      httpOnly: true,
    },
  ];
  const fileDir = path.dirname(fileURLToPath(import.meta.url));
  const targets = [
    path.resolve(process.cwd(), 'data/simpkl_cookies.json'),
    path.resolve(fileDir, 'scripts/simpkl_cookies.json'),
    path.resolve(fileDir, 'simpkl_cookies.json'),
    path.resolve(process.cwd(), 'src/modules/simpkl/scripts/simpkl_cookies.json'),
  ];
  for (const t of targets) {
    try {
      fs.mkdirSync(path.dirname(t), { recursive: true });
      fs.writeFileSync(t, JSON.stringify(cookieData, null, 2), 'utf-8');
    } catch {}
  }
}

/**
 * Get active SIMPKL session cookie value from disk
 */
export function getSimpklSavedCookie() {
  const fileDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(process.cwd(), 'data/simpkl_cookies.json'),
    path.resolve(fileDir, 'scripts/simpkl_cookies.json'),
    path.resolve(fileDir, 'simpkl_cookies.json'),
    path.resolve(process.cwd(), 'src/modules/simpkl/scripts/simpkl_cookies.json'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf-8');
        const data = JSON.parse(raw);
        if (Array.isArray(data)) {
          const ci = data.find((c) => c.name === 'ci_session');
          if (ci?.value) return ci.value;
        } else if (data?.ci_session) {
          return data.ci_session;
        }
      }
    } catch {}
  }
  return null;
}

/**
 * Execute simpkl_runner.py and parse JSON output
 */
export async function runSimpklRunner(action, params = {}) {
  const config = resolveSimpklConfig();
  const creds = getSimpklCredentials();
  const savedCookie = getSimpklSavedCookie();

  const args = [config.runnerScript, '--action', action];
  if (params.date) args.push('--date', params.date);
  if (params.catatan) args.push('--catatan', params.catatan);
  if (params.entries) args.push('--entries', params.entries);
  if (params.limit) args.push('--limit', String(params.limit));
  if (params.count) args.push('--count', String(params.count));
  if (creds.username) args.push('--username', creds.username);
  if (creds.password) args.push('--password', creds.password);
  if (savedCookie) args.push('--cookie', savedCookie);

  const runnerEnv = {
    ...process.env,
    SIMPKL_USERNAME: creds.username || process.env.SIMPKL_USERNAME || '',
    SIMPKL_PASSWORD: creds.password || process.env.SIMPKL_PASSWORD || '',
    ...(savedCookie ? { SIMPKL_COOKIE: savedCookie } : {}),
  };

  return new Promise((resolve, reject) => {
    execFile(
      config.pythonBin,
      args,
      { cwd: config.dir, env: runnerEnv, timeout: 120000 },
      (error, stdout, stderr) => {
        if (error) {
          if (error.killed || error.signal === 'SIGTERM') {
            return reject(new Error('Proses SIMPKL melebihi batas waktu (timeout). Silakan periksa koneksi atau coba sinkronisasi ulang.'));
          }
          const errMsg = stderr?.trim() || error.message;
          return reject(new Error(errMsg));
        }

        try {
          const raw = stdout.trim();
          const jsonLine = raw.split('\n').filter((l) => l.trim().startsWith('{') || l.trim().startsWith('[')).pop() || raw;
          const json = JSON.parse(jsonLine);
          resolve(json);
        } catch (err) {
          reject(new Error(`Gagal membaca output runner: ${stdout || err.message}`));
        }
      }
    );
  });
}

/**
 * Native Node.js GitHub commit fetcher & summarizer
 * Completely independent of Python packages for instant zero-dependency execution
 */
export function summarizeCommitsNode(commits) {
  if (!commits || commits.length === 0) return '';
  const byRepo = {};
  for (const c of commits) {
    if (!byRepo[c.repo]) byRepo[c.repo] = [];
    byRepo[c.repo].push(c.message);
  }

  const parts = [];
  for (const [repo, messages] of Object.entries(byRepo)) {
    const repoShort = repo.split('/').pop();
    if (messages.length === 1) {
      parts.push(`Melakukan pengembangan pada proyek ${repoShort}: ${messages[0]}.`);
    } else {
      parts.push(`Melakukan pengembangan pada proyek ${repoShort} dengan rincian pekerjaan sebagai berikut: ${messages.join('; ')}.`);
    }
  }
  return parts.join('\n\n');
}

export async function fetchGithubCommitsBetweenNode(sinceIso, untilIso) {
  const token = process.env.GITHUB_TOKEN || '';
  const repos = (process.env.GITHUB_REPOS || 'putrarawr/cafe-pos').split(',').map((r) => r.trim()).filter(Boolean);
  const authorEnv = process.env.GITHUB_AUTHORS || 'putrarawr,WisWho,Paissaiueo,broiosme,Fais Adhyasta Pratama';
  const filterAuthors = authorEnv.trim() !== '*' && authorEnv.trim().toLowerCase() !== 'all';
  const authors = authorEnv.split(',').map((a) => a.trim().toLowerCase()).filter(Boolean);

  const headers = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'NexBot-SIMPKL-Fetcher',
  };
  if (token) headers['Authorization'] = `token ${token}`;

  const commitsByDate = {};

  for (const repo of repos) {
    let page = 1;
    while (page <= 3) {
      const url = `https://api.github.com/repos/${repo}/commits?since=${sinceIso}&until=${untilIso}&per_page=100&page=${page}`;
      try {
        const resp = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
        if (!resp.ok) break;
        const data = await resp.json();
        if (!Array.isArray(data) || data.length === 0) break;

        for (const item of data) {
          const authorLogin = (item.author?.login || '').toLowerCase();
          const authorName = (item.commit?.author?.name || '').toLowerCase();

          if (filterAuthors) {
            const matches = authors.some((a) => a === authorLogin || a === authorName);
            if (!matches) continue;
          }

          const commitDateObj = new Date(item.commit.author.date);
          const dateStr = commitDateObj.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
          if (!commitsByDate[dateStr]) commitsByDate[dateStr] = [];

          commitsByDate[dateStr].push({
            repo,
            sha: item.sha.slice(0, 7),
            message: (item.commit.message || '').split('\n')[0],
            author: item.author?.login || item.commit.author.name,
          });
        }
        page++;
      } catch {
        break;
      }
    }
  }

  return commitsByDate;
}

export async function fetchBatchWorkdaysNode(startDateStr, count = 5) {
  const startDt = new Date(startDateStr);
  const workdays = [];
  const curr = new Date(startDt);
  while (workdays.length < count) {
    const dayOfWeek = curr.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      workdays.push(new Date(curr));
    }
    curr.setDate(curr.getDate() + 1);
  }

  const endDt = workdays[workdays.length - 1];
  const sinceIso = `${workdays[0].toISOString().split('T')[0]}T00:00:00Z`;
  const nextEnd = new Date(endDt);
  nextEnd.setDate(nextEnd.getDate() + 1);
  const untilIso = `${nextEnd.toISOString().split('T')[0]}T23:59:59Z`;

  const commitsByDate = await fetchGithubCommitsBetweenNode(sinceIso, untilIso);
  const historyDates = getSubmittedDatesSet();
  const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

  const items = workdays.map((dt) => {
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;
    const commits = commitsByDate[dateStr] || [];
    const summary = summarizeCommitsNode(commits);
    const alreadySubmitted = historyDates.has(dateStr);

    return {
      date: dateStr,
      day: DAY_NAMES[dt.getDay()],
      has_commits: commits.length > 0,
      commit_count: commits.length,
      summary,
      already_submitted: alreadySubmitted,
      previous_catatan: '',
    };
  });

  return {
    status: 'success',
    start_date: items[0].date,
    end_date: items[items.length - 1].date,
    total_days: items.length,
    items,
  };
}

export async function fetchSingleDateNode(dateStr) {
  const dt = new Date(dateStr);
  const sinceIso = `${dateStr}T00:00:00Z`;
  const untilIso = `${dateStr}T23:59:59Z`;

  const commitsByDate = await fetchGithubCommitsBetweenNode(sinceIso, untilIso);
  const commits = commitsByDate[dateStr] || [];
  const summary = summarizeCommitsNode(commits);
  const historyDates = getSubmittedDatesSet();
  const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

  return {
    status: 'success',
    date: dateStr,
    day: DAY_NAMES[dt.getDay()],
    is_weekend: dt.getDay() === 0 || dt.getDay() === 6,
    has_commits: commits.length > 0,
    commit_count: commits.length,
    summary,
    commits,
    already_submitted: historyDates.has(dateStr),
    previous_catatan: '',
  };
}

/**
 * Read submitted dates from history.json candidates
 */
export function getSubmittedDatesSet() {
  try {
    const config = resolveSimpklConfig();
    const fileDir = path.dirname(fileURLToPath(import.meta.url));
    const candidates = [
      config.historyFile,
      path.resolve(process.cwd(), 'data/simpkl_history.json'),
      path.resolve(config.dir, 'history.json'),
      path.resolve(fileDir, 'scripts/history.json'),
      '/home/putra/Project-Coding/tools-scraping-jurnal/history.json',
      path.join(os.homedir(), 'Project-Coding/tools-scraping-jurnal/history.json'),
    ].filter(Boolean);

    for (const f of candidates) {
      if (fs.existsSync(f)) {
        try {
          const raw = fs.readFileSync(f, 'utf-8');
          const data = JSON.parse(raw);
          const keys = Object.keys(data);
          if (keys.length > 0) {
            return new Set(keys);
          }
        } catch {}
      }
    }
  } catch {}
  return new Set();
}

/**
 * Record a single date to all candidate history files
 */
export function recordSubmittedDate(dateStr, catatan = 'Tercatat di SIMPKL') {
  try {
    const config = resolveSimpklConfig();
    const fileDir = path.dirname(fileURLToPath(import.meta.url));
    const filesToUpdate = new Set([
      config.historyFile,
      path.resolve(process.cwd(), 'data/simpkl_history.json'),
      path.resolve(config.dir, 'history.json'),
      path.resolve(fileDir, 'scripts/history.json'),
    ]);

    for (const filePath of filesToUpdate) {
      if (!filePath) continue;
      try {
        let data = {};
        if (fs.existsSync(filePath)) {
          data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        }
        data[dateStr] = {
          catatan,
          submitted_at: new Date().toISOString(),
        };
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
      } catch {}
    }
  } catch {}
}

/**
 * Set last submitted date manually
 */
export function setSimpklLastSubmittedDate(targetDateStr) {
  if (!targetDateStr || !/^\d{4}-\d{2}-\d{2}$/.test(targetDateStr)) {
    throw new Error('Format tanggal salah. Gunakan YYYY-MM-DD');
  }
  recordSubmittedDate(targetDateStr, 'Diset manual oleh user');
  return getSimpklWorkweekTracking();
}

/**
 * Tracking riwayat jurnal SIMPKL:
 * Menghitung tanggal terakhir submit dan daftar minggu kerja yang belum disubmit secara urut
 */
export function getSimpklWorkweekTracking() {
  const submittedDates = getSubmittedDatesSet();
  const sortedDates = Array.from(submittedDates).sort();
  const lastSubmittedDate = sortedDates.length > 0 ? sortedDates[sortedDates.length - 1] : null;

  let searchStart;
  if (lastSubmittedDate) {
    const [y, m, d] = lastSubmittedDate.split('-').map(Number);
    const lastDateObj = new Date(y, m - 1, d);
    const nextDay = new Date(lastDateObj);
    nextDay.setDate(nextDay.getDate() + 1);
    while (nextDay.getDay() === 0 || nextDay.getDay() === 6) {
      nextDay.setDate(nextDay.getDate() + 1);
    }
    searchStart = nextDay;
  } else {
    const d = new Date();
    d.setDate(d.getDate() - 28);
    searchStart = d;
  }

  const startMondayStr = getMondayOfDate(searchStart);
  const now = new Date();
  const currentMondayStr = getMondayOfDate(now);

  const [sy, sm, sd] = startMondayStr.split('-').map(Number);
  let curr = new Date(sy, sm - 1, sd);
  const [cy, cm, cd] = currentMondayStr.split('-').map(Number);
  const endLimit = new Date(cy, cm - 1, cd);

  const unsubmittedWeeks = [];

  while (curr <= endLimit) {
    const monStr = `${curr.getFullYear()}-${String(curr.getMonth() + 1).padStart(2, '0')}-${String(curr.getDate()).padStart(2, '0')}`;
    const friObj = new Date(curr);
    friObj.setDate(friObj.getDate() + 4);
    const friStr = `${friObj.getFullYear()}-${String(friObj.getMonth() + 1).padStart(2, '0')}-${String(friObj.getDate()).padStart(2, '0')}`;

    let missingDays = 0;
    for (let i = 0; i < 5; i++) {
      const checkD = new Date(curr);
      checkD.setDate(checkD.getDate() + i);
      const dStr = `${checkD.getFullYear()}-${String(checkD.getMonth() + 1).padStart(2, '0')}-${String(checkD.getDate()).padStart(2, '0')}`;
      if (!submittedDates.has(dStr)) {
        missingDays++;
      }
    }

    const isCurrent = monStr === currentMondayStr;
    const prevMonObj = new Date(endLimit);
    prevMonObj.setDate(prevMonObj.getDate() - 7);
    const prevMonStr = `${prevMonObj.getFullYear()}-${String(prevMonObj.getMonth() + 1).padStart(2, '0')}-${String(prevMonObj.getDate()).padStart(2, '0')}`;
    const isPrevious = monStr === prevMonStr;

    let label = `${monStr} s.d. ${friStr}`;
    if (isCurrent) label += ' (Minggu Ini)';
    else if (isPrevious) label += ' (Minggu Lalu)';

    if (missingDays > 0) {
      unsubmittedWeeks.push({
        monday: monStr,
        friday: friStr,
        missingDays,
        isCurrent,
        isPrevious,
        label,
      });
    }

    curr.setDate(curr.getDate() + 7);
  }

  const targetWeek = unsubmittedWeeks.length > 0 ? unsubmittedWeeks[0] : null;

  return {
    lastSubmittedDate,
    unsubmittedWeeks,
    totalWeeksBehind: unsubmittedWeeks.length,
    targetWeek,
  };
}

export const pendingSimpklPrompts = new Map();

/**
 * Mulai alur interaktif submit: cek tracking, fetch commit Senin, dan tanya kalimat 4 hari ke user
 */
export async function startSimpklSubmitPrompt(ctx, targetMondayOverride = null) {
  const userId = String(ctx.from?.id || 'default');
  const tracking = getSimpklWorkweekTracking();

  if (tracking.totalWeeksBehind === 0 && !targetMondayOverride) {
    let text = `<b>[ STATUS JURNAL SIMPKL: UP-TO-DATE ]</b>\n\n`;
    text += `Seluruh jurnal hingga minggu ini sudah lengkap terisi dan tercatat di sistem.\n`;
    text += `Terakhir Tercatat: <b>${tracking.lastSubmittedDate || 'Tidak ada'}</b>\n\n`;
    text += `Jika ingin mengisi ulang minggu tertentu, gunakan perintah:\n`;
    text += `<code>/simpkl 5days YYYY-MM-DD</code>`;

    const keyboard = new InlineKeyboard()
      .text('[ Date Picker ]', 'simpkl_cal_open')
      .text('[ Riwayat Jurnal ]', 'simpkl_history')
      .row()
      .text('[ Menu SIMPKL ]', 'simpkl_menu');

    return await safeEditOrReply(ctx, text, keyboard);
  }

  let targetWeek = tracking.targetWeek;
  if (targetMondayOverride) {
    const found = tracking.unsubmittedWeeks.find((w) => w.monday === targetMondayOverride);
    if (found) {
      targetWeek = found;
    } else {
      const monStr = targetMondayOverride;
      const monDate = new Date(monStr);
      const friDate = new Date(monDate);
      friDate.setDate(friDate.getDate() + 4);
      targetWeek = {
        monday: monStr,
        friday: friDate.toISOString().split('T')[0],
        missingDays: 5,
        isCurrent: false,
        isPrevious: false,
        label: `${monStr} s.d. ${friDate.toISOString().split('T')[0]}`,
      };
    }
  }

  if (!targetWeek) {
    const curMon = getMondayOfDate();
    const curFriObj = new Date(curMon);
    curFriObj.setDate(curFriObj.getDate() + 4);
    targetWeek = {
      monday: curMon,
      friday: curFriObj.toISOString().split('T')[0],
      missingDays: 5,
      isCurrent: true,
      isPrevious: false,
      label: `${curMon} s.d. ${curFriObj.toISOString().split('T')[0]} (Minggu Ini)`,
    };
  }

  const targetMonday = targetWeek.monday;
  const targetFriday = targetWeek.friday;

  await safeEditOrReply(
    ctx,
    `<b>[ MEMERIKSA TRACKING ]</b> Mengambil commit GitHub hari Senin <code>${targetMonday}</code>...`
  );

  let mondaySummary = '';
  let mondayCommits = [];
  try {
    const fetchRes = await fetchSingleDateNode(targetMonday);
    mondaySummary = fetchRes.summary || '';
    mondayCommits = fetchRes.commits || [];
  } catch {
    const fetchRes = await runSimpklRunner('fetch', { date: targetMonday }).catch(() => null);
    mondaySummary = fetchRes?.summary || '';
    mondayCommits = fetchRes?.commits || [];
  }

  if (!mondaySummary) {
    mondaySummary = 'Melakukan pengembangan pada proyek cafe-pos, perbaikan form barang, dan pengujian modul kasir.';
  }

  pendingSimpklPrompts.set(userId, {
    targetMonday,
    targetFriday,
    mondaySummary,
    mondayCommits,
    targetWeekLabel: targetWeek.label,
    totalWeeksBehind: tracking.totalWeeksBehind,
    timestamp: Date.now(),
  });

  let text = `<b>[ TRACKING URUTAN JURNAL SIMPKL ]</b>\n\n`;
  text += `Status Riwayat:\n`;
  text += `• Terakhir Disubmit: <b>${tracking.lastSubmittedDate || 'Belum ada'}</b>\n`;
  text += `• Minggu Belum Disubmit: <b>${tracking.totalWeeksBehind} Minggu Tertinggal</b>\n`;
  text += `• Target Antrean Urutan: <b>${escapeHtml(targetWeek.label)}</b>\n\n`;

  text += `<b>Aktivitas Commit Senin (${targetMonday}):</b>\n`;
  text += `<i>${escapeHtml(mondaySummary)}</i>\n\n`;

  text += `<b>untuk 4 hari mau di isi apa putra ?</b>\n`;
  text += `<i>(Ketik 1 kalimat langsung di chat untuk mengisi Selasa s.d. Jumat)</i>`;

  const keyboard = new InlineKeyboard();

  keyboard
    .text('[ Template Testing ]', `simpkl_quick_sentence:${targetMonday}:testing`)
    .text('[ Template Refactor ]', `simpkl_quick_sentence:${targetMonday}:refactor`)
    .row();

  if (tracking.unsubmittedWeeks.length > 1) {
    const otherWeeks = tracking.unsubmittedWeeks.filter((w) => w.monday !== targetMonday);
    otherWeeks.slice(0, 2).forEach((ow) => {
      const shortLabel = ow.isCurrent ? 'Minggu Ini' : (ow.isPrevious ? 'Minggu Lalu' : ow.monday);
      keyboard.text(`[ Target: ${shortLabel} ]`, `simpkl_submit_target:${ow.monday}`);
    });
    keyboard.row();
  }

  keyboard
    .text('[ Batalkan ]', 'simpkl_cancel_prompt')
    .text('[ Menu SIMPKL ]', 'simpkl_menu');

  return await safeEditOrReply(ctx, text, keyboard);
}

/**
 * Tangani balasan 1 kalimat dari user untuk mengisi 4 hari kerja sisa
 */
export async function handleSimpklUserReply({ ctx, userId, text, prompt = null }) {
  const activePrompt = prompt || pendingSimpklPrompts.get(String(userId));
  if (!activePrompt) return false;

  pendingSimpklPrompts.delete(String(userId));

  const { targetMonday, mondaySummary, targetWeekLabel, totalWeeksBehind } = activePrompt;
  const startDt = new Date(targetMonday);
  const items = [];
  const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

  for (let i = 0; i < 5; i++) {
    const cur = new Date(startDt);
    cur.setDate(cur.getDate() + i);
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const d = String(cur.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;
    const day = DAY_NAMES[cur.getDay()];

    const summary = i === 0 ? mondaySummary : text;
    items.push({
      date: dateStr,
      day,
      has_commits: i === 0,
      commit_count: i === 0 ? (activePrompt.mondayCommits?.length || 1) : 0,
      summary,
      already_submitted: false,
      previous_catatan: '',
    });
  }

  batchDrafts.set(String(userId), {
    startDate: targetMonday,
    items,
    mode: 'Input 1 Kalimat Putra',
  });

  let replyText = `<b>[ DRAF 5 HARI SIAP SUBMIT ]</b>\n\n`;
  replyText += `Periode: <b>${items[0].date} s.d. ${items[4].date}</b>\n`;
  replyText += `Urutan Antrean: <b>${escapeHtml(targetWeekLabel)}</b>\n`;
  replyText += `Status: <b>Sisa ${totalWeeksBehind} Minggu Belum Disubmit</b>\n\n`;

  replyText += `<b>1. ${items[0].date} (Senin)</b> [Dari Commit GitHub]\n`;
  replyText += `<i>${escapeHtml(items[0].summary)}</i>\n\n`;

  for (let i = 1; i < 5; i++) {
    replyText += `<b>${i + 1}. ${items[i].date} (${items[i].day})</b> [Dari Balasan Kamu]\n`;
    replyText += `<i>${escapeHtml(items[i].summary)}</i>\n\n`;
  }

  replyText += `Periksa catatan di atas. Tekan tombol di bawah untuk langsung mengirim kelima jurnal ini ke portal SIMPKL:`;

  const keyboard = new InlineKeyboard()
    .text('[ Kirim 5 Jurnal Ini ke SIMPKL ]', `simpkl_batch_submit:${targetMonday}`)
    .row()
    .text('[ Ubah Kalimat 4 Hari ]', `simpkl_submit_target:${targetMonday}`)
    .text('[ Menu SIMPKL ]', 'simpkl_menu');

  try {
    return await ctx.reply(replyText, {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });
  } catch {
    return null;
  }
}

/**
 * Message interceptor untuk menangkap 1 kalimat balasan dari user
 */
export async function handleSimpklMessageInterceptor({ ctx, userId, chatId, text, reply }) {
  if (!text) return false;
  const prompt = pendingSimpklPrompts.get(String(userId));
  if (!prompt) return false;

  const trimmed = text.trim();

  if (trimmed === '/batal' || trimmed === '/cancel' || trimmed.toLowerCase() === 'batal' || trimmed.toLowerCase() === 'cancel') {
    pendingSimpklPrompts.delete(String(userId));
    if (reply) {
      await reply('Pengisian draf jurnal dibatalkan.');
    }
    return true;
  }

  if (trimmed.startsWith('/') || trimmed.startsWith('.')) {
    pendingSimpklPrompts.delete(String(userId));
    return false;
  }

  await handleSimpklUserReply({ ctx, userId: String(userId), text: trimmed, prompt });
  return true;
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
  const tracking = getSimpklWorkweekTracking();
  const behindLabel = tracking.totalWeeksBehind > 0
    ? `(${tracking.totalWeeksBehind} Minggu Tertinggal)`
    : '(Up-To-Date)';

  const keyboard = new InlineKeyboard()
    .text(`[ Submit Jurnal Urut ${behindLabel} ]`, 'simpkl_submit_flow:auto')
    .row()
    .text('[ Buka Date Picker / Kalender ]', 'simpkl_cal_open')
    .text('[ Submit Batch 5 Hari ]', 'simpkl_batch_menu')
    .row()
    .text('[ Jurnal Hari Ini ]', 'simpkl_today')
    .text('[ Jurnal Kemarin ]', 'simpkl_yesterday')
    .row()
    .text('[ Riwayat 10 Jurnal ]', 'simpkl_history')
    .text('[ Sinkron Portal ]', 'simpkl_sync_portal')
    .row()
    .text('[ Menu Utama Bot ]', 'menu_main');

  let text = `<b>[ SISTEM AUTO-FILLER JURNAL SIMPKL ]</b>\n\n`;
  text += `Target Portal: <code>pkl.smk1bws.sch.id</code>\n`;
  text += `Status Urutan: <b>${tracking.totalWeeksBehind} Minggu Belum Disubmit</b>\n`;
  if (tracking.lastSubmittedDate) {
    text += `Terakhir Disubmit: <b>${tracking.lastSubmittedDate}</b>\n`;
  }
  if (tracking.targetWeek) {
    text += `Antrean Berikutnya: <b>${escapeHtml(tracking.targetWeek.label)}</b>\n`;
  }
  text += `\nPilih salah satu menu di bawah ini:`;

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
    let res;
    try {
      res = await fetchSingleDateNode(dateStr);
    } catch {
      res = await runSimpklRunner('fetch', { date: dateStr });
    }
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

    recordSubmittedDate(dateStr, catatan);
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
    let res;
    try {
      res = await fetchBatchWorkdaysNode(startDate, 5);
    } catch {
      res = await runSimpklRunner('batch-fetch', { date: startDate, count: 5 });
    }
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
      if (r.status === 'success' || r.status === 'skipped') {
        const itemCatatan = batchData.items?.find((it) => it.date === r.date)?.summary || r.message;
        recordSubmittedDate(r.date, itemCatatan);
      }
    });

    text += `\nSeluruh jurnal yang berhasil telah tersimpan di portal SIMPKL dan dicatat ke history.\n\n`;

    const updatedTracking = getSimpklWorkweekTracking();
    if (updatedTracking.totalWeeksBehind > 0) {
      text += `<b>Status Antrean Urutan Terbaru:</b>\n`;
      text += `• Sisa Tertinggal: <b>${updatedTracking.totalWeeksBehind} Minggu Belum Disubmit</b>\n`;
      text += `• Antrean Berikutnya: <b>${escapeHtml(updatedTracking.targetWeek?.label || '')}</b>\n\n`;
      text += `Tekan tombol di bawah untuk lanjut mengisi minggu berikutnya secara urut:`;
    } else {
      text += `<b>[ SEMUA JURNAL TELAH UP-TO-DATE ]</b>\n`;
      text += `Selamat! Seluruh minggu jurnal SIMPKL hingga minggu ini telah lengkap tersimpan.`;
    }

    const keyboard = new InlineKeyboard();
    if (updatedTracking.totalWeeksBehind > 0) {
      keyboard.text('[ Lanjut Submit Minggu Berikutnya ]', 'simpkl_submit_flow:auto').row();
    }
    keyboard
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

  if (data === 'simpkl_cancel_prompt') {
    pendingSimpklPrompts.delete(userId);
    let text = `<b>[ PENGISIAN DRAF DIBATALKAN ]</b>\n\nSesi pengisian draf jurnal telah dibatalkan.`;
    const keyboard = new InlineKeyboard()
      .text('[ Menu SIMPKL ]', 'simpkl_menu')
      .text('[ Date Picker ]', 'simpkl_cal_open');
    return await safeEditOrReply(ctx, text, keyboard);
  }

  if (data === 'simpkl_sync_portal') {
    await safeEditOrReply(ctx, '<b>[ SINKRONISASI ]</b> Menghubungkan ke portal SIMPKL untuk mengecek riwayat jurnal...');
    try {
      const res = await runSimpklRunner('sync');
      if (res.status !== 'success') {
        throw new Error(res.message || 'Gagal sinkronisasi');
      }
      if (Array.isArray(res.dates)) {
        res.dates.forEach((d) => recordSubmittedDate(d, 'Tercatat di SIMPKL'));
      }
      const tracking = getSimpklWorkweekTracking();
      let text = `<b>[ SINKRONISASI PORTAL BERHASIL ]</b>\n\n`;
      text += `Total Jurnal Tercatat: <b>${res.total_existing}</b>\n`;
      text += `Entri Baru Ditambahkan: <b>${res.synced_new}</b>\n\n`;
      text += `Status Urutan:\n`;
      text += `• Terakhir Disubmit: <b>${tracking.lastSubmittedDate || 'Belum ada'}</b>\n`;
      text += `• Minggu Belum Disubmit: <b>${tracking.totalWeeksBehind} Minggu Tertinggal</b>\n`;
      if (tracking.targetWeek) {
        text += `• Antrean Berikutnya: <b>${escapeHtml(tracking.targetWeek.label)}</b>\n`;
      }

      const keyboard = new InlineKeyboard();
      if (tracking.totalWeeksBehind > 0) {
        keyboard.text('[ Submit Jurnal Urut ]', 'simpkl_submit_flow:auto').row();
      }
      keyboard
        .text('[ Date Picker ]', 'simpkl_cal_open')
        .text('[ Riwayat Jurnal ]', 'simpkl_history')
        .row()
        .text('[ Menu SIMPKL ]', 'simpkl_menu');

      return await safeEditOrReply(ctx, text, keyboard);
    } catch (err) {
      const keyboard = new InlineKeyboard().text('[ Menu SIMPKL ]', 'simpkl_menu');
      return await safeEditOrReply(ctx, `<b>[ GAGAL SINKRONISASI ]</b> ${escapeHtml(err.message)}`, keyboard);
    }
  }

  if (data === 'simpkl_submit_flow:auto') {
    return await startSimpklSubmitPrompt(ctx);
  }

  if (data === 'simpkl_submit_flow:prev') {
    const prevMonObj = new Date(getMondayOfDate());
    prevMonObj.setDate(prevMonObj.getDate() - 7);
    const prevMonStr = prevMonObj.toISOString().split('T')[0];
    return await startSimpklSubmitPrompt(ctx, prevMonStr);
  }

  if (data.startsWith('simpkl_submit_target:')) {
    const targetDate = data.replace('simpkl_submit_target:', '');
    return await startSimpklSubmitPrompt(ctx, targetDate);
  }

  if (data.startsWith('simpkl_quick_sentence:')) {
    const parts = data.split(':');
    const type = parts[2] || parts[1];
    let sentence = 'Melakukan pengujian fungsional fitur kasir, cetak struk nota belanja, dan pemeliharaan aplikasi cafe-pos.';
    if (type === 'refactor') {
      sentence = 'Melakukan refactoring kode controller, optimasi query database stok, dan penanganan bug.';
    }
    return await handleSimpklUserReply({ ctx, userId, text: sentence });
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

      // /simpkl submit [auto | next | prev | lastweek | minggulalu | thisweek | YYYY-MM-DD]
      if (sub === 'submit' || sub === 'kirim' || sub === 'isi' || sub === 'urut') {
        const opt = (args[1] || '').toLowerCase();

        if (opt === 'prev' || opt === 'lastweek' || opt === 'minggulalu') {
          const prevMonObj = new Date(getMondayOfDate());
          prevMonObj.setDate(prevMonObj.getDate() - 7);
          const prevMonStr = prevMonObj.toISOString().split('T')[0];
          return await startSimpklSubmitPrompt(ctx, prevMonStr);
        }

        if (opt === 'thisweek' || opt === 'current' || opt === 'mingguini') {
          const curMonStr = getMondayOfDate();
          return await startSimpklSubmitPrompt(ctx, curMonStr);
        }

        if (/^\d{4}-\d{2}-\d{2}$/.test(opt)) {
          const monStr = getMondayOfDate(opt);
          return await startSimpklSubmitPrompt(ctx, monStr);
        }

        // Default: otomatis mendeteksi tracking riwayat dan mengambil antrean urutan berikutnya
        return await startSimpklSubmitPrompt(ctx);
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
      if (sub === 'fill') {
        const targetDate = args[1];
        const newCatatan = args.slice(2).join(' ').trim();

        if (!targetDate || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate) || !newCatatan) {
          return await ctx.reply('Format salah. Gunakan:\n/simpkl fill YYYY-MM-DD Catatan kegiatan kamu');
        }

        const userId = String(ctx.from?.id || 'default');
        draftNotes.set(`${userId}:${targetDate}`, newCatatan);
        return await handleDateSubmit(ctx, targetDate);
      }

      // /simpkl setlast [YYYY-MM-DD]
      if (sub === 'setlast' || sub === 'synclast') {
        const targetDate = args[1] || '2026-09-25';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
          return await ctx.reply('Format tanggal salah. Gunakan YYYY-MM-DD, contoh:\n/simpkl setlast 2026-09-25');
        }
        recordSubmittedDate(targetDate, 'Diset manual oleh user');
        const tracking = getSimpklWorkweekTracking();
        let text = `<b>[ SINKRONISASI TANGGAL TERAKHIR ]</b>\n\n`;
        text += `Tanggal terakhir submit berhasil diset ke: <b>${targetDate}</b>\n\n`;
        text += `Status Riwayat Sekarang:\n`;
        text += `• Terakhir Disubmit: <b>${tracking.lastSubmittedDate || 'Belum ada'}</b>\n`;
        text += `• Minggu Belum Disubmit: <b>${tracking.totalWeeksBehind} Minggu Tertinggal</b>\n`;
        if (tracking.targetWeek) {
          text += `• Target Antrean Urutan: <b>${escapeHtml(tracking.targetWeek.label)}</b>\n\n`;
          text += `Ketik <code>/simpkl submit</code> untuk melanjutkan pengisian urut.`;
        } else {
          text += `\nSeluruh jurnal hingga minggu ini sudah lengkap terisi!`;
        }

        const keyboard = new InlineKeyboard();
        if (tracking.totalWeeksBehind > 0) {
          keyboard.text('[ Mulai Submit Urut ]', 'simpkl_submit_flow:auto').row();
        }
        keyboard
          .text('[ Date Picker ]', 'simpkl_cal_open')
          .text('[ Riwayat Jurnal ]', 'simpkl_history')
          .row()
          .text('[ Menu SIMPKL ]', 'simpkl_menu');

        return await ctx.reply(text, {
          parse_mode: 'HTML',
          reply_markup: keyboard,
        });
      }

      // /simpkl sync
      if (sub === 'sync' || sub === 'portal') {
        await ctx.reply('Menghubungkan ke portal SIMPKL untuk sinkronisasi riwayat jurnal...');
        try {
          const res = await runSimpklRunner('sync');
          if (res.status !== 'success') {
            throw new Error(res.message || 'Gagal sinkronisasi');
          }
          if (Array.isArray(res.dates)) {
            res.dates.forEach((d) => recordSubmittedDate(d, 'Tercatat di SIMPKL'));
          }
          const tracking = getSimpklWorkweekTracking();
          let text = `<b>[ SINKRONISASI PORTAL BERHASIL ]</b>\n\n`;
          text += `Total Jurnal Tercatat: <b>${res.total_existing}</b>\n`;
          text += `Entri Baru Ditambahkan: <b>${res.synced_new}</b>\n\n`;
          text += `Status Tracking:\n`;
          text += `• Terakhir Disubmit: <b>${tracking.lastSubmittedDate || 'Belum ada'}</b>\n`;
          text += `• Minggu Belum Disubmit: <b>${tracking.totalWeeksBehind} Minggu Tertinggal</b>\n`;
          if (tracking.targetWeek) {
            text += `• Antrean Berikutnya: <b>${escapeHtml(tracking.targetWeek.label)}</b>\n`;
          }

          const keyboard = new InlineKeyboard();
          if (tracking.totalWeeksBehind > 0) {
            keyboard.text('[ Submit Jurnal Urut ]', 'simpkl_submit_flow:auto').row();
          }
          keyboard
            .text('[ Date Picker ]', 'simpkl_cal_open')
            .text('[ Riwayat Jurnal ]', 'simpkl_history')
            .row()
            .text('[ Menu SIMPKL ]', 'simpkl_menu');

          return await ctx.reply(text, {
            parse_mode: 'HTML',
            reply_markup: keyboard,
          });
        } catch (err) {
          return await ctx.reply(`[!] Gagal sinkronisasi dengan portal SIMPKL: ${err.message}`);
        }
      }

      // /simpkl auth [username] [password] atau /simpkl login [username] [password]
      if (sub === 'auth' || sub === 'login') {
        const usernameArg = args[1];
        const passwordArg = args.slice(2).join(' ').trim();

        if (usernameArg && passwordArg) {
          saveSimpklCredentials(usernameArg, passwordArg);
          return await ctx.reply(
            `<b>[ AUTENTIKASI SIMPKL DISIMPAN ]</b>\n\n` +
            `Akun SIMPKL berhasil diperbarui:\n` +
            `• Username / NISN: <code>${escapeHtml(usernameArg)}</code>\n` +
            `• Password: <code>${'*'.repeat(passwordArg.length)}</code>\n\n` +
            `Kredensial telah disimpan dan siap digunakan untuk pengisian otomatis.`,
            { parse_mode: 'HTML' }
          );
        }

        const creds = getSimpklCredentials();
        let text = `<b>[ STATUS AUTENTIKASI SIMPKL ]</b>\n\n`;
        if (creds.username && creds.password) {
          text += `• Status: <b>Terkonfigurasi Aktif</b>\n`;
          text += `• Username: <code>${escapeHtml(creds.username)}</code>\n`;
          text += `• Password: <code>${'*'.repeat(creds.password.length)}</code>\n\n`;
          text += `Untuk memperbarui, kirim perintah:\n<code>/simpkl auth &lt;username&gt; &lt;password&gt;</code>`;
        } else {
          text += `• Status: <b>Belum Lengkap</b>\n\n`;
          text += `Silakan daftarkan akun SIMPKL kamu dengan mengetik:\n`;
          text += `<code>/simpkl auth &lt;username/nisn&gt; &lt;password&gt;</code>`;
        }

        const keyboard = new InlineKeyboard()
          .text('[ Menu SIMPKL ]', 'simpkl_menu');

        return await ctx.reply(text, {
          parse_mode: 'HTML',
          reply_markup: keyboard,
        });
      }

      // /simpkl cookie [ci_session_value]
      if (sub === 'cookie' || sub === 'session') {
        const cookieVal = args[1]?.trim();
        if (cookieVal) {
          saveSimpklSessionCookie(cookieVal);
          return await ctx.reply(
            `<b>[ SESSION COOKIE DISIMPAN ]</b>\n\n` +
            `Cookie sesi <code>ci_session</code> berhasil disimpan.\n` +
            `Bot sekarang dapat membuka portal SIMPKL secara instan menggunakan sesi aktif ini tanpa hambatan challenge Turnstile.`,
            { parse_mode: 'HTML' }
          );
        }

        return await ctx.reply(
          `<b>[ CARA INPUT COOKIE SIMPKL ]</b>\n\n` +
          `Jika Turnstile pada server terhambat verifikasi bot, kamu bisa memasukkan cookie sesi langsung:\n\n` +
          `Format:\n<code>/simpkl cookie &lt;nilai_ci_session&gt;</code>\n\n` +
          `Nilai <i>ci_session</i> dapat dilihat di browser setelah login pada menu Inspect &gt; Application &gt; Cookies &gt; pkl.smk1bws.sch.id.`,
          { parse_mode: 'HTML' }
        );
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
