import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { getConfig } from '../../config.js';
import { logger } from '../../utils/logger.js';

const execAsync = promisify(exec);
const ROOT_DIR = process.cwd();

// State mode aktif: 'normal' | 'vibecode'
let activeAgentMode = 'normal';

export function getAgentMode() {
  return activeAgentMode;
}

export function setAgentMode(mode) {
  if (mode === 'vibecode' || mode === 'normal') {
    activeAgentMode = mode;
  }
  return activeAgentMode;
}

/**
 * 1. Safe Path Helper
 */
function resolveSafePath(userPath) {
  const resolved = path.resolve(ROOT_DIR, userPath);
  if (!resolved.startsWith(ROOT_DIR)) {
    throw new Error(`Akses di luar direktori project dilarang: ${userPath}`);
  }
  return resolved;
}

/**
 * 2. Agent Tools
 */
export const orcaTools = {
  async readFile({ filePath }) {
    const fullPath = resolveSafePath(filePath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`File tidak ditemukan: ${filePath}`);
    }
    const content = fs.readFileSync(fullPath, 'utf-8');
    // Batasi preview file jika terlalu besar (> 1000 baris)
    const lines = content.split('\n');
    if (lines.length > 800) {
      return lines.slice(0, 800).join('\n') + `\n\n... [${lines.length - 800} baris dipotong]`;
    }
    return content;
  },

  async writeFile({ filePath, content }) {
    const fullPath = resolveSafePath(filePath);
    const parentDir = path.dirname(fullPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    fs.writeFileSync(fullPath, content, 'utf-8');
    return `[OK] File berhasil ditulis: ${filePath} (${Buffer.byteLength(content)} bytes)`;
  },

  async editFile({ filePath, oldSnippet, newSnippet }) {
    const fullPath = resolveSafePath(filePath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`File tidak ditemukan: ${filePath}`);
    }
    const content = fs.readFileSync(fullPath, 'utf-8');
    if (!content.includes(oldSnippet)) {
      throw new Error(`Potongan kode lama (oldSnippet) tidak ditemukan dalam ${filePath}`);
    }
    const updated = content.replace(oldSnippet, newSnippet);
    fs.writeFileSync(fullPath, updated, 'utf-8');
    return `[OK] File berhasil disunting: ${filePath}`;
  },

  async listFiles({ dirPath = '.' }) {
    const targetDir = resolveSafePath(dirPath);
    const entries = fs.readdirSync(targetDir, { withFileTypes: true });
    const ignored = new Set(['node_modules', '.git', 'auth']);
    const list = [];

    for (const ent of entries) {
      if (ignored.has(ent.name)) continue;
      const type = ent.isDirectory() ? '[DIR]' : '[FILE]';
      list.push(`${type} ${path.join(dirPath, ent.name)}`);
    }
    return list.slice(0, 50).join('\n');
  },

  async searchCode({ pattern, dir = 'src' }) {
    const targetDir = resolveSafePath(dir);
    const regex = new RegExp(pattern, 'i');
    const matches = [];

    function walk(currDir) {
      if (matches.length >= 25) return;
      const entries = fs.readdirSync(currDir, { withFileTypes: true });
      for (const ent of entries) {
        if (ent.name === 'node_modules' || ent.name === '.git') continue;
        const full = path.join(currDir, ent.name);
        if (ent.isDirectory()) {
          walk(full);
        } else if (ent.isFile() && (ent.name.endsWith('.js') || ent.name.endsWith('.json') || ent.name.endsWith('.html'))) {
          try {
            const text = fs.readFileSync(full, 'utf-8');
            const lines = text.split('\n');
            lines.forEach((line, idx) => {
              if (regex.test(line) && matches.length < 25) {
                const rel = path.relative(ROOT_DIR, full);
                matches.push(`${rel}:${idx + 1}: ${line.trim()}`);
              }
            });
          } catch {}
        }
      }
    }

    walk(targetDir);
    return matches.length > 0 ? matches.join('\n') : 'Tidak ditemukan kecocokan pola kode.';
  },

  async execBash({ command }) {
    // Sanitasi command berbahaya
    const dangerous = ['rm -rf /', ':(){ :|:& };:', 'mkfs', 'dd if='];
    for (const d of dangerous) {
      if (command.includes(d)) {
        throw new Error(`Command berbahaya diblokir: ${d}`);
      }
    }

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: ROOT_DIR,
        timeout: 45000,
        env: { ...process.env, CI: 'true' },
      });
      const out = (stdout || stderr || '[Command selesai tanpa output]').trim();
      return out.length > 2000 ? out.slice(0, 2000) + '\n... [output dipotong]' : out;
    } catch (err) {
      return `[ERROR EXEC]: ${err.message}\n${err.stdout || ''}\n${err.stderr || ''}`.slice(0, 2000);
    }
  },

  async gitCommitAndPush({ commitMessage }) {
    const msg = commitMessage || 'fix: autonomous update by orca agent';
    const status = await execAsync('git status --porcelain', { cwd: ROOT_DIR }).catch(() => ({ stdout: '' }));
    if (!status.stdout.trim()) {
      return '[GIT] Tidak ada perubahan kode yang perlu dicommit.';
    }

    await execAsync('git add -A', { cwd: ROOT_DIR });
    await execAsync(`git commit -m "${msg.replace(/"/g, '\\"')}"`, { cwd: ROOT_DIR });

    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    if (token) {
      try {
        await execAsync(`git push https://${token}@github.com/putrarawr/NexBot.git main`, { cwd: ROOT_DIR, timeout: 30000 });
        return `[GIT PUSH OK] Perubahan berhasil di-commit dan di-push otomatis ke GitHub! Commit: "${msg}"`;
      } catch (err) {
        return `[GIT COMMIT OK, PUSH FAILED]: Berhasil commit lokal tapi gagal push: ${err.message}`;
      }
    } else {
      try {
        await execAsync('git push origin main', { cwd: ROOT_DIR, timeout: 30000 });
        return `[GIT PUSH OK] Perubahan berhasil di-commit dan di-push ke branch main! Commit: "${msg}"`;
      } catch {
        return `[GIT COMMIT OK]: Berhasil commit lokal. Tambahkan GITHUB_TOKEN di Railway Variables agar bot bisa push otomatis saat laptop mati.`;
      }
    }
  },
};

