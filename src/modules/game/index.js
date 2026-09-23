import { registerCommand } from '../../bot/handler.js';
import { activeGames, addScore, getLeaderboard, getUser } from '../../utils/database.js';
import { tebakGambarList, tebakKataList, asahOtakList, generateMathProblem } from './questions.js';
import { TicTacToeSession } from './tictactoe.js';
import { logger } from '../../utils/logger.js';

export async function handleGameInput({ sock, msg, jid, sender, pushName, text, reply }) {
  const active = activeGames.get(jid);
  if (!active) return false;

  const normalizedInput = text.trim().toLowerCase();

  // Opsi menyerah
  if (normalizedInput === '.nyerah' || normalizedInput === 'nyerah') {
    clearTimeout(active.timer);
    activeGames.delete(jid);
    await reply(`🏳️ Permainan dihentikan!\nJawaban yang benar adalah: *${active.answer}*`);
    return true;
  }

  // 1. Handling Kuis / Teka-Teki (Tebak Gambar, Tebak Kata, Asah Otak, Math)
  if (['tebakgambar', 'tebakkata', 'asahotak', 'math'].includes(active.type)) {
    const isCorrect = normalizedInput === active.answer.toLowerCase();

    if (isCorrect) {
      clearTimeout(active.timer);
      activeGames.delete(jid);

      const reward = active.reward || 50;
      const totalScore = addScore(sender, reward, pushName);

      let winMsg = `🎉 *BENAR SEKALI!*\n\n`;
      winMsg += `👤 Penjawab: *${pushName}*\n`;
      winMsg += `🎯 Jawaban: *${active.answer}*\n`;
      winMsg += `💰 Hadiah: *+${reward} Poin*\n`;
      winMsg += `🏆 Total Poin: *${totalScore}*\n\n`;
      winMsg += `Ketik \`.tebakgambar\` atau \`.math\` untuk bermain lagi!`;

      await reply(winMsg);
      return true;
    } else {
      // Jawaban salah, jika ada clue beri hint
      if (active.type === 'math') {
        // Pada math jangan spam respon salah kecuali diminta
        return false;
      }
      return false; // Biarkan chat mengalir tanpa mengganggu pesan non-jawaban
    }
  }

  // 2. Handling Tic-Tac-Toe
  if (active.type === 'tictactoe') {
    // Cek apakah input berupa digit 1-9
    if (/^[1-9]$/.test(text.trim())) {
      const session = active.session;
      const move = session.makeMove(text.trim(), sender);

      if (!move.success) {
        await reply(`⚠️ ${move.message}`);
        return true;
      }

      const boardRender = session.renderBoard();

      if (move.ended) {
        clearTimeout(active.timer);
        activeGames.delete(jid);

        if (move.isDraw) {
          await reply(`🎮 *TIC-TAC-TOE SERI!*\n\n${boardRender}\n\nPermainan berakhir seimbang!`);
        } else {
          const winnerName = move.winner === 'X' ? session.playerXName : session.playerOName;
          const winnerJid = move.winner === 'X' ? session.playerX : session.playerO;
          let bonus = 0;
          if (winnerJid) {
            bonus = addScore(winnerJid, 75, winnerName);
          }

          let endMsg = `🏆 *PEMENANG TIC-TAC-TOE!*\n\n`;
          endMsg += `${boardRender}\n\n`;
          endMsg += `Selamat kepada *${winnerName}* (${move.winner === 'X' ? '❌' : '⭕'})!\n`;
          if (winnerJid) endMsg += `💰 Hadiah: *+75 Poin* (Total: ${bonus})`;
          await reply(endMsg);
        }
        return true;
      }

      // Game berlanjut
      const nextPlayer = session.currentTurn === 'X' ? session.playerXName : session.playerOName;
      const nextIcon = session.currentTurn === 'X' ? '❌' : '⭕';
      let turnMsg = `🎮 *TIC-TAC-TOE*\n\n`;
      turnMsg += `${boardRender}\n\n`;
      turnMsg += `Giliran: *${nextPlayer}* (${nextIcon})\n`;
      turnMsg += `Ketik angka *1-9* untuk melangkah.`;
      await reply(turnMsg);
      return true;
    }
  }

  return false;
}

