# 🤖 NexBot • WhatsApp Bot Multi-Device & Web Dashboard

Bot WhatsApp modern berbasis **Node.js (@whiskeysockets/baileys)** yang dilengkapi dengan **Web Dashboard interaktif realtime**. Dirancang khusus agar sangat hemat memori (~80–120 MB RAM) sehingga lancar dijalankan di hosting gratis tanpa kartu kredit seperti **Serv00.com** (kuota RAM 512 MB).

---

## ✨ Fitur Utama

### 1. 🎮 Game & Kuis Interaktif
* **`.tebakgambar`** : Mengirim gambar teka-teki dengan petunjuk huruf tersembunyi (reward 50 poin).
* **`.tebakkata`** : Kuis tebak kata Indonesia dengan petunjuk huruf.
* **`.asahotak`** : Teka-teki logika dan riddle seru.
* **`.math`** : Kuis hitung cepat matematika (penjumlahan, pengurangan, perkalian) berbatas waktu.
* **`.tictactoe`** : Permainan Tic-Tac-Toe 3x3 interaktif (bisa lawan teman di grup atau lawan Bot AI).
* **`.leaderboard`** : Menampilkan papan peringkat 10 pemain dengan skor tertinggi.
* **`.score`** : Cek total poin dan riwayat kemenangan kamu.
* **`.nyerah`** : Menyerah dan melihat jawaban jika permainan terlalu sulit.

### 2. 🔍 OSINT & Network Tools (Ethical & Public API)
* **`.ip <alamat_ip>`** : Pelacak Geolocation IP (Negara, Kota, ISP, AS Number, Timezone, Koordinat, Google Maps link).
* **`.whois <domain>`** : Informasi kepemilikan domain (Registrar, Created Date, Expiry Date, Name Servers) via RDAP.
* **`.dns <domain> [A|MX|TXT|NS|AAAA]`** : DNS query resmi via Cloudflare DNS over HTTPS (DoH).
* **`.github <username>`** : Profil publik GitHub (nama, bio, total repo, followers, link avatar).
* **`.subdomain <domain>`** : Pencarian subdomain publik dari SSL Certificate Transparency logs (crt.sh).
* **`.headers <url>`** : Inspeksi HTTP response headers, server info, dan status code.

### 3. 🤖 Kecerdasan Buatan (Hybrid AI)
* **`.ai <pertanyaan>`** : Tanya jawab umum dengan AI pintar.
  * **Zero-Key Fallback:** Langsung berfungsi out-of-the-box tanpa perlu API key apa pun.
  * **Dukungan API Key Pribadi:** Bisa dihubungkan ke Groq API (Llama 3, respon super instan) atau Google Gemini via Web Dashboard.
* **`.explain <kode>`** : Membedah dan menerjemahkan alur logika kode pemrograman.
* **`.summarize <teks>`** : Meringkas artikel/paragraf panjang menjadi poin-poin ringkas.
* **`.translate <bahasa> <teks>`** : Terjemahan bahasa instan.

### 4. 💻 Pemrograman & Developer Tools
* **`.run <bahasa> <code>`** : Eksekusi kode secara aman di isolated sandbox (Mendukung: Python, JavaScript, TypeScript, Go, Rust, Java, PHP, C++, Bash).
* **`.regex <pattern> <string>`** : Uji Regular Expression dan tampilkan capture groups.
* **`.json <string_json>`** : Validasi dan perapian (pretty-print) struktur JSON.
* **`.cheat <query>`** : Cheatsheet sintaks cepat dan perintah Linux/Git/Docker (via cheat.sh).

---

## 🌐 Fitur Web Dashboard

Web Dashboard dapat diakses langsung melalui browser di HP maupun Laptop:
1. **Pairing Code Manager:** Masukkan nomor WhatsApp bot untuk mendapatkan 8-digit kode tautan tanpa perlu scan QR atau buka terminal SSH.
2. **QR Code Fallback:** Tampilan QR Code aktif yang otomatis terupdate.
3. **Status & RAM Monitor:** Pemantauan realtime konsumsi RAM (MB), uptime server, dan status socket WhatsApp.
4. **Feature Toggles:** Sakelar on/off untuk setiap kategori fitur (Game, OSINT, AI, Pemrograman).
5. **AI Key Manager:** Form pengaturan API Key Groq / Gemini yang tersimpan aman.
6. **Live Console Log (SSE):** Streaming log bot realtime langsung di browser web.
7. **Keamanan Login:** Akses dashboard diproteksi PIN / Password Administrator.

