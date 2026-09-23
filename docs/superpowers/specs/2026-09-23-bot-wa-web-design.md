# WhatsApp Bot & Web Dashboard Design Specification

**Tanggal:** 2026-09-23  
**Status:** Approved Draft  
**Target Platform:** Serv00.com (Free Shell Hosting, 512 MB RAM, No Credit Card Required) & Universal Linux / Docker  

---

## 1. Ringkasan Eksekutif (Executive Summary)
Sistem ini merupakan kombinasi dari **WhatsApp Bot Multi-Device** dan **Web Dashboard Responsif (Mobile & Desktop)** yang berjalan dalam satu proses Node.js tunggal (*unified single-process*). Solusi ini dirancang khusus untuk berjalan secara efisien di lingkungan hosting gratis tanpa kartu kredit seperti **Serv00.com** yang memiliki alokasi memori maksimal 512 MB RAM dan 1 port TCP publik.

Sistem menyediakan 4 pilar fitur utama:
1. **Game & Hiburan:** Tebak Gambar, Tebak Kata, Asah Otak, Kuis Matematika, Tic-Tac-Toe, dan Papan Peringkat (Leaderboard).
2. **OSINT & Network Diagnostic:** Geolocation IP, WHOIS domain via RDAP, DNS Lookup via DoH, Inspeksi Profil GitHub, Enumerasi Subdomain publik via crt.sh, dan Analisis HTTP Headers.
3. **Kecerdasan Buatan (AI):** Tanya jawab umum, penjelas kode pemrograman, peringkas teks, dan penerjemah dengan sistem hybrid (gratis langsung pakai + opsi API key Groq Llama-3 / Google Gemini untuk performa tinggi).
4. **Alat Pemrograman:** Eksekutor kode multi-bahasa via Piston API (Python, JS, C++, Go, Rust, Java, PHP, Bash), pengujian Regex, validator/formatter JSON, serta cheatsheet sintaks & CLI Linux.

---

## 2. Arsitektur Sistem (System Architecture)

### 2.1 Diagram Alur Data & Komponen
```
                  ┌──────────────────────────────────────────────┐
                  │            Single Node.js Process            │
                  │                                              │
WhatsApp User ───►│  [@whiskeysockets/baileys Socket Client]     │
                  │     │                                        │
                  │     ▼                                        │
                  │  [Command Dispatcher & Middleware]           │
                  │     ├── Rate Limiter (Anti-Ban Guard)        │
                  │     └── Modules (Game, OSINT, AI, Dev)       │
                  │                                              │
                  │  [Express.js Web Server (Port: PORT)]        │
                  │     ├── Static Web Dashboard (HTML/Tailwind) │
                  │     ├── Auth Guard (Admin PIN/Password)      │
                  │     ├── REST API (Status, Config, Pairing)   │
                  │     └── SSE Stream (/api/logs/stream)        │
Admin Browser ───►│                                              │
                  │  [Local Storage Engine]                      │
                  │     ├── data/auth/      (Baileys Auth State) │
                  │     ├── data/config.json (Bot Settings)      │
                  │     └── data/database.json (Users & Scores)  │
                  └──────────────────────────────────────────────┘
```

### 2.2 Efisiensi Memori (Low Memory Footprint)
- Menghindari library berbasis headless browser seperti Puppeteer atau Selenium.
- Menggunakan `@whiskeysockets/baileys` yang beroperasi murni dengan WebSocket dan enkripsi Curve25519/Protobuf bawaan.
- Rata-rata konsumsi memori saat idle: **~65 MB - 90 MB**, saat aktif: **~110 MB - 140 MB**, jauh di bawah ambang batas Serv00 (512 MB).

---

## 3. Komponen Perangkat Lunak (Software Components)

### 3.1 WhatsApp Bot Core (`src/bot/`)
- **`connection.js`**: Mengelola lifecycle koneksi socket Baileys, auto-reconnect dengan exponential backoff jika koneksi terputus, dan pembuatan sesi via pairing code / QR code.
- **`handler.js`**: Menerima event `messages.upsert`, mengekstrak teks perintah, mendeteksi prefix (default: `.`), memeriksa toggle fitur aktif/nonaktif, dan mengeksekusi modul perintah terkait.
- **`antiBan.js`**: Middleware proteksi anti-spam untuk membatasi frekuensi pesan masuk per user (cooldown 3 detik) serta simulasi pengetikan (`composing`) agar pola bot terlihat alami.