/**
 * 3. OpenAI-Compatible Tools Schema untuk Groq / LLM
 */
const TOOLS_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'readFile',
      description: 'Membaca isi file di project',
      parameters: {
        type: 'object',
        properties: { filePath: { type: 'string', description: 'Path relatif file, misal src/index.js' } },
        required: ['filePath'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'writeFile',
      description: 'Menulis atau membuat file baru',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'Path file' },
          content: { type: 'string', description: 'Isi lengkap file' },
        },
        required: ['filePath', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'editFile',
      description: 'Mengganti potongan kode lama dengan kode baru di dalam file',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'Path file' },
          oldSnippet: { type: 'string', description: 'Potongan kode lama yang ingin diganti persis' },
          newSnippet: { type: 'string', description: 'Kode pengganti yang baru' },
        },
        required: ['filePath', 'oldSnippet', 'newSnippet'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'listFiles',
      description: 'Melihat daftar file dan folder di project',
      parameters: {
        type: 'object',
        properties: { dirPath: { type: 'string', description: 'Direktori target, default .' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'searchCode',
      description: 'Mencari keyword atau pola kode di codebase',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Pola regex atau kata yang dicari' },
          dir: { type: 'string', description: 'Direktori pencarian, default src' },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'execBash',
      description: 'Menjalankan command shell terminal (misal: npm test, git status, git diff)',
      parameters: {
        type: 'object',
        properties: { command: { type: 'string', description: 'Command shell yang akan dijalankan' } },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'gitCommitAndPush',
      description: 'Commit semua perubahan yang sudah dibuat dan push ke GitHub repository',
      parameters: {
        type: 'object',
        properties: { commitMessage: { type: 'string', description: 'Pesan commit git yang jelas' } },
        required: ['commitMessage'],
      },
    },
  },
];

/**
 * 4. System Prompt Personalities: Normal Mode vs VibeCode Mode
 */
function buildSystemPrompt(mode = 'normal') {
  if (mode === 'vibecode') {
    return `Kamu adalah ORCA VIBECODE AGENT, seorang hacker developer jenius yang beroperasi langsung di dalam server cloud Railway.
GAYA VIBECODE:
- Sangat cepat, intuitif, berenergi tinggi, dan langsung menyelesaikan masalah tanpa basa-basi berlebih.
- Gunakan bahasa gaul programmer santai tapi 100% kompeten ("let's cook", "gaskeun", "vibe check passed", "done bro").
- Berani memperbaiki kode dengan cepat, langsung test, lalu git commit & push.
- Selalu periksa hasil test setelah mengedit file.
- Jika tugas selesai, laporkan apa yang sudah diubah secara ringkas dan keren!`;
  }

  return `Kamu adalah ORCA AUTONOMOUS DEV AGENT, insinyur perangkat lunak senior yang beroperasi langsung di dalam server cloud Railway.
GAYA NORMAL MODE:
- Sangat teliti, berbasis bukti (evidence-based), berorientasi pada kebenaran arsitektur, dan memprioritaskan kestabilan sistem.
- Langkah kerja sistematis:
  1. Investigasi: Baca kode atau cari file terkait menggunakan searchCode / readFile.
  2. Implementasi: Edit file secara presisi menggunakan editFile atau writeFile.
  3. Verifikasi: Jalankan 'npm test' via execBash untuk memastikan 0 breaking changes.
  4. Ship: Jalankan gitCommitAndPush untuk menyimpan perubahan ke GitHub.
- Laporkan hasil akhir secara terstruktur: Masalah, Solusi, Hasil Pengujian, dan Status Push.`;
}

/**
 * 5. Autonomous Loop Engine
 */
export async function runOrcaAgent({ task, mode = null, onProgress = null }) {
  const chosenMode = mode || activeAgentMode;
  const config = getConfig();
  const groqKey = config.groqApiKey || process.env.GROQ_API_KEY;

  if (onProgress) {
    await onProgress(`[ORCA: ${chosenMode.toUpperCase()}] Memulai analisa tugas...`);
  }

  // Jika ada Groq API Key, jalankan Autonomous Function Calling Loop
  if (groqKey) {
    const messages = [
      { role: 'system', content: buildSystemPrompt(chosenMode) },
      { role: 'user', content: task },
    ];

    const maxSteps = 8;
    for (let step = 1; step <= maxSteps; step++) {
      if (onProgress) {
        await onProgress(`[ORCA: ${chosenMode.toUpperCase()}] Langkah ${step}/${maxSteps}: Berpikir & menganalisa...`);
      }

      let completion;
      try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${groqKey}`,
          },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages,
            tools: TOOLS_DEFINITIONS,
            tool_choice: 'auto',
            temperature: chosenMode === 'vibecode' ? 0.6 : 0.2,
            max_tokens: 2000,
          }),
          signal: AbortSignal.timeout(30000),
        });

        if (!res.ok) {
          throw new Error(`Groq API returned HTTP ${res.status}`);
        }
        completion = await res.json();
      } catch (err) {
        logger.error('Error saat memanggil Groq LLM:', err.message);
        break;
      }

      const choice = completion.choices?.[0];
      const assistantMsg = choice?.message;
      if (!assistantMsg) break;

      messages.push(assistantMsg);

      // Jika LLM memanggil tools
      if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
        for (const toolCall of assistantMsg.tool_calls) {
          const fnName = toolCall.function.name;
          let fnArgs = {};
          try {
            fnArgs = JSON.parse(toolCall.function.arguments);
          } catch {}

          if (onProgress) {
            await onProgress(`[ORCA: ${chosenMode.toUpperCase()}] Menjalankan tool: <code>${fnName}</code>`);
          }

          let toolResult = '';
          const handler = orcaTools[fnName];
          if (handler) {
            try {
              toolResult = await handler(fnArgs);
            } catch (toolErr) {
              toolResult = `[ERROR TOOL]: ${toolErr.message}`;
            }
          } else {
            toolResult = `Tool ${fnName} tidak dikenali.`;
          }

          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: fnName,
            content: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult),
          });
        }
      } else {
        // Selesai tanpa tool call tambahan
        return {
          mode: chosenMode,
          response: assistantMsg.content || 'Tugas selesai dieksekusi.',
          steps: step,
        };
      }
    }
  }

  // Fallback jika tidak ada Groq API Key atau kuota habis:
  // Evaluasi tugas berbasis pola aksi langsung (Direct Action Engine)
  if (onProgress) {
    await onProgress(`[ORCA: ${chosenMode.toUpperCase()}] Menjalankan direct execution engine...`);
  }

  // Jika tugas meminta test
  if (/test|uji|smoke/i.test(task)) {
    const testOut = await orcaTools.execBash({ command: 'npm test' });
    return {
      mode: chosenMode,
      response: `[HASIL PENGUJIAN OTOMATIS]\n\n${testOut}`,
      steps: 1,
    };
  }

  // Jika tugas meminta git status / cek perubahan
  if (/git|status|diff|branch/i.test(task)) {
    const gitStatus = await orcaTools.execBash({ command: 'git status -s && git branch -v' });
    return {
      mode: chosenMode,
      response: `[STATUS REPOSITORY GITHUB]\n\n${gitStatus || 'Working tree clean, tidak ada perubahan pending.'}`,
      steps: 1,
    };
  }

  // Tanggapan default
  return {
    mode: chosenMode,
    response: `[ORCA AGENT SIAP]\n\nTugas diterima: "${task}"\n\nUntuk kemampuan autonomous function-calling penuh (baca file, edit kode, perbaiki bug otonom), pastikan GROQ_API_KEY sudah disetel di Railway Variables.\nKamu juga bisa langsung menjalankan perintah via <code>/sh &lt;command&gt;</code> atau <code>/fix</code>.`,
    steps: 1,
  };
}
