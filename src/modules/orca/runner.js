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

    // Pastikan user identity git terkonfigurasi di container
    await execAsync('git config user.name "NexBot Orca" && git config user.email "orca@nexbot.local"', { cwd: ROOT_DIR }).catch(() => {});

    await execAsync('git add -A', { cwd: ROOT_DIR });
    await execAsync(`git commit -m "${msg.replace(/"/g, '\\"')}"`, { cwd: ROOT_DIR });

    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    if (token) {
      try {
        await execAsync(`git remote set-url origin https://${token}@github.com/putrarawr/NexBot.git`, { cwd: ROOT_DIR }).catch(() => {});
        await execAsync(`git push https://${token}@github.com/putrarawr/NexBot.git main`, { cwd: ROOT_DIR, timeout: 35000 });
        return `[GIT PUSH OK] Perubahan berhasil di-commit dan di-push otomatis ke GitHub! Commit: "${msg}"`;
      } catch (err) {
        return `[GIT COMMIT OK, PUSH FAILED]: Berhasil commit lokal tapi gagal push: ${err.message}`;
      }
    } else {
      try {
        await execAsync('git push origin main', { cwd: ROOT_DIR, timeout: 35000 });
        return `[GIT PUSH OK] Perubahan berhasil di-commit dan di-push ke branch main! Commit: "${msg}"`;
      } catch {
        return `[GIT COMMIT OK]: Berhasil commit lokal. Tambahkan GITHUB_TOKEN di Railway Variables agar bot bisa push otomatis saat laptop mati.`;
      }
    }
  },
};

/**
 * 3. Tool Definitions untuk Groq (OpenAI Schema)
 */