### 3.2 Web Dashboard & API Server (`src/web/` & `src/public/`)
- **Keamanan (Authentication):** Proteksi session via cookie atau token berbasis PIN/Password admin yang dikonfigurasi di `data/config.json` atau environment variable `ADMIN_PASSWORD`.
- **Fitur Dashboard:**
  - **Status Monitor:** Uptime server, konsumsi RAM (RSS & Heap), status soket WhatsApp (Connected, Connecting, Disconnected).
  - **Pairing Code Manager:** Form untuk memasukkan nomor telepon bot WhatsApp (contoh: `628123456789`) dan menghasilkan 8-digit Pairing Code tanpa perlu akses terminal SSH.
  - **Feature Toggles:** Sakelar on/off untuk setiap kategori modul (Game, OSINT, AI, Pemrograman).
  - **API Key Configuration:** Form penyimpanan API Key (Groq / Gemini) yang tersimpan aman secara lokal di server.
  - **Live Console Log (SSE):** Streaming log server realtime menggunakan Server-Sent Events, sehingga admin bisa memantau aktivitas bot langsung dari browser HP/Laptop.

### 3.3 Struktur Data Lokal (`data/`)
- `data/auth/`: Berisi session multi-file credentials Baileys (`creds.json` dsb).
- `data/config.json`:
  ```json
  {
    "botName": "NexBot",
    "prefix": ".",
    "adminPassword": "admin",
    "ownerNumber": "628xxx",
    "features": {
      "game": true,
      "osint": true,
      "ai": true,
      "programming": true
    },
    "aiProvider": "hybrid",
    "groqApiKey": "",
    "geminiApiKey": ""
  }
  ```
- `data/database.json`: Menyimpan skor permainan pengguna, sesi Tic-Tac-Toe aktif, dan statistik penggunaan command.

---

## 4. Spesifikasi Modul & Perintah

### 4.1 Modul Game (`src/modules/game/`)
1. `.tebakgambar`: Mengirim gambar teka-teki, petunjuk karakter tersembunyi, batas waktu menjawab 60 detik, dan reward 50 poin jika benar.
2. `.tebakkata` & `.asahotak`: Menampilkan pertanyaan kuis kata atau teka-teki logika Indonesia.
3. `.math`: Kuis matematika acak dengan operasi campuran (tambah, kurang, kali) dan tingkat kesulitan adaptif.
4. `.tictactoe`: Permainan papan 3x3 untuk 2 orang dalam grup atau private chat.
5. `.leaderboard` & `.score`: Menampilkan top 10 skor pemain terbanyak dan skor milik pengguna sendiri.

### 4.2 Modul OSINT & Network Tools (`src/modules/osint/`)
*Catatan Etis: Seluruh fungsi OSINT memanfaatkan public API & protokol diagnostik standar jaringan tanpa mengeksploitasi data pribadi atau kredensial rahasia.*
1. `.ip <alamat_ip>`: Menampilkan detail Geolocation (Negara, Kota, Region, Koordinat, Timezone, ISP, AS Number) menggunakan IP-API.
2. `.whois <domain>`: Mengambil data pendaftaran domain (Registrar, Created Date, Expiration Date, Name Servers) via protokol RDAP publik.
3. `.dns <domain> [A|AAAA|MX|TXT|NS]`: Query DNS record resmi menggunakan Cloudflare / Google DNS over HTTPS (DoH).
4. `.github <username>`: Menampilkan profil publik GitHub (nama, bio, total repositori, followers, tanggal dibuat, link avatar).
5. `.subdomain <domain>`: Menampilkan daftar subdomain publik yang terindeks dalam Certificate Transparency logs via crt.sh.
6. `.headers <url>`: Melakukan HTTP HEAD request dan menampilkan response headers, status code, dan info server.

