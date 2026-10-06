import { registerCommand } from '../../bot/handler.js';
import { logger } from '../../utils/logger.js';

export function registerUtilityTools() {
  // 1. BMKG Gempa Terkini (/gempa)
  registerCommand({
    name: 'gempa',
    aliases: ['infogempa', 'bmkg', 'earthquake'],
    category: 'info',
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
    category: 'info',
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
    category: 'islami',
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
    category: 'info',
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
    category: 'utility',
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
    category: 'utility',
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
    category: 'utility',
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

  // 8. Command: QR Code Generator (/qrcode)
  registerCommand({
    name: 'qrcode',
    aliases: ['qr', 'makeqr'],
    category: 'utility',
    description: 'Membuat kode QR dari teks atau tautan URL secara instan',
    usage: '/qrcode <teks/url>',
    async execute({ sock, jid, fullText, reply, prefix, react }) {
      const text = fullText?.trim();
      if (!text) {
        return reply(`[!] Masukkan teks atau tautan yang ingin dijadikan QR Code.\nContoh: <code>${prefix}qrcode https://github.com/putrarawr/NexBot</code>`);
      }

      if (typeof react === 'function') await react('👍');

      try {
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=15&data=${encodeURIComponent(text)}`;
        const res = await fetch(qrUrl, { signal: AbortSignal.timeout(12000) });
        if (!res.ok) throw new Error(`QR generator API status HTTP ${res.status}`);

        const qrBuffer = Buffer.from(await res.arrayBuffer());
        await sock.sendMessage(jid, {
          image: qrBuffer,
          caption: `<b>[ QR CODE GENERATOR ]</b>\n\nIsi: <code>${text}</code>`,
        });
      } catch (err) {
        logger.error('Error saat membuat QR code:', err.message);
        await reply(`[!] Gagal membuat QR Code: ${err.message}`);
      }
    },
  });

  // 9. Command: Web Screenshot (/ssweb)
  registerCommand({
    name: 'ssweb',
    aliases: ['screenshot', 'webshot', 'ss'],
    category: 'utility',
    description: 'Mengambil tangkapan layar tampilan halaman website secara instan',
    usage: '/ssweb <url_website>',
    async execute({ sock, jid, fullText, reply, prefix, react }) {
      let targetUrl = fullText?.trim();
      if (!targetUrl) {
        return reply(`[!] Masukkan tautan website yang ingin di-screenshot.\nContoh: <code>${prefix}ssweb https://google.com</code> atau <code>${prefix}ssweb github.com</code>`);
      }

      if (!/^https?:\/\//i.test(targetUrl)) {
        targetUrl = `https://${targetUrl}`;
      }

      if (typeof react === 'function') await react('👍');

      try {
        const shotUrl = `https://image.thum.io/get/width/1280/crop/800/noanimate/${targetUrl}`;
        const res = await fetch(shotUrl, { signal: AbortSignal.timeout(20000) });
        if (!res.ok) throw new Error(`Screenshot API status HTTP ${res.status}`);

        const imgBuffer = Buffer.from(await res.arrayBuffer());
        if (imgBuffer.length < 500) throw new Error('Gambar screenshot tidak valid atau kosong.');

        await sock.sendMessage(jid, {
          image: imgBuffer,
          caption: `<b>[ SCREENSHOT WEBSITE ]</b>\n\nTarget: <code>${targetUrl}</code>`,
        });
      } catch (err) {
        logger.error('Error saat screenshot website:', err.message);
        await reply(`[!] Gagal mengambil screenshot: ${err.message}`);
      }
    },
  });

  // 10. Command: Cari Lirik Lagu (/lirik)
  registerCommand({
    name: 'lirik',
    aliases: ['lyrics', 'liriklagu'],
    category: 'utility',
    description: 'Mencari lirik lagu lengkap dari judul atau nama artis',
    usage: '/lirik <judul_lagu>',
    async execute({ fullText, reply, prefix, react }) {
      const query = fullText?.trim();
      if (!query) {
        return reply(`[!] Masukkan judul lagu yang ingin dicari liriknya.\nContoh: <code>${prefix}lirik Laskar Pelangi</code> atau <code>${prefix}lirik Fix You Coldplay</code>`);
      }

      if (typeof react === 'function') await react('👍');

      try {
        const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`;
        const res = await fetch(searchUrl, {
          headers: { 'User-Agent': 'NexBot/1.0 (Mozilla/5.0)' },
          signal: AbortSignal.timeout(12000),
        });

        if (!res.ok) throw new Error(`Lirik API status HTTP ${res.status}`);

        const items = await res.json();
        if (!Array.isArray(items) || items.length === 0) {
          return reply(`[!] Lirik untuk lagu "<b>${query}</b>" tidak ditemukan.`);
        }

        const match = items.find((i) => i.plainLyrics) || items[0];
        const lyrics = match.plainLyrics || match.syncedLyrics;

        if (!lyrics) {
          return reply(`[!] Lagu ditemukan (${match.trackName} - ${match.artistName}), namun lirik teks tidak tersedia.`);
        }

        let out = `<b>[ LIRIK LAGU ]</b>\n\n`;
        out += `🎵 <b>Judul:</b> ${match.trackName}\n`;
        out += `🎤 <b>Artis:</b> ${match.artistName}\n`;
        if (match.albumName) out += `💿 <b>Album:</b> ${match.albumName}\n`;
        out += `\n─────────────────────\n\n`;
        out += lyrics.slice(0, 3500);

        await reply(out);
      } catch (err) {
        logger.error('Error saat mencari lirik lagu:', err.message);
        await reply(`[!] Gagal mencari lirik lagu: ${err.message}`);
      }
    },
  });
}
