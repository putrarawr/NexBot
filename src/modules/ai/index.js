import { registerCommand } from '../../bot/handler.js';
import { getConfig } from '../../config.js';
import { logger } from '../../utils/logger.js';

export async function askAI(prompt, systemInstruction = '', options = {}) {
  const config = getConfig();
  const groqKey = config.groqApiKey || process.env.GROQ_API_KEY;
  const geminiKey = config.geminiApiKey || process.env.GEMINI_API_KEY;

  const systemMessage = systemInstruction || `Kamu adalah NexBot, asisten virtual AI WhatsApp yang ramah, ringkas, cerdas, dan berbahasa Indonesia yang baik. Jawab langsung ke inti tanpa basa-basi berlebihan.`;

  // 1. Opsi Groq API (Kecepatan tinggi Llama 3)
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

  // 3. Fallback Zero-Key (Gratis tanpa API key)
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
        return reply('⚠️ Silakan masukkan pertanyaan atau topik yang ingin kamu tanyakan!\nContoh: `.ai jelaskan perbedaan HTTP dan HTTPS`');
      }

      await reply('💭 _Sedang berpikir..._');

      try {
        const answer = await askAI(fullText);
        await reply(`🤖 *NexBot AI:*\n\n${answer}`);
      } catch (err) {
        logger.error('Error command .ai:', err.message);
        await reply(`❌ Maaf, gagal memproses permintaan AI: ${err.message}`);
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
        return reply('⚠️ Tempelkan kode yang ingin dijelaskan!\nContoh: `.explain const sum = (a, b) => a + b;`');
      }

      await reply('🔍 _Sedang membedah kode..._');

      try {
        const sys = `Kamu adalah code reviewer dan senior software engineer. Jelaskan kode berikut dengan runtut, singkat, sebutkan kompleksitas atau potensi bug jika ada.`;
        const explanation = await askAI(fullText, sys);
        await reply(`💻 *ANALISIS KODE:*\n\n${explanation}`);
      } catch (err) {
        await reply(`❌ Gagal menjelaskan kode: ${err.message}`);
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
        return reply('⚠️ Masukkan teks minimal 30 karakter yang ingin diringkas!');
      }

      await reply('📝 _Sedang merangkum inti sari teks..._');

      try {
        const sys = `Kamu adalah asisten perangkum profesional. Ringkas teks yang diberikan ke dalam bentuk poin-poin penting yang padat dan jelas.`;
        const summary = await askAI(fullText, sys);
        await reply(`📋 *HASIL RINGKASAN:*\n\n${summary}`);
      } catch (err) {
        await reply(`❌ Gagal merangkum teks: ${err.message}`);
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
        return reply('⚠️ Format salah!\nContoh: `.translate english selamat pagi apa kabar`\natau `.translate jepang terima kasih banyak`');
      }

      try {
        const sys = `Kamu adalah penerjemah bahasa akurat. Terjemahkan teks yang diberikan ke dalam bahasa target: "${targetLang}". Keluarkan HANYA hasil terjemahannya tanpa penjelasan tambahan.`;
        const result = await askAI(textToTranslate, sys);
        let out = `🌐 *TERJEMAHAN (${targetLang.toUpperCase()}):*\n\n`;
        out += `"${result}"`;
        await reply(out);
      } catch (err) {
        await reply(`❌ Gagal menerjemahkan: ${err.message}`);
      }
    },
  });
}