### 4.3 Modul Artificial Intelligence (`src/modules/ai/`)
1. `.ai <pertanyaan>`: Asisten percakapan cerdas.
   - *Mode Hybrid:* Jika `groqApiKey` atau `geminiApiKey` diisi di dashboard, bot akan menggunakan model Llama-3-70b (Groq) atau Gemini Flash.
   - *Fallback:* Jika tanpa API key, bot secara otomatis menggunakan endpoint LLM publik gratis tanpa downtime.
2. `.explain <code>`: Membedah dan menerjemahkan logika kode pemrograman ke dalam bahasa manusia yang mudah dipahami.
3. `.summarize <teks>`: Meringkas artikel atau paragraf panjang ke dalam bentuk poin-poin terstruktur.
4. `.translate <bahasa_tujuan> <teks>`: Menerjemahkan teks antar-bahasa secara instan.

### 4.4 Modul Pemrograman (`src/modules/programming/`)
1. `.run <bahasa> <code>`: Menjalankan kode pada isolated sandbox Piston API.
   - Bahasa yang didukung: `python`, `javascript`, `typescript`, `cpp`, `go`, `rust`, `java`, `php`, `bash`.
   - Mengembalikan output `stdout`, `stderr`, dan waktu eksekusi.
2. `.regex <pattern> <string>`: Menguji ekspresi reguler terhadap string input dan menampilkan hasil matches/grup yang cocok.
3. `.json <string_json>`: Memvalidasi syntax JSON dan memformatnya menjadi pretty-printed JSON yang rapi atau mengidentifikasi error sintaks jika tidak valid.
4. `.cheat <query>`: Menampilkan referensi cepat perintah Linux/Dev (contoh: `.cheat git`, `.cheat docker`, `.cheat curl`, `.cheat chmod`).

---

## 5. Panduan Deployment Serv00.com (Langkah demi Langkah)

### 5.1 Karakteristik Lingkungan Serv00
- **Tipe Akun:** Free FreeBSD Shell Hosting (100% tanpa kartu kredit).
- **Limitasi:** 512 MB RAM, proses background diperbolehkan dengan izin `binexec`, port web publik dialokasikan via sistem `devil port`.

### 5.2 Alur Instalasi di Serv00
1. **Daftar Akun:** Registrasi di `https://serv00.com` (cek status ketersediaan pendaftaran).
2. **Login SSH:** Masuk ke server Serv00 melalui SSH:
   ```bash
   ssh username@sX.serv00.com
   ```
3. **Aktifkan Background Process:**
   ```bash
   devil binexec on
   ```
4. **Buka Port TCP untuk Web Dashboard:**
   ```bash
   devil port add tcp random
   ```
   *Catat nomor port yang diberikan (misalnya `25432`).*
5. **Clone Repository & Konfigurasi:**
   ```bash
   git clone <repo-url> bot-wa && cd bot-wa
   cp .env.example .env
   # Edit .env: masukkan PORT sesuai hasil devil port, dan ADMIN_PASSWORD
   ```
6. **Install Dependensi:**
   ```bash
   npm install --omit=dev
   ```
7. **Jalankan Bot dengan PM2 / Background Daemon:**
   ```bash
   npx pm2 start ecosystem.config.cjs
   npx pm2 save
   ```
8. **Buka Web Dashboard:**
   Akses `http://sX.serv00.com:PORT` di browser, login dengan PIN admin, lalu masukkan nomor WhatsApp untuk mendapatkan kode pairing 8-digit.
9. **Kaitkan di WhatsApp:** Buka WhatsApp di HP > Perangkat Tertaut > Tautkan dengan Kode Telepon > Masukkan 8 digit kode yang muncul di web dashboard. Selesai!

---

## 6. Pengujian & Verifikasi (Testing Strategy)
1. **Automated Smoke Test:**
   - Menjalankan unit test untuk command parsing dan formatting pada setiap modul.
   - Memastikan endpoint Web API (`/api/status`, `/api/health`, `/api/pairing`) mengembalikan status HTTP 200 dan respon JSON valid.
2. **Stress & Memory Test:**
   - Menguji eksekusi berulang pada modul code runner dan OSINT untuk memverifikasi konsumsi RAM tetap di bawah 150 MB.
3. **Web Dashboard Responsiveness:**
   - Pengujian tampilan UI pada resolusi mobile (375px) dan desktop (1440px).
