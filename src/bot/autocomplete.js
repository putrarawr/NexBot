// Engine Autocomplete, Fuzzy Match ("Did You Mean?"), dan Quick Suggestion

// Levenshtein distance calculation untuk deteksi salah ketik (typo)
export function levenshteinDistance(a, b) {
  const matrix = [];
  const lenA = a.length;
  const lenB = b.length;

  for (let i = 0; i <= lenB; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= lenA; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= lenB; i++) {
    for (let j = 1; j <= lenA; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[lenB][lenA];
}

// In-memory store untuk menunggu balasan angka (1-5) dari user
export const pendingAutocomplete = new Map();

export function setPendingAutocomplete(jid, suggestions) {
  // Batalkan timer sebelumnya jika ada
  if (pendingAutocomplete.has(jid)) {
    clearTimeout(pendingAutocomplete.get(jid).timer);
  }

  const timer = setTimeout(() => {
    pendingAutocomplete.delete(jid);
  }, 45000); // 45 detik batas waktu memilih angka

  pendingAutocomplete.set(jid, {
    suggestions,
    timer,
  });
}

export function getPendingAutocomplete(jid) {
  return pendingAutocomplete.get(jid);
}

export function clearPendingAutocomplete(jid) {
  if (pendingAutocomplete.has(jid)) {
    clearTimeout(pendingAutocomplete.get(jid).timer);
    pendingAutocomplete.delete(jid);
  }
}

export function findSuggestions(inputQuery, commandMap) {
  const query = inputQuery.toLowerCase().trim();
  if (!query) return [];

  const results = [];
  const uniqueNames = new Set();

  for (const cmd of commandMap.values()) {
    if (uniqueNames.has(cmd.name)) continue;
    uniqueNames.add(cmd.name);

    const name = cmd.name.toLowerCase();
    const aliases = (cmd.aliases || []).map((a) => a.toLowerCase());

    // 1. Exact match (tidak perlu autocomplete jika persis)
    if (name === query || aliases.includes(query)) {
      return [{ cmd, score: 0, matchType: 'exact' }];
    }

    // 2. Prefix Match (nama command diawali query, contoh: "te" -> "tebakgambar")
    if (name.startsWith(query)) {
      results.push({ cmd, score: 1, matchType: 'prefix' });
      continue;
    }

    // 3. Alias Prefix Match
    if (aliases.some((a) => a.startsWith(query))) {
      results.push({ cmd, score: 1.5, matchType: 'alias_prefix' });
      continue;
    }

    // 4. Substring Match (query ada di dalam nama command, contoh: "gambar" -> "tebakgambar")
    if (name.includes(query)) {
      results.push({ cmd, score: 2, matchType: 'substring' });
      continue;
    }

    // 5. Fuzzy / Levenshtein Distance (untuk salah ketik, contoh: "tebk" -> "tebakkata")
    const dist = levenshteinDistance(query, name);
    const maxAllowedDist = Math.max(1, Math.floor(name.length / 3));
    if (dist <= maxAllowedDist) {
      results.push({ cmd, score: 3 + dist, matchType: 'fuzzy' });
    }
  }

  // Urutkan berdasarkan score relevansi terendah (paling mirip)
  results.sort((a, b) => a.score - b.score);
  return results.slice(0, 5).map((r) => r.cmd);
}

export function formatAutocompleteMessage(prefix, inputQuery, suggestions) {
  const numberEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];

  let text = `🔍 Perintah \`${prefix}${inputQuery}\` tidak ditemukan.\n`;
  text += `💡 *Pilihan Autocomplete Terdekat:*\n\n`;

  suggestions.forEach((cmd, idx) => {
    const emoji = numberEmojis[idx] || `${idx + 1}.`;
    text += `${emoji} \`${prefix}${cmd.name}\`\n`;
    if (cmd.description) {
      text += `   └ _${cmd.description}_\n`;
    }
  });

  text += `\n👉 *Ketik angka 1 sampai ${suggestions.length}* untuk langsung menjalankan perintah!`;
  return text.trim();
}

export function formatPrefixOnlyHelper(prefix) {
  let text = `⚡ *AUTOCOMPLETE & PENCARIAN CEPAT*\n\n`;
  text += `Ketik \`${prefix}<huruf>\` untuk menemukan perintah secara cepat:\n`;
  text += `• \`${prefix}te\` ➔ Kuis \`.tebakgambar\`, \`.tebakkata\`\n`;
  text += `• \`${prefix}m\`  ➔ Kuis \`.math\`, \`.menu\`\n`;
  text += `• \`${prefix}ip\` ➔ OSINT \`.ip\` (Geolocation IP)\n`;
  text += `• \`${prefix}wh\` ➔ OSINT \`.whois\` (Domain WHOIS)\n`;
  text += `• \`${prefix}ai\` ➔ Tanya Jawab AI (\`.ai\`, \`.explain\`)\n`;
  text += `• \`${prefix}ru\` ➔ Eksekusi Kode (\`.run\`)\n\n`;
  text += `Ketik \`${prefix}menu\` untuk membuka seluruh daftar perintah lengkap.`;
  return text.trim();
}
