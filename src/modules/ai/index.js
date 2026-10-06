import { registerCommand } from '../../bot/handler.js';
import { getConfig } from '../../config.js';
import { logger } from '../../utils/logger.js';
import { extractPhotoBuffer } from '../media/index.js';

export async function askAI(prompt, systemInstruction = '', options = {}) {
  const config = getConfig();
  const groqKey = config.groqApiKey || process.env.GROQ_API_KEY;
  const geminiKey = config.geminiApiKey || process.env.GEMINI_API_KEY;

  const systemMessage = systemInstruction || `Kamu adalah NexBot, asisten virtual AI WhatsApp yang ramah, ringkas, cerdas, dan berbahasa Indonesia yang baik. Jawab langsung ke inti tanpa basa-basi berlebihan. Jangan gunakan emoji dalam balasan.`;

  // 1. Opsi Groq API
  if (groqKey && (config.aiProvider === 'hybrid' || config.aiProvider === 'groq')) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${groqKey}`,
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: systemMessage },
            { role: 'user', content: prompt },
          ],
          temperature: 0.7,
          max_tokens: 1500,
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (res.ok) {
        const data = await res.json();
        const reply = data.choices?.[0]?.message?.content;
        if (reply) return reply.trim();
      }
    } catch (err) {
      logger.warn('Groq API error/timeout, mencoba provider fallback:', err.message);
    }
  }

  // 2. Opsi Google Gemini API
  if (geminiKey && (config.aiProvider === 'hybrid' || config.aiProvider === 'gemini')) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: `${systemMessage}\n\nUser: ${prompt}` }],
            },
          ],
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (res.ok) {
        const data = await res.json();
        const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (reply) return reply.trim();
      }
    } catch (err) {
      logger.warn('Gemini API error/timeout, mencoba free fallback:', err.message);
    }
  }

  // 3. Fallback Zero-Key via POST
  try {
    const payload = {
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: prompt },
      ],
      model: 'openai',
      seed: Math.floor(Math.random() * 10000),
    };

    const res = await fetch('https://text.pollinations.ai/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; NexBot/1.0)',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20000),
    });

    if (res.ok) {
      const text = await res.text();
      if (text && text.trim()) {
        return text.trim();
      }
    }
  } catch (err) {
    logger.warn('Error saat menghubungi Pollinations POST:', err.message);
  }

  // 3b. Fallback via GET Request
  try {
    const getUrl = `https://text.pollinations.ai/${encodeURIComponent(prompt)}`;
    const getRes = await fetch(getUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: AbortSignal.timeout(10000),
    });
    if (getRes.ok) {
      const text = await getRes.text();
      if (text && text.trim()) {
        return text.trim();
      }
    }
  } catch (err) {
    logger.warn('Error saat menghubungi Pollinations GET:', err.message);
  }

  throw new Error('Semua provider AI sedang tidak dapat dijangkau. Coba beberapa saat lagi.');
}

