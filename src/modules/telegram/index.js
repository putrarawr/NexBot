import { InlineKeyboard } from 'grammy';
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
}