---

## 🚀 Panduan Deploy ke VPS Gratis Serv00 (Tanpa Kartu Kredit)

**Serv00.com** adalah layanan hosting gratis berbasis FreeBSD/Linux shell yang menyediakan akses SSH, cron job, alokasi 512 MB RAM, dan izin background process 24/7 tanpa perlu kartu kredit.

### Langkah 1: Registrasi Akun Serv00
1. Buka situs [https://www.serv00.com](https://www.serv00.com).
2. Buat akun baru (gratis). Catat detail username, password, dan nama server (misal `s12.serv00.com`).

### Langkah 2: Login via SSH
Buka terminal di komputer atau aplikasi Termux di HP, lalu ketik:
```bash
ssh username@sX.serv00.com
```
*(Ganti `username` dan `sX` dengan detail akun Serv00 kamu, lalu masukkan password).*

### Langkah 3: Aktifkan Background Execution
Di terminal Serv00, aktifkan izin proses background:
```bash
devil binexec on
```

### Langkah 4: Buka Port TCP untuk Web Dashboard
Buka satu port TCP publik dengan perintah:
```bash
devil port add tcp random
```
Sistem akan memberikan nomor port acak, misalnya: `Port 25432 added.`  
*(Simpan nomor port ini).*

### Langkah 5: Download & Jalankan Script Setup Otomatis
Clone repositori ini atau upload file proyek ke Serv00:
```bash
git clone https://github.com/username/bot-wa.git
cd bot-wa
```

Jalankan script setup interaktif:
```bash
bash scripts/setup-serv00.sh
```
* Masukkan port yang tadi didapat dari `devil port` (contoh: `25432`).
* Masukkan password admin yang kamu inginkan untuk web dashboard.
* Script akan menginstall dependensi dan menyalakan bot dengan PM2.

### Langkah 6: Hubungkan WhatsApp via Web Dashboard
1. Buka browser di HP/Laptop dan kunjungi:
   ```
   http://sX.serv00.com:PORT
   ```
   *(Contoh: `http://s12.serv00.com:25432`)*
2. Klik tombol **Login Admin** dan masukkan password yang tadi kamu buat.
3. Di tab **Koneksi WhatsApp**, masukkan nomor WhatsApp bot (misal: `6281234567890`) dan klik **Dapatkan Pairing Code**.
4. Salin 8-digit kode yang muncul (contoh: `ABCD-1234`).
5. Buka aplikasi WhatsApp di HP kamu:
   * Ketuk menu **Perangkat Tertaut** > **Tautkan Perangkat**.
   * Pilih **Tautkan dengan nomor telepon saja**.
   * Masukkan 8 digit kode dari web dashboard.
6. Selesai! Bot kamu sekarang online 24 jam nonstop!

---

### Langkah 7: Pasang Watchdog Cron (Agar Bot Otomatis Hidup Jika Server Reboot)
Serv00 terkadang melakukan reboot pemeliharaan berkala. Agar bot otomatis menyala kembali tanpa perlu login SSH:
1. Ketik di terminal SSH:
   ```bash
   crontab -e
   ```
2. Tambahkan baris berikut di paling bawah:
   ```cron
   */10 * * * * /home/username/bot-wa/scripts/keepalive.sh >/dev/null 2>&1
   ```
   *(Ganti `username` dengan nama pengguna Serv00 kamu).*
3. Simpan dan keluar (Ctrl+O lalu Enter, kemudian Ctrl+X pada editor nano).

---

## 🛠️ Perintah Pengelolaan (Management Commands)

* **Cek status bot:**
  ```bash
  npx pm2 status
  ```
* **Melihat log realtime:**
  ```bash
  npx pm2 logs bot-wa
  ```
* **Restart bot:**
  ```bash
  npx pm2 restart bot-wa
  ```
* **Hentikan bot:**
  ```bash
  npx pm2 stop bot-wa
  ```

---

## 🔒 Catatan Keamanan & Etika
* Semua fitur OSINT dalam bot ini menggunakan API publik dan protokol diagnostik standar (IP Geolocation, RDAP, DoH, GitHub Public API) untuk tujuan edukasi dan diagnostik jaringan.
* Bot dilengkapi dengan proteksi rate-limiting 2.5 detik per pengguna serta simulasi pengetikan alami untuk menjaga nomor WhatsApp tetap aman dari deteksi spam.
