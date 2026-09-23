// Engine Autocomplete, Fuzzy Match ("Did You Mean?"), dan Quick Suggestion (No Emojis)

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
          matrix[i - 1][j - 1] + 1,
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1
        );
      }
    }
  }

  return matrix[lenB][lenA];
}

// In-memory store untuk menunggu balasan angka (1-5) dari user
export const pendingAutocomplete = new Map();

export function setPendingAutocomplete(jid, suggestions) {
  if (pendingAutocomplete.has(jid)) {
    clearTimeout(pendingAutocomplete.get(jid).timer);
  }

  const timer = setTimeout(() => {
    pendingAutocomplete.delete(jid);
  }, 45000);

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

    if (name === query || aliases.includes(query)) {
      return [{ cmd, score: 0, matchType: 'exact' }];
    }

    if (name.startsWith(query)) {
      results.push({ cmd, score: 1, matchType: 'prefix' });
      continue;
    }

    if (aliases.some((a) => a.startsWith(query))) {
      results.push({ cmd, score: 1.5, matchType: 'alias_prefix' });
      continue;
    }

    if (name.includes(query)) {
      results.push({ cmd, score: 2, matchType: 'substring' });
      continue;
    }

    const dist = levenshteinDistance(query, name);
    const maxAllowedDist = Math.max(1, Math.floor(name.length / 3));
    if (dist <= maxAllowedDist) {
      results.push({ cmd, score: 3 + dist, matchType: 'fuzzy' });
    }
  }

  results.sort((a, b) => a.score - b.score);
  return results.slice(0, 5).map((r) => r.cmd);
}

export function formatAutocompleteMessage(prefix, inputQuery, suggestions) {
  let text = `[!] Perintah "${prefix}${inputQuery}" tidak ditemukan.\n`;
  text += `[*] Rekomendasi Perintah:\n\n`;

  suggestions.forEach((cmd, idx) => {
    text += `[${idx + 1}] ${prefix}${cmd.name}\n`;
    if (cmd.description) {
      text += `    - ${cmd.description}\n`;
    }
  });

  text += `\nKetik angka 1 sampai ${suggestions.length} untuk langsung menjalankan perintah.`;
  return text.trim();
}

export function formatPrefixOnlyHelper(prefix) {
  let text = `[*] PENCARIAN PERINTAH CEPAT\n\n`;
  text += `Ketik ${prefix}<huruf> untuk mencari perintah, contoh:\n`;
  text += `- ${prefix}te : Kuis ${prefix}tebakgambar, ${prefix}tebakkata\n`;
  text += `- ${prefix}s  : Stiker ${prefix}sticker\n`;
  text += `- ${prefix}tt : Downloader ${prefix}tiktok\n`;
  text += `- ${prefix}ai : Tanya Jawab ${prefix}ai\n`;
  text += `- ${prefix}ru : Eksekusi Kode ${prefix}run\n`;
  text += `- ${prefix}m  : ${prefix}menu\n\n`;
  text += `Ketik ${prefix}menu untuk melihat seluruh daftar perintah.`;
  return text.trim();
}