const TOOLS_DEFINITIONS_OPENAI = [
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
 * 4. Tool Definitions untuk Google Gemini / Antigravity Model
 */
const TOOLS_DEFINITIONS_GEMINI = [
  {
    functionDeclarations: [
      {
        name: 'readFile',
        description: 'Membaca isi file di project',
        parameters: {
          type: 'OBJECT',
          properties: { filePath: { type: 'STRING', description: 'Path relatif file, misal src/index.js' } },
          required: ['filePath'],
        },
      },
      {
        name: 'writeFile',
        description: 'Menulis atau membuat file baru',
        parameters: {
          type: 'OBJECT',
          properties: {
            filePath: { type: 'STRING', description: 'Path file' },
            content: { type: 'STRING', description: 'Isi lengkap file' },
          },
          required: ['filePath', 'content'],
        },
      },
      {
        name: 'editFile',
        description: 'Mengganti potongan kode lama dengan kode baru di dalam file',
        parameters: {
          type: 'OBJECT',
          properties: {
            filePath: { type: 'STRING' },
            oldSnippet: { type: 'STRING' },
            newSnippet: { type: 'STRING' },
          },
          required: ['filePath', 'oldSnippet', 'newSnippet'],
        },
      },
      {
        name: 'listFiles',
        description: 'Melihat daftar file dan folder di project',
        parameters: {
          type: 'OBJECT',
          properties: { dirPath: { type: 'STRING' } },
        },
      },
      {
        name: 'searchCode',
        description: 'Mencari keyword atau pola kode di codebase',
        parameters: {
          type: 'OBJECT',
          properties: {
            pattern: { type: 'STRING' },
            dir: { type: 'STRING' },
          },
          required: ['pattern'],
        },
      },
      {
        name: 'execBash',
        description: 'Menjalankan command shell terminal (misal: npm test, git status, git diff)',
        parameters: {
          type: 'OBJECT',
          properties: { command: { type: 'STRING' } },
          required: ['command'],
        },
      },
      {
        name: 'gitCommitAndPush',
        description: 'Commit semua perubahan yang sudah dibuat dan push ke GitHub repository',
        parameters: {
          type: 'OBJECT',
          properties: { commitMessage: { type: 'STRING' } },
          required: ['commitMessage'],
        },
      },
    ],
  },
];

/**
 * 5. System Prompt Personalities: Normal Mode vs VibeCode Mode
 */
function buildSystemPrompt(mode = 'normal') {
  if (mode === 'vibecode') {
    return `Kamu adalah ORCA VIBECODE AGENT, hacker developer jenius yang beroperasi langsung di server cloud Railway.
GAYA VIBECODE:
- Sangat cepat, intuitif, berenergi tinggi, dan langsung menyelesaikan masalah tanpa basa-basi.
- Gunakan bahasa santai developer ("let's cook", "gaskeun", "vibe check passed", "done").
- Berani memperbaiki kode dengan cepat, langsung test via execBash ('npm test'), lalu simpan dengan gitCommitAndPush.
- Laporkan apa yang sudah diubah secara ringkas dan keren!`;
  }

  return `Kamu adalah ORCA AUTONOMOUS DEV AGENT, insinyur perangkat lunak senior yang beroperasi langsung di server cloud Railway.
GAYA NORMAL MODE:
- Sangat teliti, sistematis, berbasis bukti (evidence-based), dan memprioritaskan stabilitas sistem.
- Alur kerja wajib:
  1. Investigasi: Baca kode atau cari file terkait menggunakan searchCode / readFile.
  2. Implementasi: Edit file secara presisi menggunakan editFile atau writeFile.
  3. Verifikasi: Jalankan 'npm test' via execBash untuk memastikan 0 breaking changes.
  4. Ship: Jalankan gitCommitAndPush untuk menyimpan perubahan ke GitHub.
- Laporkan hasil akhir secara terstruktur: Masalah, Solusi, Hasil Pengujian, dan Status Push.`;
}

/**
 * 6. Autonomous Loop via Google Gemini / Antigravity Model
 */
async function runGeminiAutonomousAgent({ task, geminiKey, mode, onProgress }) {
  const systemText = buildSystemPrompt(mode);
  const contents = [
    {
      role: 'user',
      parts: [{ text: task }],
    },
  ];

  const maxSteps = 8;
  for (let step = 1; step <= maxSteps; step++) {
    if (onProgress) {
      await onProgress(`[ORCA: ${mode.toUpperCase()} (ANTIGRAVITY/GEMINI)] Langkah ${step}/${maxSteps}: Berpikir & menganalisa...`);
    }

    const geminiModels = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash'];
    let res;
    let lastGeminiErr = null;

    for (const model of geminiModels) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
        res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemText }] },
            contents,
            tools: TOOLS_DEFINITIONS_GEMINI,
          }),
          signal: AbortSignal.timeout(35000),
        });

        if (res.ok) {
          break;
        } else {
          const errText = await res.text().catch(() => '');
          lastGeminiErr = new Error(`Gemini [${model}] HTTP ${res.status}: ${errText.slice(0, 150)}`);
        }
      } catch (e) {
        lastGeminiErr = e;
      }
    }

    if (!res || !res.ok) {
      logger.error('Error calling Gemini API:', lastGeminiErr?.message);
      throw lastGeminiErr || new Error('Gagal menghubungi model Gemini / Antigravity.');
    }

    const data = await res.json();
    const candidate = data.candidates?.[0];
    const parts = candidate?.content?.parts || [];
    const functionCalls = parts.filter((p) => p.functionCall).map((p) => p.functionCall);

    contents.push({
      role: 'model',
      parts,
    });

    if (functionCalls.length > 0) {
      const responseParts = [];
      for (const call of functionCalls) {
        const fnName = call.name;
        const fnArgs = call.args || {};

        if (onProgress) {
          await onProgress(`[ORCA: ${mode.toUpperCase()}] Menjalankan tool: <code>${fnName}</code>`);
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

        responseParts.push({
          functionResponse: {
            name: fnName,
            response: { result: toolResult },
          },
        });
      }

      contents.push({
        role: 'user',
        parts: responseParts,
      });
    } else {
      // Selesai tanpa tool call
      const finalReply = parts.map((p) => p.text).filter(Boolean).join('\n') || 'Tugas selesai dieksekusi.';
      return {
        mode,
        engine: 'Antigravity / Gemini 2.0 Flash',
        response: finalReply,
        steps: step,
      };
    }
  }

  return null;
}

/**
 * 7. Autonomous Loop via Groq (Llama-3.3-70b-versatile)
 */
