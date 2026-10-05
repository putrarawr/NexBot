import fs from 'node:fs';
import path from 'node:path';
import { InlineKeyboard, InputFile } from 'grammy';
import { registerCommand } from '../../bot/handler.js';
import { logger } from '../../utils/logger.js';

export function registerTelegramExclusiveCommands() {
  // 1. Interactive Dice & Casino Games (/dice)
  registerCommand({
    name: 'dice',
    aliases: ['dadu', 'roll', 'slot', 'casino'],
    category: 'telegram',
    description: 'Game lempar dadu interaktif, dart, basket & mesin slot dengan tombol',
    usage: '/dice',
    platforms: ['telegram'],
    async execute({ ctx, reply }) {
      if (!ctx?.reply) {
        return reply('Perintah ini hanya dapat dijalankan di Telegram.');
      }

      const keyboard = new InlineKeyboard()
        .text('[•] Dadu (1-6)', 'dice_roll:dice')
        .text('[•] Dart Panahan', 'dice_roll:dart')
        .row()
        .text('[•] Bola Basket', 'dice_roll:basketball')
        .text('[•] Sepak Bola', 'dice_roll:football')
        .row()
        .text('[•] Slot Casino 777', 'dice_roll:slots')
        .text('[•] Bowling', 'dice_roll:bowling');

      let text = `[GAME & CASINO INTERAKTIF]\n\n`;
      text += `Pilih salah satu game animasi di bawah ini untuk menguji keberuntungan.\n`;
      text += `Hadiah poin otomatis masuk ke leaderboard jika mendapatkan skor tinggi.`;

      await ctx.reply(text, {
        parse_mode: 'HTML',
        reply_markup: keyboard,
      });
    },
  });

  // 2. Whoami & Telegram ID Inspector (/whoami / /id)
  registerCommand({
    name: 'whoami',
    aliases: ['id', 'userinfo', 'myid'],
    category: 'telegram',
    description: 'Cek User ID, Chat ID, username, dan info profil Telegram kamu',
    usage: '/whoami',
    platforms: ['telegram'],
    async execute({ ctx, reply }) {
      if (!ctx?.from) {
        return reply('Perintah ini hanya dapat dijalankan di Telegram.');
      }

      const user = ctx.from;
      const chat = ctx.chat;

      let out = `[INFORMASI AKUN TELEGRAM]\n\n`;
      out += `• User ID: <code>${user.id}</code>\n`;
      out += `• Nama: ${user.first_name || ''} ${user.last_name || ''}\n`;
      out += `• Username: ${user.username ? '@' + user.username : '(Tidak ada)'}\n`;
      out += `• Telegram Premium: ${user.is_premium ? 'Ya' : 'Tidak'}\n`;
      out += `• Kode Bahasa: <code>${user.language_code || 'id'}</code>\n\n`;

      out += `[INFORMASI CHAT]\n`;
      out += `• Chat ID: <code>${chat.id}</code>\n`;
      out += `• Tipe Chat: ${chat.type}\n`;
      if (chat.title) {
        out += `• Judul Grup: ${chat.title}\n`;
      }

      const keyboard = new InlineKeyboard()
        .text('[ GAME ]', 'menu_cat:game')
        .text('[ MENU UTAMA ]', 'menu_main');

      await ctx.reply(out, {
        parse_mode: 'HTML',
        reply_markup: keyboard,
      });
    },
  });

  // 3. Telegram Chat Info (/chatinfo)
  registerCommand({
    name: 'chatinfo',
    aliases: ['groupinfo', 'gcinfo'],
    category: 'telegram',
    description: 'Cek informasi grup Telegram, jumlah member, dan perizinan',
    usage: '/chatinfo',
    platforms: ['telegram'],
    async execute({ ctx, reply }) {
      if (!ctx?.chat) {
        return reply('Perintah ini hanya dapat dijalankan di Telegram.');
      }

      const chat = ctx.chat;
      if (chat.type === 'private') {
        return reply('[!] Perintah ini khusus untuk grup atau channel Telegram.');
      }

      try {
        const memberCount = await ctx.api.getChatMemberCount(chat.id).catch(() => 'Tidak dapat diakses');
        const administrators = await ctx.api.getChatAdministrators(chat.id).catch(() => []);

        let out = `[INFORMASI GRUP TELEGRAM]\n\n`;
        out += `• Nama Grup: ${chat.title}\n`;
        out += `• ID Grup: <code>${chat.id}</code>\n`;
        out += `• Tipe: ${chat.type}\n`;
        out += `• Jumlah Anggota: ${memberCount} orang\n`;
        out += `• Jumlah Admin: ${administrators.length} admin\n\n`;

        if (administrators.length > 0) {
          out += `[DAFTAR ADMINISTRATOR]\n`;
          for (const adm of administrators.slice(0, 10)) {
            const name = adm.user.first_name || adm.user.username || 'Admin';
            const role = adm.status === 'creator' ? '[Pemilik]' : '[Admin]';
            out += `- ${name} ${role}\n`;
          }
        }

        await ctx.reply(out, { parse_mode: 'HTML' });
      } catch (err) {
        logger.error('Error saat chatinfo:', err.message);
        await reply(`[!] Gagal mengambil info grup: ${err.message}`);
      }
    },
  });

  // 4. Interactive Button Menu Showcase (/button / /buttons)
  registerCommand({
    name: 'buttons',
    aliases: ['button', 'tombol', 'quick'],
    category: 'telegram',
    description: 'Menampilkan menu pintasan cepat dengan tombol interaktif',
    usage: '/buttons',
    platforms: ['telegram'],
    async execute({ ctx, reply }) {
      if (!ctx?.reply) {
        return reply('Perintah ini hanya dapat dijalankan di Telegram.');
      }

      const keyboard = new InlineKeyboard()
        .text('[ TANYA AI ]', 'quick_ai')
        .text('[ TEBAK GAMBAR ]', 'quick_tg')
        .row()
        .text('[ DADU HADIAH ]', 'dice_roll:dice')
        .text('[ LEADERBOARD ]', 'quick_leaderboard')
        .row()
        .text('[ CEK IP SAYA ]', 'quick_ip')
        .text('[ MENU UTAMA ]', 'menu_main');

      await ctx.reply('[PINTASAN CEPAT INTERAKTIF]\n\nPilih aksi instan di bawah ini dengan menekan tombol:', {
        parse_mode: 'HTML',
        reply_markup: keyboard,
      });
    },
  });

  // 5. Ganti Banner Menu (/setbanner)
  registerCommand({
    name: 'setbanner',
    aliases: ['gantibanner', 'updatebanner'],
    category: 'telegram',
    description: 'Mengganti gambar banner atau GIF animasi di menu bot',
    usage: '/setbanner [kirim media / balas media]',
    platforms: ['telegram'],
    async execute({ ctx, reply, config }) {
      if (!ctx?.message) return;

      const userId = String(ctx.from?.id || '');
      const ownerId = String(config.telegramOwnerId || process.env.TELEGRAM_OWNER_ID || '');
      const isOwner = Boolean(ownerId) && userId === ownerId;

      if (!isOwner) {
        return reply('[!] Perintah ini hanya dapat digunakan oleh Pemilik (Owner) bot.');
      }

      const targetMsg = ctx.message.reply_to_message || ctx.message;
      let fileId = null;
      let isAnimation = false;
      let animationExtension = '.mp4';

      if (targetMsg.animation) {
        fileId = targetMsg.animation.file_id;
        isAnimation = true;
        animationExtension = path.extname(targetMsg.animation.file_name || '').toLowerCase() === '.gif' ? '.gif' : '.mp4';
      } else if (targetMsg.photo && targetMsg.photo.length > 0) {
        fileId = targetMsg.photo[targetMsg.photo.length - 1].file_id;
      } else if (targetMsg.video) {
        fileId = targetMsg.video.file_id;
        isAnimation = true;
        animationExtension = path.extname(targetMsg.video.file_name || '').toLowerCase() === '.gif' ? '.gif' : '.mp4';
      } else if (targetMsg.document) {
        fileId = targetMsg.document.file_id;
        const fileName = targetMsg.document.file_name || '';
        const mimeType = targetMsg.document.mime_type || '';
        if (/\.gif$/i.test(fileName) || /\.mp4$/i.test(fileName) || mimeType === 'image/gif' || mimeType === 'video/mp4') {
          isAnimation = true;
          animationExtension = /\.gif$/i.test(fileName) || mimeType === 'image/gif' ? '.gif' : '.mp4';
        }
      }

      if (!fileId) {
        return reply('[!] Format salah. Kirim gambar atau GIF dengan caption /setbanner, atau balas (reply) media yang ingin dijadikan banner.');
      }

      await reply('[-] Sedang mengunduh dan menerapkan banner baru...');

      try {
        const token = config.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN;
        const file = await ctx.api.getFile(fileId);
        const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
        const res = await fetch(fileUrl);
        if (!res.ok) throw new Error(`Unduhan media gagal (HTTP ${res.status}).`);
        const buffer = Buffer.from(await res.arrayBuffer());

        const bannerPaths = ['banner.gif', 'banner.mp4', 'jpeg', 'banner.jpg', 'banner.png']
          .map((name) => path.resolve(process.cwd(), name));

        if (isAnimation) {
          const animationPath = path.resolve(process.cwd(), `banner${animationExtension}`);
          fs.writeFileSync(animationPath, buffer);
          for (const oldPath of bannerPaths) {
            if (oldPath !== animationPath && fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
          }
          await reply('[+] Banner bot berhasil diperbarui dengan media animasi! Ketik /menu untuk melihatnya.');
        } else {
          const photoPath = path.resolve(process.cwd(), 'jpeg');
          fs.writeFileSync(photoPath, buffer);
          for (const oldPath of bannerPaths) {
            if (oldPath !== photoPath && fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
          }
          await reply('[+] Banner bot berhasil diperbarui dengan foto baru! Ketik /menu untuk melihatnya.');
        }
      } catch (err) {
        logger.error('Error saat setbanner:', err.message);
        await reply(`[!] Gagal memperbarui banner: ${err.message}`);
      }
    },
  });

  // 6. Ganti Foto Profil Bot (/setpp)
  registerCommand({
    name: 'setpp',
    aliases: ['setprofile', 'gantipp', 'gantifoto'],
    category: 'telegram',
    description: 'Mengganti foto profil bot Telegram secara instan',
    usage: '/setpp [kirim foto dengan caption /setpp atau balas foto]',
    platforms: ['telegram'],
    async execute({ ctx, reply, config }) {
      if (!ctx?.message) return;

      const userId = String(ctx.from?.id || '');
      const ownerId = String(config.telegramOwnerId || process.env.TELEGRAM_OWNER_ID || '');
      const isOwner = Boolean(ownerId) && userId === ownerId;

      if (!isOwner) {
        return reply('[!] Perintah ini hanya dapat digunakan oleh Pemilik (Owner) bot.');
      }

      const targetMsg = ctx.message.reply_to_message || ctx.message;
      let fileId = null;

      if (targetMsg.photo && targetMsg.photo.length > 0) {
        fileId = targetMsg.photo[targetMsg.photo.length - 1].file_id;
      }

      if (!fileId) {
        return reply('[!] Balas (reply) foto atau kirim foto dengan caption /setpp untuk mengganti foto profil bot.');
      }

      await reply('[-] Sedang memproses penggantian foto profil bot...');

      try {
        const token = config.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN;
        const file = await ctx.api.getFile(fileId);
        const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
        const res = await fetch(fileUrl);
        if (!res.ok) throw new Error(`Unduhan foto gagal (HTTP ${res.status}).`);
        const buffer = Buffer.from(await res.arrayBuffer());

        await ctx.api.setMyProfilePhoto(new InputFile(buffer, 'profile.jpg'));
        await reply('[+] Foto profil bot Telegram berhasil diganti!');
      } catch (err) {
        logger.error('Error saat setpp:', err.message);
        await reply(`[!] Gagal mengganti foto profil: ${err.message}`);
      }
    },
  });
}
