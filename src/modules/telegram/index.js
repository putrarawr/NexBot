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
        .text('🎲 Dadu (1-6)', 'dice_roll:dice')
        .text('🎯 Panahan / Dart', 'dice_roll:dart')
        .row()
        .text('🏀 Bola Basket', 'dice_roll:basketball')
        .text('⚽ Sepak Bola', 'dice_roll:football')
        .row()
        .text('🎰 Mesin Slot Casino', 'dice_roll:slots')
        .text('🎳 Bowling', 'dice_roll:bowling');

      let text = `🎮 <b>TELEGRAM INTERACTIVE GAMES</b>\n\n`;
      text += `Pilih salah satu game animasi di bawah ini untuk menguji keberuntunganmu!\n`;
      text += `Hadiah poin akan otomatis masuk ke leaderboard jika mendapatkan skor tinggi.`;

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

      let out = `👤 <b>INFORMASI AKUN TELEGRAM</b>\n\n`;
      out += `• <b>User ID:</b> <code>${user.id}</code>\n`;
      out += `• <b>Nama:</b> ${user.first_name || ''} ${user.last_name || ''}\n`;
      out += `• <b>Username:</b> ${user.username ? '@' + user.username : '<i>(Tidak ada)</i>'}\n`;
      out += `• <b>Telegram Premium:</b> ${user.is_premium ? '🌟 Ya' : 'Tidak'}\n`;
      out += `• <b>Kode Bahasa:</b> <code>${user.language_code || 'id'}</code>\n\n`;

      out += `📍 <b>INFORMASI CHAT</b>\n`;
      out += `• <b>Chat ID:</b> <code>${chat.id}</code>\n`;
      out += `• <b>Tipe Chat:</b> <code>${chat.type}</code>\n`;
      if (chat.title) {
        out += `• <b>Judul Grup:</b> ${chat.title}\n`;
      }

      const keyboard = new InlineKeyboard()
        .text('🎮 Main Game', 'menu_cat:game')
        .text('📜 Menu Lengkap', 'menu_main');

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
        return reply('ℹ️ Perintah ini khusus untuk grup atau channel Telegram.');
      }

      try {
        const memberCount = await ctx.api.getChatMemberCount(chat.id).catch(() => 'Tidak dapat diakses');
        const administrators = await ctx.api.getChatAdministrators(chat.id).catch(() => []);

        let out = `👥 <b>INFORMASI GRUP TELEGRAM</b>\n\n`;
        out += `• <b>Nama Grup:</b> ${chat.title}\n`;
        out += `• <b>ID Grup:</b> <code>${chat.id}</code>\n`;
        out += `• <b>Tipe:</b> <code>${chat.type}</code>\n`;
        out += `• <b>Jumlah Anggota:</b> <b>${memberCount}</b> orang\n`;
        out += `• <b>Jumlah Admin:</b> <b>${administrators.length}</b> admin\n\n`;

        if (administrators.length > 0) {
          out += `👑 <b>Daftar Admin:</b>\n`;
          for (const adm of administrators.slice(0, 10)) {
            const name = adm.user.first_name || adm.user.username || 'Admin';
            const role = adm.status === 'creator' ? '⭐ Pemilik' : '🛡️ Admin';
            out += `- ${name} (${role})\n`;
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
        .text('💡 Tanya AI', 'quick_ai')
        .text('🎮 Tebak Gambar', 'quick_tg')
        .row()
        .text('🎲 Dadu Berhadiah', 'dice_roll:dice')
        .text('🏆 Leaderboard', 'menu_cat:game')
        .row()
        .text('🔍 Cek IP Saya', 'quick_ip')
        .text('📜 Menu Utama', 'menu_main');

      await ctx.reply('⚡ <b>PINTASAN CEPAT INTERAKTIF</b>\n\nPilih aksi instan di bawah ini dengan menekan tombol:', {
        parse_mode: 'HTML',
        reply_markup: keyboard,
      });
    },
  });
}
