import { InlineKeyboard } from 'grammy';
import { addScore } from '../../utils/database.js';

// In-memory store untuk sesi game visual
export const visualSessions = new Map();

/**
 * 1. Visual Tic-Tac-Toe Engine (3x3 Real Inline Button Grid)
 */
export function createTicTacToeSession(chatId, player1, player2 = null) {
  const sessionId = 'ttt_' + Math.random().toString(36).slice(2, 8);
  const session = {
    id: sessionId,
    chatId,
    playerX: player1, // { id, name }
    playerO: player2, // null = Solo vs Bot AI
    turn: 'X',
    board: Array(9).fill(''),
    winner: null,
    isDraw: false,
    startTime: Date.now(),
  };

  visualSessions.set(sessionId, session);
  return session;
}

export function renderTicTacToeBoard(session) {
  const symbols = { X: '❌', O: '⭕', '': '⬜' };
  const keyboard = new InlineKeyboard();

  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const idx = row * 3 + col;
      const val = session.board[idx];
      const label = symbols[val] || '⬜';
      const action = session.winner || session.isDraw ? 'ttt_noop' : `ttt_click:${session.id}:${idx}`;
      keyboard.text(label, action);
    }
    keyboard.row();
  }

  if (!session.winner && !session.isDraw) {
    keyboard.text('[ 🏳️ MENYERAH ]', `ttt_forfeit:${session.id}`);
  } else {
    keyboard.text('[ 🔄 MAIN LAGI ]', 'visual_ttt_new');
    keyboard.text('[ « MENU GAME ]', 'menu_cat:game');
  }

  let text = `<b>[ TIC-TAC-TOE 3x3 VISUAL GAME ]</b>\n\n`;
  text += `• <b>Pemain ❌:</b> ${session.playerX.name}\n`;
  text += `• <b>Pemain ⭕:</b> ${session.playerO ? session.playerO.name : 'Bot Pintar (AI)'}\n\n`;

  if (session.winner) {
    const winnerName = session.winner === 'X' ? session.playerX.name : (session.playerO ? session.playerO.name : 'Bot Pintar');
    text += `🏆 <b>HASIL: PEMENANG ADALAH ${winnerName.toUpperCase()} (${symbols[session.winner]})!</b>\n`;
    text += `<i>Hadiah +50 Poin telah ditambahkan ke profil!</i>`;
  } else if (session.isDraw) {
    text += `🤝 <b>HASIL: PERTANDINGAN SERI / SEIMBANG (DRAW)!</b>`;
  } else {
    const currentName = session.turn === 'X' ? session.playerX.name : (session.playerO ? session.playerO.name : 'Bot Pintar');
    text += `Giliran: <b>${currentName}</b> (${symbols[session.turn]})\n`;
    text += `<i>Sentuh salah satu kotak ⬜ di bawah untuk melangkah:</i>`;
  }

  return { text, keyboard };
}

export function checkTicTacToeWinner(board) {
  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // Baris
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // Kolom
    [0, 4, 8], [2, 4, 6],             // Diagonal
  ];

  for (const [a, b, c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }

  if (board.every((cell) => cell !== '')) {
    return 'draw';
  }

  return null;
}

export function makeBotMove(board) {
  // 1. Cek apakah bot bisa menang di langkah ini
  for (let i = 0; i < 9; i++) {
    if (board[i] === '') {
      board[i] = 'O';
      if (checkTicTacToeWinner(board) === 'O') {
        board[i] = '';
        return i;
      }
      board[i] = '';
    }
  }

  // 2. Blokir pemain X jika mau menang
  for (let i = 0; i < 9; i++) {
    if (board[i] === '') {
      board[i] = 'X';
      if (checkTicTacToeWinner(board) === 'X') {
        board[i] = '';
        return i;
      }
      board[i] = '';
    }
  }

  // 3. Ambil titik tengah jika kosong
  if (board[4] === '') return 4;

  // 4. Pilih sudut acak
  const corners = [0, 2, 6, 8].filter((idx) => board[idx] === '');
  if (corners.length > 0) {
    return corners[Math.floor(Math.random() * corners.length)];
  }

  // 5. Langkah sisa
  const available = [];
  board.forEach((val, idx) => {
    if (val === '') available.push(idx);
  });
  return available.length > 0 ? available[Math.floor(Math.random() * available.length)] : null;
}

/**
 * 2. Visual Batu Gunting Kertas (RPS) Engine
 */
export function buildRpsKeyboard() {
  return new InlineKeyboard()
    .text('[ ✊ BATU ]', 'rps_play:batu')
    .text('[ ✌️ GUNTING ]', 'rps_play:gunting')
    .text('[ 🖐️ KERTAS ]', 'rps_play:kertas')
    .row()
    .text('[ « KEMBALI ]', 'menu_cat:game');
}

export function playRpsRound(playerChoice, pushName, userId) {
  const choices = ['batu', 'gunting', 'kertas'];
  const symbols = {
    batu: '✊ BATU',
    gunting: '✌️ GUNTING',
    kertas: '🖐️ KERTAS',
  };

  const botChoice = choices[Math.floor(Math.random() * choices.length)];
  let result = 'draw';
  let reward = 10;
  let resultLabel = 'SERI!';

  if (playerChoice === botChoice) {
    result = 'draw';
    resultLabel = 'SERI! Pilihan kalian sama persis.';
    reward = 10;
  } else if (
    (playerChoice === 'batu' && botChoice === 'gunting') ||
    (playerChoice === 'gunting' && botChoice === 'kertas') ||
    (playerChoice === 'kertas' && botChoice === 'batu')
  ) {
    result = 'win';
    resultLabel = 'KAMU MENANG! Hebat sekali!';
    reward = 40;
    addScore(`tg:${userId}`, reward, pushName);
  } else {
    result = 'lose';
    resultLabel = 'BOT MENANG! Coba lagi keberuntunganmu!';
    reward = 5;
  }

  let text = `<b>[ BATU GUNTING KERTAS - HASIL ]</b>\n\n`;
  text += `• Pilihanmu: <b>${symbols[playerChoice]}</b>\n`;
  text += `• Pilihan Bot: <b>${symbols[botChoice]}</b>\n\n`;
  text += `🏆 <b>HASIL: ${resultLabel}</b>\n`;
  if (result === 'win') {
    text += `🎁 Hadiah: <b>+${reward} Poin</b>`;
  }

  const keyboard = new InlineKeyboard()
    .text('[ 🔄 MAIN LAGI ]', 'quick_rps')
    .text('[ « MENU GAME ]', 'menu_cat:game');

  return { text, keyboard };
}
