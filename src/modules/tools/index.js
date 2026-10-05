import { registerCommand } from '../../bot/handler.js';
import { logger } from '../../utils/logger.js';

export function registerUtilityTools() {
  // 1. BMKG Gempa Terkini (/gempa)
  registerCommand({
    name: 'gempa',
    aliases: ['infogempa', 'bmkg', 'earthquake'],
    category: 'general',
    description: 'Informasi gempa bumi terkini dari BMKG Indonesia lengkap dengan peta',
    usage: '/gempa',
    async execute({ sock, jid, reply, react }) {
      if (typeof react === 'function') await react('👍');

      try {
        const res = await fetch('https://data.bmkg.go.id/DataMKG/TEWS/autogempa.json', {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(8000),
        });

        if (!res.ok) {
          throw new Error(`BMKG server merespon status HTTP ${res.status}`);
        }

        const json = await res.json();
        const g = json.Infogempa?.gempa;
        if (!g) {
          throw new Error('Data gempa tidak ditemukan dalam respon BMKG.');
        }

        let caption = `<b>[ BMKG INFO GEMPA TERKINI ]</b>\n\n`;
        caption += `• <b>Waktu:</b> ${g.Tanggal} | ${g.Jam}\n`;
        caption += `• <b>Magnitudo:</b> ${g.Magnitude} SR\n`;
        caption += `• <b>Kedalaman:</b> ${g.Kedalaman}\n`;
        caption += `• <b>Koordinat:</b> ${g.Coordinates} (${g.Lintang} - ${g.Bujur})\n`;
        caption += `• <b>Pusat Gempa:</b> ${g.Wilayah}\n`;
        caption += `• <b>Potensi:</b> ${g.Potensi}\n`;
        if (g.Dirasakan) {
          caption += `• <b>Wilayah Dirasakan:</b> ${g.Dirasakan}\n`;
        }

        const shakemapUrl = g.Shakemap ? `https://data.bmkg.go.id/DataMKG/TEWS/${g.Shakemap}` : null;

        if (shakemapUrl) {
          try {
            await sock.sendMessage(jid, {
              image: { url: shakemapUrl },
              caption,
            });
            return;
          } catch {}
        }

        await reply(caption);
      } catch (err) {
        logger.error('Error saat fetch gempa BMKG:', err.message);
        await reply(`[!] Gagal mengambil data gempa BMKG: ${err.message}`);
      }
    },
  });

  // 2. Cuaca Real-Time (/cuaca / /weather)
  registerCommand({
    name: 'cuaca',
    aliases: ['weather', 'suhu', 'forecast'],
    category: 'general',
    description: 'Cek prakiraan cuaca, suhu, dan kelembapan kota terkini',
    usage: '/cuaca <nama_kota>',
    async execute({ args, reply, prefix, react }) {
      const city = args.join(' ').trim();
      if (!city) {
        return reply(`[!] Masukkan nama kota yang ingin dicek.\nContoh: <code>${prefix}cuaca Jakarta</code> atau <code>${prefix}cuaca Bandung</code>`);
      }

      if (typeof react === 'function') await react('👍');

      try {
        const res = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`, {
          headers: { 'User-Agent': 'curl/8.0' },
          signal: AbortSignal.timeout(8000),
        });

        if (!res.ok) {
          throw new Error(`Data cuaca kota "${city}" tidak ditemukan.`);
        }

        const json = await res.json();
        const curr = json.current_condition?.[0];
        const area = json.nearest_area?.[0];

        const cityName = area?.areaName?.[0]?.value || city;
        const region = area?.region?.[0]?.value || '';
        const country = area?.country?.[0]?.value || '';

        let out = `<b>[ INFORMASI CUACA KOTA ]</b>\n\n`;
        out += `• <b>Lokasi:</b> ${cityName}, ${region} (${country})\n`;
        out += `• <b>Kondisi:</b> ${curr?.weatherDesc?.[0]?.value || 'Cerah/Berawan'}\n`;
        out += `• <b>Suhu:</b> ${curr?.temp_C || '--'}°C\n`;
        out += `• <b>Terasa Seperti:</b> ${curr?.FeelsLikeC || '--'}°C\n`;
        out += `• <b>Kelembapan:</b> ${curr?.humidity || '--'}%\n`;
        out += `• <b>Kecepatan Angin:</b> ${curr?.windspeedKmph || '--'} km/h\n`;
        out += `• <b>Indeks UV:</b> ${curr?.uvIndex || '--'}\n`;
        out += `• <b>Visibilitas:</b> ${curr?.visibility || '--'} km`;

        await reply(out);
      } catch (err) {
        logger.error('Error saat fetch cuaca:', err.message);
        await reply(`[!] Gagal mengambil informasi cuaca: ${err.message}`);
      }
    },
  });

  // 3. Jadwal Sholat Indonesia (/sholat)
  registerCommand({
    name: 'sholat',
    aliases: ['jadwalsholat', 'adzan', 'prayer'],
    category: 'general',
    description: 'Jadwal waktu sholat harian untuk kota di Indonesia',
    usage: '/sholat <nama_kota>',
    async execute({ args, reply, prefix, react }) {
      const city = args.join(' ').trim();
      if (!city) {
        return reply(`[!] Masukkan nama kota/kabupaten.\nContoh: <code>${prefix}sholat Surabaya</code> atau <code>${prefix}sholat Medan</code>`);
      }

      if (typeof react === 'function') await react('👍');

      try {
        const res = await fetch(
          `https://api.aladhan.com/v1/timingsByCity?city=${encodeURIComponent(city)}&country=Indonesia&method=11`,
          { signal: AbortSignal.timeout(8000) }
        );

        if (!res.ok) {
          throw new Error(`Jadwal sholat untuk kota "${city}" tidak ditemukan.`);
        }

        const json = await res.json();
        const timings = json.data?.timings;
        const date = json.data?.date;

        if (!timings) {
          throw new Error('Data jadwal waktu tidak tersedia.');
        }

        let out = `<b>[ JADWAL SHOLAT INDONESIA ]</b>\n\n`;
        out += `• <b>Wilayah:</b> ${city.toUpperCase()}\n`;
        out += `• <b>Tanggal:</b> ${date?.readable || ''} (${date?.hijri?.day} ${date?.hijri?.month?.en} ${date?.hijri?.year} H)\n\n`;
        out += `• <b>Imsak:</b> ${timings.Imsak} WIB\n`;
        out += `• <b>Subuh:</b> ${timings.Fajr} WIB\n`;
        out += `• <b>Terbit:</b> ${timings.Sunrise} WIB\n`;
        out += `• <b>Dzuhur:</b> ${timings.Dhuhr} WIB\n`;
        out += `• <b>Ashar:</b> ${timings.Asr} WIB\n`;
        out += `• <b>Maghrib:</b> ${timings.Maghrib} WIB\n`;
        out += `• <b>Isya:</b> ${timings.Isha} WIB\n`;

        await reply(out);
      } catch (err) {
        logger.error('Error saat fetch jadwal sholat:', err.message);
        await reply(`[!] Gagal mengambil jadwal sholat: ${err.message}`);
      }
    },
  });

  // 4. Wikipedia Indonesia (/wiki)
  registerCommand({
    name: 'wiki',
    aliases: ['wikipedia', 'artikil'],
    category: 'general',
    description: 'Cari ringkasan ensiklopedia Wikipedia bahasa Indonesia',
    usage: '/wiki <topik>',
    async execute({ sock, jid, fullText, reply, prefix, react }) {
      const topic = fullText?.trim();
      if (!topic) {
        return reply(`[!] Masukkan topik yang ingin dicari di Wikipedia.\nContoh: <code>${prefix}wiki Albert Einstein</code> atau <code>${prefix}wiki Bunga Melati</code>`);
      }

      if (typeof react === 'function') await react('👍');

      try {
        const res = await fetch(`https://id.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topic)}`, {
          headers: { 'User-Agent': 'NexBot/1.0 (https://github.com/putrarawr/NexBot)' },
          signal: AbortSignal.timeout(8000),
        });

        if (!res.ok) {
          throw new Error(`Artikel "${topic}" tidak ditemukan di Wikipedia Indonesia.`);
        }

        const data = await res.json();
        let caption = `<b>[ WIKIPEDIA INDONESIA ]</b>\n\n`;
        caption += `<b>${data.title}</b>\n`;
        if (data.description) {
          caption += `<i>${data.description}</i>\n\n`;
        } else {
          caption += `\n`;
        }
        caption += `${data.extract || 'Tidak ada ringkasan.'}\n\n`;
        if (data.content_urls?.desktop?.page) {
          caption += `Baca selengkapnya: ${data.content_urls.desktop.page}`;
        }

        if (data.thumbnail?.source) {
          try {
            await sock.sendMessage(jid, {
              image: { url: data.thumbnail.source },
              caption,
            });
            return;
          } catch {}
        }

        await reply(caption);
      } catch (err) {
        logger.error('Error saat fetch Wikipedia:', err.message);
        await reply(`[!] Gagal mencari di Wikipedia: ${err.message}`);
      }
    },
  });

  // 5. Shortlink & Unshortener (/short & /unshort)
  registerCommand({
    name: 'short',
    aliases: ['shortlink', 'shorten', 'tinyurl'],
    category: 'general',
    description: 'Memperpendek tautan URL panjang secara instan',
    usage: '/short <url_panjang>',
    async execute({ args, reply, prefix, react }) {
      const targetUrl = args[0]?.trim();
      if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
        return reply(`[!] Masukkan tautan link yang valid.\nContoh: <code>${prefix}short https://example.com/artikel-panjang/</code>`);
      }

      if (typeof react === 'function') await react('👍');

      try {
        const res = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(targetUrl)}`, {
          signal: AbortSignal.timeout(8000),
        });

        if (!res.ok) {
          throw new Error('Gagal memperpendek tautan.');
        }

        const shortUrl = await res.text();
        let out = `<b>[ SHORTLINK GENERATOR ]</b>\n\n`;
        out += `• <b>Link Asli:</b> ${targetUrl}\n`;
        out += `• <b>Link Pendek:</b> <code>${shortUrl.trim()}</code>`;

        await reply(out);
      } catch (err) {
        logger.error('Error saat shortlink:', err.message);
        await reply(`[!] Gagal membuat shortlink: ${err.message}`);
      }
    },
  });

  registerCommand({
    name: 'unshort',
    aliases: ['expandurl', 'ceklink', 'unshorten'],
    category: 'general',
    description: 'Mengecek link asli di balik URL pendek untuk keamanan',
    usage: '/unshort <url_pendek>',
    async execute({ args, reply, prefix, react }) {
      const targetUrl = args[0]?.trim();
      if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
        return reply(`[!] Masukkan tautan link pendek.\nContoh: <code>${prefix}unshort https://tinyurl.com/xxxxxx</code>`);
      }

      if (typeof react === 'function') await react('👍');

      try {
        const res = await fetch(targetUrl, {
          redirect: 'follow',
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(8000),
        });

        let out = `<b>[ UNSHORTEN LINK INSPECTOR ]</b>\n\n`;
        out += `• <b>Link Input:</b> ${targetUrl}\n`;
        out += `• <b>Tujuan Asli:</b> <code>${res.url}</code>\n`;
        out += `• <b>Status HTTP:</b> ${res.status}`;

        await reply(out);
      } catch (err) {
        logger.error('Error saat unshorten:', err.message);
        await reply(`[!] Gagal memeriksa link: ${err.message}`);
      }
    },
  });

  // 6. Kalkulator Matematika Cepat (/calc)
  registerCommand({
    name: 'calc',
    aliases: ['hitung', 'kalkulator', 'mathcalc'],
    category: 'general',
    description: 'Menghitung ekspresi matematika dasar secara instan',
    usage: '/calc <ekspresi_matematika>',
    async execute({ fullText, reply, prefix }) {
      const expr = fullText?.trim();
      if (!expr) {
        return reply(`[!] Masukkan perhitungan matematika.\nContoh: <code>${prefix}calc 25 * 4 + 150 / 3</code> atau <code>${prefix}calc (100 - 35) * 2</code>`);
      }

      // Validasi karakter aman: hanya angka, spasi, kurung, dan operator dasar
      if (!/^[0-9\s+\-*/().%^eE]+$/.test(expr)) {
        return reply('[!] Ekspresi mengandung karakter tidak valid. Gunakan hanya angka dan operator (+, -, *, /, %, ^, ()).');
      }

      try {
        const sanitized = expr.replace(/\^/g, '**');
        // Evaluasi aman menggunakan Function constructor dengan input yang sudah divalidasi regex ketat
        const result = new Function(`return (${sanitized});`)();

        if (typeof result !== 'number' || !isFinite(result)) {
          return reply('[!] Hasil perhitungan tidak terhingga (Infinity / NaN).');
        }

        let out = `<b>[ KALKULATOR MATEMATIKA ]</b>\n\n`;
        out += `• <b>Soal:</b> <code>${expr}</code>\n`;
        out += `• <b>Hasil:</b> <b>${Number(result.toFixed(6))}</b>`;

        await reply(out);
      } catch {
        await reply('[!] Format rumus matematika salah atau tidak dapat dihitung.');
      }
    },
  });
}
