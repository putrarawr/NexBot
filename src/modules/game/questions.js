// Bank Soal Kuis Indonesia

export const tebakGambarList = [
  {
    image: 'https://www.cademedia.com/wp-content/uploads/2020/12/tebak-gambar-level-1-nomor-1.jpg',
    answer: 'TANTANGAN SERU',
    clue: 'T_NT_NG_N S_R_',
  },
  {
    image: 'https://www.cademedia.com/wp-content/uploads/2020/12/tebak-gambar-level-1-nomor-2.jpg',
    answer: 'TENAGA LISTRIK',
    clue: 'T_N_G_ L_STR_K',
  },
  {
    image: 'https://www.cademedia.com/wp-content/uploads/2020/12/tebak-gambar-level-1-nomor-3.jpg',
    answer: 'SARUNG BANTAL',
    clue: 'S_R_NG B_NT_L',
  },
  {
    image: 'https://www.cademedia.com/wp-content/uploads/2020/12/tebak-gambar-level-1-nomor-4.jpg',
    answer: 'ALAS KAKI',
    clue: '_L_S K_K_',
  },
  {
    image: 'https://www.cademedia.com/wp-content/uploads/2020/12/tebak-gambar-level-1-nomor-5.jpg',
    answer: 'POTONGAN HARGA',
    clue: 'P_T_NG_N H_RG_',
  },
  {
    image: 'https://www.cademedia.com/wp-content/uploads/2020/12/tebak-gambar-level-1-nomor-6.jpg',
    answer: 'MINUM JAMU',
    clue: 'M_N_M J_M_',
  },
  {
    image: 'https://www.cademedia.com/wp-content/uploads/2020/12/tebak-gambar-level-1-nomor-7.jpg',
    answer: 'JAMU KUAT',
    clue: 'J_M_ K__T',
  },
  {
    image: 'https://www.cademedia.com/wp-content/uploads/2020/12/tebak-gambar-level-1-nomor-8.jpg',
    answer: 'PISAU TAJAM',
    clue: 'P_S__ T_J_M',
  },
  {
    image: 'https://www.cademedia.com/wp-content/uploads/2020/12/tebak-gambar-level-1-nomor-9.jpg',
    answer: 'OBAT NYAMUK',
    clue: '_B_T NY_M_K',
  },
  {
    image: 'https://www.cademedia.com/wp-content/uploads/2020/12/tebak-gambar-level-1-nomor-10.jpg',
    answer: 'KUCING BELANG',
    clue: 'K_C_NG B_L_NG',
  },
  {
    image: 'https://www.cademedia.com/wp-content/uploads/2020/12/tebak-gambar-level-1-nomor-11.jpg',
    answer: 'TUKANG BUBUR',
    clue: 'T_K_NG B_B_R',
  },
  {
    image: 'https://www.cademedia.com/wp-content/uploads/2020/12/tebak-gambar-level-1-nomor-12.jpg',
    answer: 'KAMBING GULING',
    clue: 'K_MB_NG G_L_NG',
  },
  {
    image: 'https://www.cademedia.com/wp-content/uploads/2020/12/tebak-gambar-level-1-nomor-13.jpg',
    answer: 'KERTAS KOSONG',
    clue: 'K_RT_S K_S_NG',
  },
  {
    image: 'https://www.cademedia.com/wp-content/uploads/2020/12/tebak-gambar-level-1-nomor-14.jpg',
    answer: 'BUNGA MAWAR',
    clue: 'B_NG_ M_W_R',
  },
  {
    image: 'https://www.cademedia.com/wp-content/uploads/2020/12/tebak-gambar-level-1-nomor-15.jpg',
    answer: 'SURAT EDARAN',
    clue: 'S_R_T _D_R_N',
  },
];

export function makeClue(word) {
  return word.replace(/[AEIOUaeiou]/g, '_');
}

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
