const NUMBER_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];

export class TicTacToeSession {
  constructor({ playerX, playerXName, playerO = null, playerOName = 'Bot', isVsBot = false }) {
    this.board = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    this.playerX = playerX;
    this.playerXName = playerXName;
    this.playerO = playerO;
    this.playerOName = playerOName;
    this.isVsBot = isVsBot;
    this.currentTurn = 'X'; // 'X' or 'O'
    this.winner = null;
    this.isDraw = false;
    this.status = 'playing'; // 'playing' | 'ended'
  }

  renderBoard() {
    const symbols = this.board.map((val, idx) => {
      if (val === 'X') return '❌';
      if (val === 'O') return '⭕';
      return NUMBER_EMOJIS[idx];
    });

    return [
      `  ${symbols[0]} │ ${symbols[1]} │ ${symbols[2]}`,
      `  ───┼───┼───`,
      `  ${symbols[3]} │ ${symbols[4]} │ ${symbols[5]}`,
      `  ───┼───┼───`,
      `  ${symbols[6]} │ ${symbols[7]} │ ${symbols[8]}`,
    ].join('\n');
  }

  checkWinner() {
    const lines = [
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8], // Baris
      [0, 3, 6],
      [1, 4, 7],
      [2, 5, 8], // Kolom
      [0, 4, 8],
      [2, 4, 6], // Diagonal
    ];

    for (const [a, b, c] of lines) {
      if (
        (this.board[a] === 'X' || this.board[a] === 'O') &&
        this.board[a] === this.board[b] &&
        this.board[a] === this.board[c]
      ) {
        this.winner = this.board[a];
        this.status = 'ended';
        return this.winner;
      }
    }

    if (this.board.every((val) => val === 'X' || val === 'O')) {
      this.isDraw = true;
      this.status = 'ended';
      return 'draw';
    }

    return null;
  }

  makeMove(position, playerJid) {
    const pos = parseInt(position, 10) - 1;
    if (isNaN(pos) || pos < 0 || pos > 8) {
      return { success: false, message: 'Masukkan angka posisi antara 1 sampai 9!' };
    }

    if (this.board[pos] === 'X' || this.board[pos] === 'O') {
      return { success: false, message: `Posisi ${position} sudah terisi! Pilih posisi lain.` };
    }

    // Periksa giliran
    if (this.currentTurn === 'X' && playerJid !== this.playerX) {
      return { success: false, message: `Sekarang adalah giliran *${this.playerXName}* (❌)!` };
    }
    if (this.currentTurn === 'O' && !this.isVsBot && playerJid !== this.playerO) {
      return { success: false, message: `Sekarang adalah giliran *${this.playerOName}* (⭕)!` };
    }

    // Lakukan langkah
    this.board[pos] = this.currentTurn;
    const result = this.checkWinner();

    if (result) {
      return { success: true, ended: true, winner: this.winner, isDraw: this.isDraw };
    }

    // Ganti giliran
    this.currentTurn = this.currentTurn === 'X' ? 'O' : 'X';

    // Jika lawan adalah Bot dan sekarang giliran O
    if (this.isVsBot && this.currentTurn === 'O' && this.status === 'playing') {
      this.makeBotMove();
      const botResult = this.checkWinner();
      if (botResult) {
        return { success: true, ended: true, winner: this.winner, isDraw: this.isDraw, botMoved: true };
      }
      this.currentTurn = 'X';
      return { success: true, ended: false, botMoved: true };
    }

    return { success: true, ended: false };
  }

  makeBotMove() {
    const available = [];
    for (let i = 0; i < 9; i++) {
      if (this.board[i] !== 'X' && this.board[i] !== 'O') {
        available.push(i);
      }
    }
    if (available.length > 0) {
      // Pilih acak dari posisi kosong
      const chosen = available[Math.floor(Math.random() * available.length)];
      this.board[chosen] = 'O';
    }
  }
}