export function registerGameCommands() {
  // Command: Tebak Gambar
  registerCommand({
    name: 'tebakgambar',
    aliases: ['tgambar', 'tbkgambar'],
    category: 'game',
    description: 'Game tebak gambar dengan petunjuk',
    usage: '.tebakgambar',
    async execute({ sock, jid, reply, prefix }) {
      if (activeGames.has(jid)) {
        return reply('⚠️ Masih ada permainan yang sedang berlangsung di chat ini! Selesaikan atau ketik `.nyerah`.');
      }

      const item = tebakGambarList[Math.floor(Math.random() * tebakGambarList.length)];
      const timeoutSec = 60;

      const timer = setTimeout(async () => {
        if (activeGames.has(jid)) {
          activeGames.delete(jid);
          await reply(`⏰ *Waktu Habis!*\nJawaban yang benar adalah: *${item.answer}*`);
        }
      }, timeoutSec * 1000);

      activeGames.set(jid, {
        type: 'tebakgambar',
        answer: item.answer,
        reward: 50,
        timer,
      });

      let caption = `🖼️ *TEBAK GAMBAR*\n\n`;
      caption += `Petunjuk: \`${item.clue}\`\n`;
      caption += `Waktu: *${timeoutSec} detik*\n`;
      caption += `Hadiah: *+50 Poin*\n\n`;
      caption += `Balas chat ini langsung dengan tebakanmu! (Ketik \`${prefix}nyerah\` jika pasrah)`;

      try {
        await sock.sendMessage(jid, {
          image: { url: item.image },
          caption,
        });
      } catch (err) {
        // Fallback jika fetch gambar eksternal gagal
        await reply(`${caption}\n\n_(Gambar: ${item.image})_`);
      }
    },
  });

  // Command: Tebak Kata
  registerCommand({
    name: 'tebakkata',
    aliases: ['tkata', 'tbkkata'],
    category: 'game',
    description: 'Kuis tebak kata Indonesia',
    usage: '.tebakkata',
    async execute({ jid, reply, prefix }) {
      if (activeGames.has(jid)) {
        return reply('⚠️ Masih ada permainan yang sedang berlangsung di chat ini! Ketik `.nyerah` jika menyerah.');
      }

      const item = tebakKataList[Math.floor(Math.random() * tebakKataList.length)];
      const timeoutSec = 60;

      const timer = setTimeout(async () => {
        if (activeGames.has(jid)) {
          activeGames.delete(jid);
          await reply(`⏰ *Waktu Habis!*\nJawaban tebak kata adalah: *${item.answer}*`);
        }
      }, timeoutSec * 1000);

      activeGames.set(jid, {
        type: 'tebakkata',
        answer: item.answer,
        reward: 40,
        timer,
      });

      let msg = `🧩 *TEBAK KATA*\n\n`;
      msg += `Pertanyaan: *${item.question}*\n`;
      msg += `Petunjuk: \`${item.clue}\`\n`;
      msg += `Waktu: *${timeoutSec} detik*\n`;
      msg += `Hadiah: *+40 Poin*\n\n`;
      msg += `Ketik tebakanmu langsung di chat ini!`;
      await reply(msg);
    },
  });

  // Command: Asah Otak
  registerCommand({
    name: 'asahotak',
    aliases: ['otak', 'riddle'],
    category: 'game',
    description: 'Teka-teki logika asah otak',
    usage: '.asahotak',
    async execute({ jid, reply, prefix }) {
      if (activeGames.has(jid)) {
        return reply('⚠️ Masih ada permainan aktif! Selesaikan dulu atau ketik `.nyerah`.');
      }

      const item = asahOtakList[Math.floor(Math.random() * asahOtakList.length)];
      const timeoutSec = 60;

      const timer = setTimeout(async () => {
        if (activeGames.has(jid)) {
          activeGames.delete(jid);
          await reply(`⏰ *Waktu Habis!*\nJawaban: *${item.answer}*\nPenjelasan: _${item.explanation}_`);
        }
      }, timeoutSec * 1000);

      activeGames.set(jid, {
        type: 'asahotak',
        answer: item.answer,
        reward: 45,
        timer,
      });

      let msg = `🧠 *ASAH OTAK*\n\n`;
      msg += `Teka-Teki: *${item.question}*\n`;
      msg += `Waktu: *${timeoutSec} detik*\n`;
      msg += `Hadiah: *+45 Poin*\n\n`;
      msg += `Balas langsung dengan jawaban logika terbaikmu!`;
      await reply(msg);
    },
  });

  // Command: Kuis Matematika (Math)
  registerCommand({
    name: 'math',
    aliases: ['mtk', 'hitung'],
    category: 'game',
    description: 'Kuis hitung cepat matematika',
    usage: '.math',
    async execute({ jid, reply }) {
      if (activeGames.has(jid)) {
        return reply('⚠️ Ada permainan yang belum selesai. Ketik `.nyerah` untuk mengakhiri.');
      }

      const mathProb = generateMathProblem();
      const timeoutSec = 30;

      const timer = setTimeout(async () => {
        if (activeGames.has(jid)) {
          activeGames.delete(jid);
          await reply(`⏰ *Waktu Habis!*\nHasil dari ${mathProb.question} adalah: *${mathProb.answer}*`);
        }
      }, timeoutSec * 1000);

      activeGames.set(jid, {
        type: 'math',
        answer: mathProb.answer,
        reward: 35,
        timer,
      });

      let msg = `⚡ *KUIS MATEMATIKA CEPAT*\n\n`;
      msg += `Berapa hasil dari: *${mathProb.question}* ?\n\n`;
      msg += `Waktu: *${timeoutSec} detik*\n`;
      msg += `Hadiah: *+35 Poin*\n`;
      msg += `Ketik angka jawabannya sekarang!`;
      await reply(msg);
    },
  });

  // Command: Tic-Tac-Toe
  registerCommand({
    name: 'tictactoe',
    aliases: ['ttt'],
    category: 'game',
    description: 'Main game Tic-Tac-Toe 3x3 (lawan Bot atau teman)',
    usage: '.tictactoe [@user / bot]',
    async execute({ msg, jid, sender, pushName, args, reply }) {
      if (activeGames.has(jid)) {
        return reply('⚠️ Sedang ada game aktif di obrolan ini! Ketik `.nyerah` untuk membatalkan.');
      }

      const mentionedJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
      const isVsBot = !mentionedJid || args[0]?.toLowerCase() === 'bot';

      const session = new TicTacToeSession({
        playerX: sender,
        playerXName: pushName,
        playerO: isVsBot ? null : mentionedJid,
        playerOName: isVsBot ? 'Bot (AI)' : 'Lawan',
        isVsBot,
      });

      const timeoutSec = 120;
      const timer = setTimeout(async () => {
        if (activeGames.has(jid)) {
          activeGames.delete(jid);
          await reply('⏰ *Tic-Tac-Toe Berakhir:* Waktu bermain habis karena tidak ada aktivitas.');
        }
      }, timeoutSec * 1000);

      activeGames.set(jid, {
        type: 'tictactoe',
        session,
        timer,
      });

      let text = `🎮 *GAME TIC-TAC-TOE DIMULAI!*\n\n`;
      text += `❌ Pemain 1: *${session.playerXName}*\n`;
      text += `⭕ Pemain 2: *${session.playerOName}*\n\n`;
      text += `${session.renderBoard()}\n\n`;
      text += `Giliran pertama: *${session.playerXName}* (❌)\n`;
      text += `Ketik angka *1-9* sesuai kotak pilihanmu!`;

      await reply(text);
    },
  });

  // Command: Leaderboard
  registerCommand({
    name: 'leaderboard',
    aliases: ['top', 'rank'],
    category: 'game',
    description: 'Melihat 10 pemain dengan skor tertinggi',
    usage: '.leaderboard',
    async execute({ reply }) {
      const topUsers = getLeaderboard(10);
      if (topUsers.length === 0) {
        return reply('🏆 Belum ada pemain yang tercatat di papan peringkat.');
      }

      const medalEmojis = ['🥇', '🥈', '🥉'];
      let msg = `🏆 *PAPAN PERINGKAT SKOR TOP 10*\n\n`;
      topUsers.forEach((u, i) => {
        const medal = medalEmojis[i] || `*${i + 1}.*`;
        msg += `${medal} *${u.name}* : ${u.score} Poin (${u.gamesWon || 0} menang)\n`;
      });

      msg += `\nMainkan \`.tebakgambar\`, \`.tebakkata\`, \`.math\`, atau \`.tictactoe\` untuk menambah poin!`;
      await reply(msg);
    },
  });

  // Command: Score
  registerCommand({
    name: 'score',
    aliases: ['poin', 'profil'],
    category: 'game',
    description: 'Cek jumlah poin dan statistik permainan kamu',
    usage: '.score',
    async execute({ sender, pushName, reply }) {
      const user = getUser(sender, pushName);
      let msg = `📊 *STATISTIK PERMAINAN*\n\n`;
      msg += `👤 Nama: *${user.name}*\n`;
      msg += `💰 Poin: *${user.score || 0}*\n`;
      msg += `🏆 Game Dimenangkan: *${user.gamesWon || 0}*\n`;
      await reply(msg);
    },
  });
}
