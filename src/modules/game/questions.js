// Bank Soal Kuis Indonesia

export const tebakGambarList = [
  {
    image: 'https://telegra.ph/file/0c934301be85324e94119.jpg',
    answer: 'TUKANG BUBUR AYAM',
    clue: 'T_K_NG B_B_R _Y_M',
  },
  {
    image: 'https://telegra.ph/file/1897c6407dd98faae2f46.jpg',
    answer: 'KACANG POLONG',
    clue: 'K_C_NG P_L_NG',
  },
  {
    image: 'https://telegra.ph/file/343ad5fb18a93901b0f5b.jpg',
    answer: 'PISAU TAJAM',
    clue: 'P_S__ T_J_M',
  },
  {
    image: 'https://telegra.ph/file/d867c4bf7c2cb45a557b7.jpg',
    answer: 'LAMPU MERAH',
    clue: 'L_MP_ M_R_H',
  },
  {
    image: 'https://telegra.ph/file/857e49226cb9da4d12c01.jpg',
    answer: 'JAM TANGAN',
    clue: 'J_M T_NG_N',
  },
];

export const tebakKataList = [
  {
    question: 'Aku dipakai di kepala, punya sayap tapi bukan burung. Apakah aku?',
    answer: 'topi caping',
    clue: 'T_pi C_p_ng',
  },
  {
    question: 'Benda apa yang selalu naik dan tidak pernah turun?',
    answer: 'umur',
    clue: 'U_u_',
  },
  {
    question: 'Punya banyak gigi tapi tidak bisa menggigit, apakah aku?',
    answer: 'sisir',
    clue: 'S_s_r',
  },
  {
    question: 'Semakin dipotong malah semakin tinggi, apakah itu?',
    answer: 'celana panjang',
    clue: 'C_l_n_ P_nj_ng',
  },
  {
    question: 'Aku selalu ada di depan mata tapi tidak bisa dilihat secara langsung tanpa cermin. Apakah aku?',
    answer: 'wajah',
    clue: 'W_j_h',
  },
  {
    question: 'Benda apa yang kalau basah ia mengeringkan?',
    answer: 'handuk',
    clue: 'H_nd_k',
  },
  {
    question: 'Bila kamu memilikiku, kamu ingin membagiku. Jika kamu membagiku, kamu tidak memilikiku lagi. Apakah aku?',
    answer: 'rahasia',
    clue: 'R_h_s__',
  },
];

export const asahOtakList = [
  {
    question: 'Bila ada 5 burung di pohon lalu ditembak 1 ekor hingga jatuh, tinggal berapa burung di pohon?',
    answer: '0',
    explanation: 'Semua burung lainnya terbang karena kaget mendengar suara tembakan.',
  },
  {
    question: 'Berapa kali kamu bisa mengurangkan angka 5 dari angka 25?',
    answer: '1 kali',
    explanation: 'Karena setelah dikurang sekali, angkanya menjadi 20 bukan 25 lagi.',
  },
  {
    question: 'Ada berapa bulan dalam setahun yang memiliki 28 hari?',
    answer: '12 bulan',
    explanation: 'Semua bulan memiliki setidaknya 28 hari.',
  },
  {
    question: 'Apa yang bisa berjalan di atas air tanpa basah?',
    answer: 'bayangan',
    explanation: 'Bayangan tidak memiliki materi fisik.',
  },
  {
    question: 'Siapa yang selalu potong rambut setiap hari tapi rambutnya tidak pernah habis?',
    answer: 'tukang cukur',
    explanation: 'Dia memotong rambut orang lain.',
  },
];

export function generateMathProblem() {
  const operations = ['+', '-', '*'];
  const op = operations[Math.floor(Math.random() * operations.length)];
  let a, b, answer;

  if (op === '+') {
    a = Math.floor(Math.random() * 80) + 10;
    b = Math.floor(Math.random() * 80) + 10;
    answer = a + b;
  } else if (op === '-') {
    a = Math.floor(Math.random() * 90) + 20;
    b = Math.floor(Math.random() * a);
    answer = a - b;
  } else {
    // Multiplication
    a = Math.floor(Math.random() * 12) + 2;
    b = Math.floor(Math.random() * 12) + 2;
    answer = a * b;
  }

  return {
    question: `${a} ${op === '*' ? '×' : op} ${b}`,
    answer: String(answer),
    a,
    b,
    op,
  };
}