async function runGroqAutonomousAgent({ task, groqKey, mode, onProgress }) {
  const messages = [
    { role: 'system', content: buildSystemPrompt(mode) },
    { role: 'user', content: task },
  ];

  const maxSteps = 8;
  for (let step = 1; step <= maxSteps; step++) {
    if (onProgress) {
      await onProgress(`[ORCA: ${mode.toUpperCase()} (GROQ)] Langkah ${step}/${maxSteps}: Berpikir & menganalisa...`);
    }

    const groqModels = ['llama-3.1-70b-versatile', 'llama-3.1-8b-instant', 'llama3-70b-8192'];
    let completion;
    let lastGroqErr = null;

    for (const model of groqModels) {
      try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${groqKey}`,
          },
          body: JSON.stringify({
            model,
            messages,
            tools: TOOLS_DEFINITIONS_OPENAI,
            tool_choice: 'auto',
            temperature: mode === 'vibecode' ? 0.6 : 0.2,
            max_tokens: 2000,
          }),
          signal: AbortSignal.timeout(30000),
        });

        if (res.ok) {
          completion = await res.json();
          break;
        } else {
          const errText = await res.text().catch(() => '');
          lastGroqErr = new Error(`Groq [${model}] HTTP ${res.status}: ${errText.slice(0, 150)}`);
        }
      } catch (e) {
        lastGroqErr = e;
      }
    }

    if (!completion) {
      logger.error('Error saat memanggil Groq LLM:', lastGroqErr?.message);
      throw lastGroqErr || new Error('Gagal memanggil model Groq.');
    }

    const choice = completion.choices?.[0];
    const assistantMsg = choice?.message;
    if (!assistantMsg) break;

    messages.push(assistantMsg);

    if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
      for (const toolCall of assistantMsg.tool_calls) {
        const fnName = toolCall.function.name;
        let fnArgs = {};
        try {
          fnArgs = JSON.parse(toolCall.function.arguments);
        } catch {}

        if (onProgress) {
          await onProgress(`[ORCA: ${mode.toUpperCase()}] Menjalankan tool: <code>${fnName}</code>`);
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
      return {
        mode,
        engine: 'Groq Llama-3.3-70B',
        response: assistantMsg.content || 'Tugas selesai dieksekusi.',
        steps: step,
      };
    }
  }

  return null;
}

/**
 * 8. Main Entrypoint: Autonomous Agent Runner
 */
export async function runOrcaAgent({ task, mode = null, onProgress = null }) {
  const chosenMode = mode || activeAgentMode;
  const config = getConfig();
  const geminiKey = (process.env.GEMINI_API_KEY || config.geminiApiKey || '').trim();
  const groqKey = (process.env.GROQ_API_KEY || config.groqApiKey || '').trim();

  if (onProgress) {
    await onProgress(`[ORCA: ${chosenMode.toUpperCase()}] Menginisialisasi model AI...`);
  }

  // 1. Prioritas 1: Google Gemini / Antigravity Model
  if (geminiKey) {
    try {
      const result = await runGeminiAutonomousAgent({ task, geminiKey, mode: chosenMode, onProgress });
      if (result) return result;
    } catch (geminiErr) {
      logger.warn('Gemini agent runner error:', geminiErr.message);
      if (!groqKey) {
        return {
          mode: chosenMode,
          engine: 'Gemini / Antigravity Model',
          response: `[ERROR GEMINI RUNNER]\n\n${geminiErr.message}\n\nPastikan GEMINI_API_KEY di Railway Variables valid dan aktif.`,
          steps: 1,
        };
      }
    }
  }

  // 2. Prioritas 2: Groq Llama-3.3-70B Model
  if (groqKey) {
    try {
      const result = await runGroqAutonomousAgent({ task, groqKey, mode: chosenMode, onProgress });
      if (result) return result;
    } catch (groqErr) {
      logger.warn('Groq agent runner error:', groqErr.message);
      return {
        mode: chosenMode,
        engine: 'Groq Model',
        response: `[ERROR GROQ RUNNER]\n\n${groqErr.message}\n\nPastikan GROQ_API_KEY di Railway Variables valid.`,
        steps: 1,
      };
    }
  }

  // 3. Fallback: Direct Action Engine (Jika belum ada API Key AI terpasang)
  if (onProgress) {
    await onProgress(`[ORCA: ${chosenMode.toUpperCase()}] Menjalankan direct execution engine...`);
  }

  // Cek jika perintah meminta tes (word boundary, hindari cocok palsu)
  if (/\b(test|smoke|pengujian|uji)\b/i.test(task)) {
    const testOut = await orcaTools.execBash({ command: 'npm test' });
    return {
      mode: chosenMode,
      engine: 'Direct Script Runner',
      response: `[HASIL PENGUJIAN OTOMATIS]\n\n${testOut}`,
      steps: 1,
    };
  }

  // Cek jika perintah meminta status git secara eksplisit (hindari kata "github")
  if (/\b(git\s+status|git\s+diff|git\s+branch|status\s+repo)\b/i.test(task)) {
    const gitStatus = await orcaTools.execBash({ command: 'git status -s && git branch -v' });
    return {
      mode: chosenMode,
      engine: 'Direct Git Runner',
      response: `[STATUS REPOSITORY GITHUB]\n\n${gitStatus || 'Working tree clean, tidak ada perubahan pending.'}`,
      steps: 1,
    };
  }

  // Pesan panduan jika belum ada API key AI yang terpasang di Railway
  return {
    mode: chosenMode,
    engine: 'Standby Assistant',
    response: `[ORCA AGENT STANDBY]\n\nTugas diterima: "${task}"\n\nAgar Orca Agent dapat membaca kode, mengedit file, dan membuat fitur secara otonom dari Antigravity / Gemini saat laptop Anda mati, masukkan salah satu API Key gratis berikut ke menu Variables di Railway:\n\n• <b>GEMINI_API_KEY</b> (Model Antigravity / Gemini Flash gratis di https://aistudio.google.com/app/apikey)\n• <b>GROQ_API_KEY</b> (Model Llama-3.3-70B gratis di https://console.groq.com/keys)\n• <b>GITHUB_TOKEN</b> (Personal Access Token GitHub agar bot bisa git push otomatis)\n\nFitur terminal tetap aktif: Anda bisa menjalankan perintah langsung via <code>/sh &lt;perintah&gt;</code>.`,
    steps: 1,
  };
}
