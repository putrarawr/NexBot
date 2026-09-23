import { registerCommand } from '../../bot/handler.js';
import { logger } from '../../utils/logger.js';

// Mapping alias bahasa ke nama compiler Wandbox
const COMPILER_MAP = {
  python: 'cpython-3.12.7',
  py: 'cpython-3.12.7',
  python3: 'cpython-3.12.7',
  javascript: 'nodejs-20.17.0',
  js: 'nodejs-20.17.0',
  node: 'nodejs-20.17.0',
  typescript: 'typescript-5.6.2',
  ts: 'typescript-5.6.2',
  go: 'go-1.23.2',
  golang: 'go-1.23.2',
  rust: 'rust-1.82.0',
  rs: 'rust-1.82.0',
  php: 'php-8.3.12',
  java: 'openjdk-jdk-22+36',
  cpp: 'gcc-14.2.0',
  'c++': 'gcc-14.2.0',
  c: 'gcc-14.2.0-c',
  bash: 'bash',
  sh: 'bash',
};

export async function executeCode(language, code) {
  const compiler = COMPILER_MAP[language.toLowerCase()];
  if (!compiler) {
    const supported = Object.keys(COMPILER_MAP).join(', ');
    throw new Error(`Bahasa *${language}* belum didukung.\nBahasa tersedia: ${supported}`);
  }

  // Bersihkan markdown code fences jika ada (e.g. ```py ... ```)
  let cleanCode = code.trim();
  if (cleanCode.startsWith('```')) {
    cleanCode = cleanCode.replace(/^```[a-zA-Z0-9_-]*\n?/, '').replace(/\n?```$/, '');
  }

  const payload = {
    compiler,
    code: cleanCode,
  };

  const start = Date.now();
  const res = await fetch('https://wandbox.org/api/compile.json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });

  const duration = Date.now() - start;
  if (!res.ok) {
    throw new Error(`Wandbox runner error HTTP ${res.status}`);
  }

  const data = await res.json();
  const stdout = data.program_output || data.compiler_output || '';
  const stderr = data.program_error || data.compiler_error || '';
  const isSuccess = data.status === '0';

  return {
    isSuccess,
    stdout,
    stderr,
    exitCode: data.status,
    duration,
    compiler,
  };
}

export function registerProgrammingCommands() {
  // 1. Multi-language Code Runner (.run)
  registerCommand({
    name: 'run',
    aliases: ['exec', 'code', 'evalcode'],
    category: 'programming',
    description: 'Menjalankan kode pemrograman di sandbox aman (Python, JS, C++, Go, Rust, Java, PHP, Bash)',
    usage: '.run <bahasa> <code>',
    async execute({ args, reply, prefix }) {
      const language = args[0]?.toLowerCase();
      const code = args.slice(1).join(' ');

      if (!language || !code) {
        let help = `⚠️ *PANDUAN CODE RUNNER*\n\n`;
        help += `Format: \`${prefix}run <bahasa> <code>\`\n\n`;
        help += `*Bahasa Didukung:*\n`;
        help += `• Python: \`${prefix}run py print("Halo Dunia!")\`\n`;
        help += `• JavaScript: \`${prefix}run js console.log(1+1)\`\n`;
        help += `• Go: \`${prefix}run go package main; import "fmt"; func main() { fmt.Println("Halo Go") }\`\n`;
        help += `• PHP: \`${prefix}run php <?php echo "Halo PHP";\`\n`;
        help += `• C++ / Rust / Java / Bash`;
        return reply(help);
      }

      await reply(`⚙️ Menjalankan kode *${language.toUpperCase()}* di sandbox...`);

      try {
        const result = await executeCode(language, code);
        let out = `💻 *HASIL EKSEKUSI (${language.toUpperCase()})*\n\n`;

        if (result.stdout) {
          out += `📤 *Output:*\n\`\`\`\n${result.stdout.trim()}\n\`\`\`\n\n`;
        }

        if (result.stderr) {
          out += `⚠️ *Error / Peringatan:*\n\`\`\`\n${result.stderr.trim()}\n\`\`\`\n\n`;
        }

        if (!result.stdout && !result.stderr) {
          out += `ℹ️ _Program selesai tanpa menghasilkan output._\n\n`;
        }

        out += `⏱️ *Waktu:* ${result.duration}ms | *Status:* ${result.isSuccess ? '✅ Berhasil (Exit 0)' : `❌ Gagal (Exit ${result.exitCode})`}`;
        await reply(out.trim());
      } catch (err) {
        logger.error('Error saat compile code:', err.message);
        await reply(`❌ Eksekusi gagal: ${err.message}`);
      }
    },
  });

  // 2. Regex Tester (.regex)
  registerCommand({
    name: 'regex',
    aliases: ['regextest'],
    category: 'programming',
    description: 'Menguji Regular Expression terhadap sebuah teks',
    usage: '.regex /pattern/flags <string>',
    async execute({ args, reply, prefix }) {
      if (args.length < 2) {
        return reply(`⚠️ Format salah!\nContoh: \`${prefix}regex /[0-9]+/g user123 nomor 456\`\natau: \`${prefix}regex /@([a-z0-9_]+)/gi Halo @john_doe dan @alice\``);
      }

      const patternArg = args[0];
      const testString = args.slice(1).join(' ');

      try {
        let pattern = patternArg;
        let flags = '';

        if (patternArg.startsWith('/') && patternArg.lastIndexOf('/') > 0) {
          const lastSlash = patternArg.lastIndexOf('/');
          pattern = patternArg.slice(1, lastSlash);
          flags = patternArg.slice(lastSlash + 1);
        }

        const regex = new RegExp(pattern, flags);
        const matches = [...testString.matchAll(regex)];

        let out = `🔬 *REGEX TEST RESULT*\n\n`;
        out += `🎯 *Pattern:* \`/${pattern}/${flags}\`\n`;
        out += `📄 *String:* "${testString}"\n\n`;

        if (matches.length > 0) {
          out += `✅ *Ditemukan Cocok:* ${matches.length} matches\n\n`;
          matches.slice(0, 10).forEach((m, idx) => {
            out += `*${idx + 1}.* Match: \`${m[0]}\` (Index: ${m.index})\n`;
            if (m.length > 1) {
              for (let g = 1; g < m.length; g++) {
                out += `   └ Group ${g}: \`${m[g]}\`\n`;
              }
            }
          });
          if (matches.length > 10) {
            out += `\n_...dan ${matches.length - 10} kecocokan lainnya._`;
          }
        } else {
          out += `❌ *Tidak Ditemukan Kecocokan.*`;
        }

        await reply(out.trim());
      } catch (err) {
        await reply(`❌ Pattern Regex tidak valid: ${err.message}`);
      }
    },
  });

  // 3. JSON Formatter & Validator (.json)
  registerCommand({
    name: 'json',
    aliases: ['jsonformat', 'beautifyjson'],
    category: 'programming',
    description: 'Format dan validasi struktur teks JSON',
    usage: '.json <string_json>',
    async execute({ fullText, reply, prefix }) {
      if (!fullText) {
        return reply(`⚠️ Tempelkan teks JSON yang ingin diformat!\nContoh: \`${prefix}json {"nama":"Budi","umur":25,"aktif":true}\``);
      }

      try {
        const parsed = JSON.parse(fullText);
        const formatted = JSON.stringify(parsed, null, 2);

        let out = `✨ *JSON VALID & TERFORMAT:*\n\n`;
        out += `\`\`\`json\n${formatted}\n\`\`\``;
        await reply(out);
      } catch (err) {
        let out = `❌ *JSON TIDAK VALID!*\n\n`;
        out += `Detail Error: _${err.message}_\n\n`;
        out += `💡 *Tips:* Pastikan semua key menggunakan tanda kutip ganda (\`"key": "value"\`) dan koma tidak diletakkan di elemen terakhir.`;
        await reply(out);
      }
    },
  });

  // 4. Developer Cheatsheet (.cheat)
  registerCommand({
    name: 'cheat',
    aliases: ['man', 'cheatsheet'],
    category: 'programming',
    description: 'Referensi cepat perintah Linux, Git, Docker, Python, dsb',
    usage: '.cheat <query>',
    async execute({ args, reply, prefix }) {
      const query = args.join(' ').trim();
      if (!query) {
        return reply(`⚠️ Masukkan topik atau perintah yang ingin dicari!\nContoh: \`${prefix}cheat git commit\` atau \`${prefix}cheat docker run\` atau \`${prefix}cheat chmod\``);
      }

      await reply(`📖 Mencari cheatsheet untuk: *${query}*...`);

      try {
        const url = `https://cheat.sh/${encodeURIComponent(query)}?qT`;
        const res = await fetch(url, {
          headers: { 'User-Agent': 'curl/7.88.1' },
          signal: AbortSignal.timeout(8000),
        });

        if (res.ok) {
          const raw = await res.text();
          // Bersihkan escape ANSI sequences jika ada
          const clean = raw.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').trim();

          if (clean && !clean.includes('Unknown topic') && clean.length > 10) {
            // Potong jika terlalu panjang untuk batas chat WA
            const preview = clean.length > 2000 ? clean.slice(0, 1950) + '\n\n...(dipotong karena batas pesan)' : clean;
            return await reply(`📚 *CHEATSHEET: ${query.toUpperCase()}*\n\n\`\`\`\n${preview}\n\`\`\``);
          }
        }

        // Fallback internal
        await reply(`ℹ️ Cheatsheet untuk *${query}* tidak ditemukan di database online.`);
      } catch (err) {
        logger.error('Error saat fetch cheatsheet:', err.message);
        await reply('❌ Gagal mengambil cheatsheet dari server online.');
      }
    },
  });
}
