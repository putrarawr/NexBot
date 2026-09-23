import { registerCommand } from '../../bot/handler.js';
import { logger } from '../../utils/logger.js';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export function registerOsintCommands() {
  // 1. IP Lookup
  registerCommand({
    name: 'ip',
    aliases: ['iplookup', 'geoip'],
    category: 'osint',
    description: 'Cek informasi geolocation dan provider alamat IP',
    usage: '.ip <alamat_ip>',
    async execute({ args, reply }) {
      const ip = args[0]?.trim();
      if (!ip) {
        return reply('[!] Masukkan alamat IP yang ingin dicek.\nContoh: .ip 1.1.1.1');
      }

      try {
        const url = `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,message,country,countryCode,regionName,city,zip,lat,lon,timezone,isp,org,as,query`;
        const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
        const data = await res.json();

        if (data.status !== 'success') {
          return reply(`[!] Gagal melacak IP: ${data.message || 'Alamat IP tidak valid / private IP'}`);
        }

        let out = `[HASIL PELACAKAN IP]\n\n`;
        out += `IP Target: \`${data.query}\`\n`;
        out += `Negara: ${data.country} (${data.countryCode})\n`;
        out += `Kota/Wilayah: ${data.city}, ${data.regionName}\n`;
        out += `Kode Pos: ${data.zip || '-'}\n`;
        out += `Zona Waktu: ${data.timezone}\n`;
        out += `ISP: ${data.isp}\n`;
        out += `Organisasi: ${data.org || '-'}\n`;
        out += `AS Number: ${data.as || '-'}\n`;
        out += `Koordinat: ${data.lat}, ${data.lon}\n`;
        out += `Google Maps: https://www.google.com/maps?q=${data.lat},${data.lon}`;

        await reply(out);
      } catch (err) {
        logger.error('Error saat lookup IP:', err.message);
        await reply('[!] Terjadi kesalahan saat menghubungi server IP-API.');
      }
    },
  });

  // 2. WHOIS Domain Lookup
  registerCommand({
    name: 'whois',
    aliases: ['whoisdomain'],
    category: 'osint',
    description: 'Cek informasi registrasi dan tanggal kadaluarsa domain',
    usage: '.whois <nama_domain>',
    async execute({ args, reply }) {
      let domain = args[0]?.trim();
      if (!domain) {
        return reply('[!] Masukkan nama domain yang ingin diperiksa.\nContoh: .whois google.com');
      }

      domain = domain.replace(/^https?:\/\//i, '').split('/')[0];

      try {
        const res = await fetch(`https://networkcalc.com/api/dns/whois/${encodeURIComponent(domain)}`, {
          headers: { 'User-Agent': USER_AGENT },
          signal: AbortSignal.timeout(8000),
        }).catch(() => null);

        let data = res ? await res.json().catch(() => null) : null;

        if (data && data.status === 'OK' && data.whois) {
          const w = data.whois;
          let out = `[WHOIS RECORD DOMAIN]\n\n`;
          out += `Domain: \`${domain}\`\n`;
          out += `Registrar: ${w.registrar || '-'}\n`;
          out += `Tanggal Dibuat: ${w.creation_date || '-'}\n`;
          out += `Kadaluarsa: ${w.expiration_date || '-'}\n`;
          out += `Update Terakhir: ${w.updated_date || '-'}\n`;
          if (Array.isArray(w.nameservers) && w.nameservers.length > 0) {
            out += `Name Servers:\n`;
            w.nameservers.slice(0, 4).forEach((ns) => {
              out += `  - ${ns}\n`;
            });
          }
          return await reply(out.trim());
        }

        const rdapRes = await fetch(`https://rdap.verisign.com/com/v1/domain/${encodeURIComponent(domain)}`, {
          headers: { 'User-Agent': USER_AGENT },
          signal: AbortSignal.timeout(8000),
        }).catch(() => null);

        if (rdapRes && rdapRes.ok) {
          const rdap = await rdapRes.json();
          let out = `[WHOIS RDAP RECORD]\n\n`;
          out += `Domain: \`${rdap.ldhName || domain}\`\n`;
          out += `Handle: ${rdap.handle || '-'}\n`;
          if (Array.isArray(rdap.events)) {
            rdap.events.forEach((ev) => {
              out += `- ${ev.eventAction}: ${ev.eventDate}\n`;
            });
          }
          return await reply(out.trim());
        }

        await reply(`[!] Data WHOIS untuk domain ${domain} tidak ditemukan.`);
      } catch (err) {
        logger.error('Error saat whois domain:', err.message);
        await reply('[!] Gagal mengambil data WHOIS. Pastikan nama domain valid.');
      }
    },
  });

  // 3. DNS Lookup
  registerCommand({
    name: 'dns',
    aliases: ['nslookup', 'dig'],
    category: 'osint',
    description: 'Lookup DNS records (A, AAAA, MX, TXT, CNAME, NS) via DoH',
    usage: '.dns <domain> [tipe: A|MX|TXT|NS|AAAA]',
    async execute({ args, reply }) {
      let domain = args[0]?.trim();
      const type = (args[1] || 'A').toUpperCase();

      if (!domain) {
        return reply('[!] Masukkan nama domain yang ingin diperiksa.\nContoh: .dns cloudflare.com');
      }

      domain = domain.replace(/^https?:\/\//i, '').split('/')[0];

      try {
        const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=${type}`;
        const res = await fetch(url, {
          headers: {
            Accept: 'application/dns-json',
            'User-Agent': USER_AGENT,
          },
        });
        const data = await res.json();

        if (data.Status !== 0) {
          return reply(`[!] DNS Query gagal dengan kode status: ${data.Status}.`);
        }

        const answers = data.Answer || [];
        if (answers.length === 0) {
          return reply(`[-] Tidak ditemukan record DNS tipe ${type} untuk domain ${domain}.`);
        }

        let out = `[DNS RECORD (${type})]\n`;
        out += `Domain: \`${domain}\`\n\n`;

        answers.forEach((rec, idx) => {
          out += `[${idx + 1}] Data: \`${rec.data}\` (TTL: ${rec.TTL}s)\n`;
        });

        await reply(out.trim());
      } catch (err) {
        logger.error('Error saat DNS query:', err.message);
        await reply('[!] Terjadi kesalahan saat menghubungi Cloudflare DNS over HTTPS.');
      }
    },
  });

  // 4. GitHub User Profile Lookup
  registerCommand({
    name: 'github',
    aliases: ['gh', 'ghuser'],
    category: 'osint',
    description: 'Mencari informasi akun GitHub publik',
    usage: '.github <username>',
    async execute({ args, reply, sock, jid }) {
      const username = args[0]?.trim();
      if (!username) {
        return reply('[!] Masukkan username GitHub.\nContoh: .github torvalds');
      }

      try {
        const res = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; NexBot/1.0)',
            Accept: 'application/vnd.github.v3+json',
          },
        });

        if (res.status === 404) {
          return reply(`[!] Pengguna GitHub "${username}" tidak ditemukan.`);
        }

        if (res.status === 403) {
          return reply(`[!] Batas permintaan (rate limit) GitHub publik sedang penuh. Coba lagi nanti.`);
        }

        const data = await res.json();

        let out = `[PROFIL GITHUB: @${data.login}]\n\n`;
        out += `Nama: ${data.name || '-'}\n`;
        out += `Bio: ${data.bio || '-'}\n`;
        out += `Perusahaan: ${data.company || '-'}\n`;
        out += `Lokasi: ${data.location || '-'}\n`;
        out += `Website: ${data.blog || '-'}\n`;
        out += `Public Repos: ${data.public_repos}\n`;
        out += `Followers: ${data.followers} | Following: ${data.following}\n`;
        out += `Bergabung: ${data.created_at ? data.created_at.split('T')[0] : '-'}\n`;
        out += `Link: https://github.com/${data.login}`;

        if (data.avatar_url) {
          try {
            await sock.sendMessage(jid, {
              image: { url: data.avatar_url },
              caption: out,
            });
            return;
          } catch {
            // fallback
          }
        }

        await reply(out);
      } catch (err) {
        logger.error('Error saat GitHub lookup:', err.message);
        await reply('[!] Gagal mengambil data profil GitHub.');
      }
    },
  });

  // 5. Subdomain Finder via crt.sh
  registerCommand({
    name: 'subdomain',
    aliases: ['subdomains', 'findsub'],
    category: 'osint',
    description: 'Pencarian subdomain publik dari sertifikat SSL (crt.sh)',
    usage: '.subdomain <domain>',
    async execute({ args, reply }) {
      let domain = args[0]?.trim();
      if (!domain) {
        return reply('[!] Masukkan nama domain utama.\nContoh: .subdomain kemdikbud.go.id');
      }

      domain = domain.replace(/^https?:\/\//i, '').split('/')[0];
      await reply(`[-] Mencari subdomain untuk "${domain}" via CT logs...`);

      try {
        const res = await fetch(`https://crt.sh/?q=%.${encodeURIComponent(domain)}&output=json`, {
          headers: { 'User-Agent': USER_AGENT },
          signal: AbortSignal.timeout(15000),
        });

        if (!res.ok) {
          return reply('[!] Server crt.sh sedang sibuk. Silakan coba kembali nanti.');
        }

        const data = await res.json();
        if (!Array.isArray(data) || data.length === 0) {
          return reply(`[-] Tidak ditemukan catatan subdomain publik untuk "${domain}".`);
        }

        const subdomains = new Set();
        data.forEach((entry) => {
          if (entry.name_value) {
            entry.name_value.split('\n').forEach((sub) => {
              const clean = sub.trim().toLowerCase();
              if (clean.endsWith(domain) && !clean.includes('*')) {
                subdomains.add(clean);
              }
            });
          }
        });

        const list = Array.from(subdomains).sort();
        const total = list.length;
        const displayLimit = 25;
        const displayed = list.slice(0, displayLimit);

        let out = `[SUBDOMAIN DISCOVERY]\n`;
        out += `Target: \`${domain}\`\n`;
        out += `Total Ditemukan: ${total} subdomain unik\n\n`;

        displayed.forEach((sub, i) => {
          out += `${i + 1}. \`${sub}\`\n`;
        });

        if (total > displayLimit) {
          out += `\n...dan ${total - displayLimit} subdomain lainnya.`;
        }

        await reply(out.trim());
      } catch (err) {
        logger.error('Error saat subdomain discovery:', err.message);
        await reply('[!] Waktu pencarian habis atau server crt.sh padat.');
      }
    },
  });

  // 6. HTTP Headers
  registerCommand({
    name: 'headers',
    aliases: ['httpheaders', 'head'],
    category: 'osint',
    description: 'Inspeksi HTTP response headers, server, dan status code',
    usage: '.headers <url>',
    async execute({ args, reply }) {
      let rawUrl = args[0]?.trim();
      if (!rawUrl) {
        return reply('[!] Masukkan URL target.\nContoh: .headers https://google.com');
      }

      if (!/^https?:\/\//i.test(rawUrl)) {
        rawUrl = 'https://' + rawUrl;
      }

      try {
        const start = Date.now();
        const res = await fetch(rawUrl, {
          method: 'GET',
          headers: { 'User-Agent': USER_AGENT },
          signal: AbortSignal.timeout(10000),
          redirect: 'follow',
        });
        const duration = Date.now() - start;

        let out = `[HTTP HEADERS INSPECTOR]\n\n`;
        out += `URL: \`${rawUrl}\`\n`;
        out += `Status: ${res.status} ${res.statusText}\n`;
        out += `Latency: ${duration}ms\n\n`;
        out += `Response Headers:\n`;

        const importantHeaders = [
          'server',
          'content-type',
          'strict-transport-security',
          'content-security-policy',
          'x-frame-options',
          'x-content-type-options',
          'cf-ray',
          'x-powered-by',
        ];

        let count = 0;
        for (const [key, value] of res.headers.entries()) {
          if (importantHeaders.includes(key.toLowerCase()) || count < 10) {
            out += `- ${key}: \`${value}\`\n`;
            count++;
          }
        }

        await reply(out.trim());
      } catch (err) {
        logger.error('Error saat inspect headers:', err.message);
        await reply(`[!] Gagal terhubung ke host: ${err.message}`);
      }
    },
  });
}