export function registerAiCommands() {
  // 1. Chat AI (.ai)
  registerCommand({
    name: 'ai',
    aliases: ['tanya', 'ask', 'gpt'],
    category: 'ai',
    description: 'Tanya jawab apa saja dengan kecerdasan buatan',
    usage: '.ai <pertanyaan>',
    async execute({ fullText, reply }) {
      if (!fullText) {
        return reply('[!] Silakan masukkan pertanyaan atau topik yang ingin kamu tanyakan.\nContoh: .ai jelaskan perbedaan HTTP dan HTTPS');
      }

      await reply('[-] Sedang memproses...');

      try {
        const answer = await askAI(fullText);
        await reply(`[NexBot AI]\n\n${answer}`);
      } catch (err) {
        logger.error('Error command .ai:', err.message);
        await reply(`[!] Gagal memproses permintaan AI: ${err.message}`);
      }
    },
  });

  // 2. Explain Code (.explain)
  registerCommand({
    name: 'explain',
    aliases: ['jelaskode', 'codeexplain'],
    category: 'ai',
    description: 'Menganalisis dan menjelaskan alur logika kode pemrograman',
    usage: '.explain <kode>',
    async execute({ fullText, reply }) {
      if (!fullText) {
        return reply('[!] Tempelkan kode yang ingin dijelaskan.\nContoh: .explain const sum = (a, b) => a + b;');
      }

      await reply('[-] Menganalisis kode...');

      try {
        const sys = `Kamu adalah code reviewer dan senior software engineer. Jelaskan kode berikut dengan runtut, singkat, sebutkan kompleksitas atau potensi bug jika ada. Jangan gunakan emoji.`;
        const explanation = await askAI(fullText, sys);
        await reply(`[ANALISIS KODE]\n\n${explanation}`);
      } catch (err) {
        await reply(`[!] Gagal menjelaskan kode: ${err.message}`);
      }
    },
  });

  // 3. Summarize Text (.summarize)
  registerCommand({
    name: 'summarize',
    aliases: ['ringkas', 'rangkum'],
    category: 'ai',
    description: 'Meringkas artikel atau teks panjang menjadi poin-poin utama',
    usage: '.summarize <teks>',
    async execute({ fullText, reply }) {
      if (!fullText || fullText.length < 30) {
        return reply('[!] Masukkan teks minimal 30 karakter yang ingin diringkas.');
      }

      await reply('[-] Merangkum teks...');

      try {
        const sys = `Kamu adalah asisten perangkum profesional. Ringkas teks yang diberikan ke dalam bentuk poin-poin penting yang padat dan jelas. Jangan gunakan emoji.`;
        const summary = await askAI(fullText, sys);
        await reply(`[HASIL RINGKASAN]\n\n${summary}`);
      } catch (err) {
        await reply(`[!] Gagal merangkum teks: ${err.message}`);
      }
    },
  });

  // 4. Translate Text (.translate)
  registerCommand({
    name: 'translate',
    aliases: ['tr', 'terjemah'],
    category: 'ai',
    description: 'Menerjemahkan teks ke bahasa yang diinginkan',
    usage: '.translate <bahasa> <teks>',
    async execute({ args, reply }) {
      const targetLang = args[0];
      const textToTranslate = args.slice(1).join(' ');

      if (!targetLang || !textToTranslate) {
        return reply('[!] Format salah.\nContoh: .translate english selamat pagi apa kabar\natau .translate jepang terima kasih banyak');
      }

      try {
        const sys = `Kamu adalah penerjemah bahasa akurat. Terjemahkan teks yang diberikan ke dalam bahasa target: "${targetLang}". Keluarkan HANYA hasil terjemahannya tanpa penjelasan tambahan dan tanpa emoji.`;
        const result = await askAI(textToTranslate, sys);
        let out = `[TERJEMAHAN (${targetLang.toUpperCase()})]\n\n`;
        out += `"${result}"`;
        await reply(out);
      } catch (err) {
        await reply(`[!] Gagal menerjemahkan: ${err.message}`);
      }
    },
  });

  // 5. Text-to-Image AI Generator (/aiimg / /txt2img)
  registerCommand({
    name: 'aiimg',
    aliases: ['txt2img', 'imagine', 'diffusion', 'draw'],
    category: 'ai',
    description: 'Menghasilkan gambar ilustrasi AI dari prompt teks',
    usage: '/aiimg <deskripsi gambar>',
    async execute({ sock, jid, fullText, reply, prefix, react }) {
      const prompt = fullText?.trim();
      if (!prompt) {
        return reply(`[!] Masukkan deskripsi gambar yang ingin dibuat.\nContoh: <code>${prefix}aiimg cybernetic cat in neon tokyo street cinematic 4k</code>`);
      }

      if (typeof react === 'function') await react('👍');

      try {
        const imageBuffer = await generateAiImage(prompt);
        await sock.sendMessage(jid, {
          image: imageBuffer,
          caption: `<b>[ AI IMAGE GENERATOR ]</b>\n\nPrompt: <i>${prompt}</i>`,
        });
      } catch (err) {
        logger.error('Error saat generate AI image:', err.message);
        await reply(`[!] Gagal membuat gambar AI: ${err.message}`);
      }
    },
  });

  // 6. AI Vision / Analisis Gambar (/vision)
  registerCommand({
    name: 'vision',
    aliases: ['tanyafoto', 'analisafoto', 'aivision'],
    category: 'ai',
    description: 'Menganalisis foto dan menjawab pertanyaan seputar gambar via AI Vision',
    usage: '/vision <pertanyaan> [balas foto / kirim foto]',
    async execute({ msg, fullText, reply, prefix, ctx, platform, react }) {
      const photoBuffer = await extractPhotoBuffer({ msg, ctx, platform });
      if (!photoBuffer) {
        return reply(`[!] Format salah. Balas foto atau kirim foto dengan caption <code>${prefix}vision <pertanyaan></code>.`);
      }

      const question = fullText?.trim() || 'Jelaskan gambar ini secara detail dan sebutkan objek apa saja yang ada di dalamnya.';

      if (typeof react === 'function') await react('👍');

      try {
        const answer = await askAiVision(photoBuffer, question);
        await reply(`<b>[ AI VISION ANALYSIS ]</b>\n\n${answer}`);
      } catch (err) {
        logger.error('Error saat AI Vision:', err.message);
        await reply(`[!] Gagal menganalisis gambar: ${err.message}`);
      }
    },
  });
}

export async function generateAiImage(prompt) {
  const cleanPrompt = prompt.trim().slice(0, 400);
  const seed = Math.floor(Math.random() * 1000000);
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(cleanPrompt)}?nologo=1&seed=${seed}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Server AI image merespon status ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 500) throw new Error('Gambar yang dihasilkan kosong atau tidak valid.');
  return buf;
}

export async function askAiVision(imageBuffer, question = 'Jelaskan gambar ini secara detail') {
  const config = getConfig();
  const geminiKey = config.geminiApiKey || process.env.GEMINI_API_KEY;

  if (geminiKey) {
    try {
      const b64 = imageBuffer.toString('base64');
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                { text: `Kamu adalah asisten visual AI yang cerdas. Jawab pertanyaan berikut mengenai gambar dalam bahasa Indonesia yang ringkas, jelas, dan akurat tanpa emoji: ${question}` },
                {
                  inlineData: {
                    mimeType: 'image/jpeg',
                    data: b64,
                  },
                },
              ],
            },
          ],
        }),
        signal: AbortSignal.timeout(25000),
      });

      if (res.ok) {
        const json = await res.json();
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return text.trim();
      }
    } catch (err) {
      logger.warn('Gemini vision API error:', err.message);
    }
  }

  // Fallback hybrid explanation
  return await askAI(`Pengguna menanyakan: "${question}" terkait gambar yang dikirimkan. Berikan jawaban informatif mengenai topik tersebut dan jelaskan cara mengatur GEMINI_API_KEY untuk analisis visual langsung.`);
}
