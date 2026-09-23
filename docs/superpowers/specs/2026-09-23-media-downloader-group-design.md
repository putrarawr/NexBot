# Specification: Media, Sticker, PhotoLive, Downloader & Group Utility

**Tanggal:** 2026-09-23  
**Status:** Approved Draft  
**Target Komponen:** `src/modules/media/`, `src/modules/downloader/`, `src/modules/group/`  

---

## 1. Ringkasan Fitur Baru
Spesifikasi ini menambahkan 3 modul utama ke dalam **NexBot**:
1. **Media & Sticker Tools (`src/modules/media/`):** Pembuat stiker otomatis dari gambar/video/GIF (`.s`), ekstraktor stiker ke gambar (`.toimg`), pembuat stiker quote chat estetik lokal (`.qc`), dan konverter iPhone Live Photo (`.photolive`).
2. **Social Downloader (`src/modules/downloader/`):** Pengunduh video TikTok tanpa watermark (`.tiktok`) dengan pengiriman video langsung ke chat.
3. **Group Management & Utility (`src/modules/group/`):** Fitur panggilan seluruh anggota grup secara senyap (`.hidetag`) dan sistem status ketiadaan pengguna (`.afk`).

---

## 2. Rincian Teknis Komponen

### 2.1 Modul Media & Stiker (`src/modules/media/`)
Memanfaatkan library bawaan `@whiskeysockets/baileys` (`downloadMediaMessage`) dan binary lokal `/usr/bin/ffmpeg`:

* **`convertImageToSticker(imageBuffer)`:**
  - Mengonversi format JPG/PNG/WebP menjadi stiker WebP 512x512 piksel dengan padding proporsional:
    `ffmpeg -y -i input -vcodec libwebp -filter:v "scale='if(gt(a,1),512,-1)':'if(gt(a,1),-1,512)',pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black@0.0" -lossless 1 output.webp`
* **`convertVideoToAnimatedSticker(videoBuffer)`:**
  - Mengambil maksimal 6 detik pertama dari video/GIF.
  - Membatasi framerate 15 FPS dan ukuran resolusi 512x512 agar ukuran file di bawah 1 MB:
    `ffmpeg -y -i input -vcodec libwebp -filter:v "scale='if(gt(a,1),512,-1)':'if(gt(a,1),-1,512)',pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black@0.0,fps=15" -loop 0 -ss 0 -t 6 -an -vsync 0 -s 512:512 output.webp`
* **`convertStickerToImage(stickerBuffer)`:**
  - Mengonversi WebP statis maupun animasi menjadi format PNG:
    `ffmpeg -y -i input.webp -vframes 1 output.png`
* **`generateQuoteChat(name, text, photoUrl)`:**
  - Menghasilkan file SVG bergaya dark-mode modern berisi avatar pengguna, nama pengirim, dan teks kutipan, lalu dikonversi langsung ke WebP via librsvg & FFmpeg.
* **`processPhotoLive(mediaBuffer, isVideo)`:**
  - Jika input berupa video pendek (iPhone Live Photo): membuat stiker animasi berputar (loop) dan mengekstrak video MP4 berulang.
  - Jika input berupa foto statis: menerapkan efek dynamic cinematic zoom/pan berdurasi 3 detik ke format MP4 bergerak.

### 2.2 Modul Downloader (`src/modules/downloader/`)
* **`.tiktok <url>`:**
  - Melakukan query ke API scraper publik TikWM (`https://www.tikwm.com/api/?url=...`).
  - Mengambil URL video direct stream tanpa watermark (`data.play`).
  - Mengunduh buffer video secara aman ke memori (maksimal batas ukuran 20 MB).
  - Mengirimkan video langsung ke pengguna dengan judul video dan durasi.

### 2.3 Modul Group Utility (`src/modules/group/`)
* **`.hidetag <pesan>`:**
  - Memeriksa apakah pengirim adalah Admin grup atau Pemilik bot (`isBotAdmin` / `isSenderAdmin` / `isOwner`).
  - Mengambil daftar semua anggota via `sock.groupMetadata(jid)`.
  - Mengirimkan pesan dengan parameter `mentions: participants.map(p => p.id)`.
* **`.afk [alasan]`:**
  - Menyimpan status pengguna di `data/database.json`:
    `afk: { [jid]: { reason: string, time: number } }`.
  - Di `handler.js`:
    1. Jika pengirim sendiri berstatus AFK dan mengirim pesan apa pun: bot menghapus status AFK dan mengirimkan sambutan selamat datang kembali dengan durasi waktu AFK.
    2. Jika pesan menyebut (*mention*) pengguna lain yang sedang AFK: bot membalas bahwa orang tersebut sedang AFK disertai alasan dan waktu mulai AFK.

---

## 3. Manajemen Sumber Daya & File Sementara (Ephemeral Cleanup)
- Semua konversi media FFmpeg menggunakan folder `/tmp/nexbot_media_<timestamp>_<random>/`.
- Blok `try ... finally` menjamin folder dan file sementara selalu dihapus setelah proses konversi selesai atau jika terjadi error, sehingga tidak terjadi kebocoran memori atau penumpukan sampah disk.
- Penanganan batas ukuran video (maksimal 20 MB) untuk mencegah pemakaian CPU berlebihan.

---

## 4. Rencana Pengujian (Testing Plan)
1. **Unit Test Media:** Menguji fungsi konversi stiker gambar dan pembuatan quote chat via FFmpeg.
2. **Unit Test AFK:** Menguji penyimpanan status AFK, deteksi mention AFK, dan pemulihan status saat aktif kembali.
3. **Unit Test Hidetag:** Menguji ekstraksi daftar anggota grup dan pembatasan izin admin.
4. **Smoke Test TikTok:** Menguji penanganan URL valid dan invalid pada downloader.
