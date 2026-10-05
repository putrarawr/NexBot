import assert from 'node:assert/strict';
import http from 'node:http';
import { initConfig, getConfig, updateConfig } from '../src/config.js';
import { initDatabase, addScore, getLeaderboard, getStats, getUser, activeGames } from '../src/utils/database.js';
import { commands, registerCommand, messageHandler } from '../src/bot/handler.js';
import { findSuggestions, levenshteinDistance } from '../src/bot/autocomplete.js';
import { createWebServer } from '../src/web/server.js';
import { TicTacToeSession } from '../src/modules/game/tictactoe.js';
import { tebakGambarList, tebakKataList, asahOtakList, generateMathProblem } from '../src/modules/game/questions.js';
import { executeCode } from '../src/modules/programming/index.js';
import { askAI } from '../src/modules/ai/index.js';
import { registerGameCommands } from '../src/modules/game/index.js';
import { registerOsintCommands } from '../src/modules/osint/index.js';
import { registerAiCommands } from '../src/modules/ai/index.js';
import { registerProgrammingCommands } from '../src/modules/programming/index.js';
import { registerMediaCommands } from '../src/modules/media/index.js';
import { registerDownloaderCommands } from '../src/modules/downloader/index.js';
import { registerGroupCommands, setAfk, getAfk, removeAfk } from '../src/modules/group/index.js';
import { imageToWebpSticker, stickerToPng, generateQuoteSticker } from '../src/modules/media/converter.js';
import { execSync } from 'node:child_process';
import { render8BitBar, create8BitProgressTracker } from '../src/utils/progress.js';
import { formatTelegramHtml, createTelegramSocketAdapter, handleTelegramMessage, handleTelegramCallback, buildTelegramMainMenu, getTelegramBotState } from '../src/bot/telegram.js';
import { registerTelegramExclusiveCommands } from '../src/modules/telegram/index.js';
import { isCommandSupported } from '../src/bot/handler.js';
import { registerUtilityTools } from '../src/modules/tools/index.js';
import { createTicTacToeSession, renderTicTacToeBoard, checkTicTacToeWinner, makeBotMove, playRpsRound } from '../src/modules/game/visual-games.js';
let passedTests = 0;
let failedTests = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error('     Error:', err.message);
    failedTests++;
  }
}

async function runAllTests() {
  console.log('='.repeat(55));
  console.log('🧪 RUNNING COMPREHENSIVE SMOKE & INTEGRATION TESTS');
  console.log('='.repeat(55));

  // 1. Config Tests
  console.log('\n📦 1. Configuration & Environment:');
  await test('initConfig initializes default values', () => {
    const cfg = initConfig();
    assert.ok(cfg.botName);
    assert.ok(cfg.prefix);
    assert.ok(cfg.adminPassword);
    assert.equal(typeof cfg.features, 'object');
  });

  await test('updateConfig updates and preserves properties', () => {
    updateConfig({ botName: 'TestBot99' });
    const cfg = getConfig();
    assert.equal(cfg.botName, 'TestBot99');
    updateConfig({ botName: 'NexBot' }); // reset
  });

  // 2. Database Tests
  console.log('\n🗄️ 2. Database & User Stats:');
  await test('initDatabase and user scoring', () => {
    initDatabase();
    const testJid = 'test_user_123@s.whatsapp.net';
    const score = addScore(testJid, 100, 'TestPlayer');
    assert.ok(score >= 100);

    const u = getUser(testJid);
    assert.equal(u.name, 'TestPlayer');

    const leaderboard = getLeaderboard(5);
    assert.ok(Array.isArray(leaderboard));
    assert.ok(leaderboard.some((x) => x.name === 'TestPlayer'));
  });

  // 3. Game Module Tests
  console.log('\n🎮 3. Game & Interactive Logic:');
  await test('Question banks have valid structures', () => {
    assert.ok(tebakGambarList.length > 0);
    assert.ok(tebakGambarList[0].image && tebakGambarList[0].answer);
    assert.ok(tebakKataList.length > 0);
    assert.ok(asahOtakList.length > 0);

    const math = generateMathProblem();
    assert.ok(math.question && math.answer);
  });

  await test('Tebak Gambar image URLs are active and reachable (HTTP 200)', async () => {
    assert.ok(tebakGambarList.length >= 10);
    const testItems = tebakGambarList.slice(0, 3);
    for (const item of testItems) {
      const res = await fetch(item.image, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      assert.equal(res.status, 200, `Image ${item.image} should return HTTP 200`);
    }
  });

  await test('TicTacToe game engine plays and calculates winner', () => {
    const ttt = new TicTacToeSession({
      playerX: 'p1@s.whatsapp.net',
      playerXName: 'Alice',
      playerO: 'p2@s.whatsapp.net',
      playerOName: 'Bob',
      isVsBot: false,
    });

    // Move sequence: X(1), O(4), X(2), O(5), X(3) -> X wins row 1
    ttt.makeMove('1', 'p1@s.whatsapp.net');
    ttt.makeMove('4', 'p2@s.whatsapp.net');
    ttt.makeMove('2', 'p1@s.whatsapp.net');
    ttt.makeMove('5', 'p2@s.whatsapp.net');
    const winMove = ttt.makeMove('3', 'p1@s.whatsapp.net');

    assert.ok(winMove.ended);
    assert.equal(winMove.winner, 'X');
    assert.equal(ttt.status, 'ended');
  });

  // 4. Command Registry Tests
  console.log('\n📋 4. Command Registration & Dispatcher:');
  await test('All command modules register successfully', () => {
    registerGameCommands();
    registerOsintCommands();
    registerAiCommands();
    registerProgrammingCommands();
    registerMediaCommands();
    registerDownloaderCommands();
    registerGroupCommands();
    registerUtilityTools();

    const expectedCommands = [
      'ping', 'clear', 'menu',
      'tebakgambar', 'tebakkata', 'asahotak', 'math', 'tictactoe', 'leaderboard', 'score',
      'ip', 'whois', 'dns', 'github', 'subdomain', 'headers',
      'ai', 'explain', 'summarize', 'translate',
      'run', 'regex', 'json', 'cheat',
      'sticker', 'toimg', 'qc', 'photolive',
      'tiktok', 'instagram', 'youtube', 'ytmp3', 'spotify', 'twitter', 'facebook', 'pinterest', 'down',
      'gempa', 'cuaca', 'sholat', 'wiki', 'short', 'unshort', 'calc',
      'hidetag', 'afk',
    ];

    for (const cmd of expectedCommands) {
      assert.ok(commands.has(cmd), `Command ${cmd} should be registered`);
    }
  });

  // 4b. Autocomplete & Self-Chat Mode Tests
  console.log('\n🔍 4b. Autocomplete & Self-Chat Mode:');
  await test('Levenshtein distance detects typos accurately', () => {
    assert.equal(levenshteinDistance('githb', 'github'), 1);
    assert.equal(levenshteinDistance('menu', 'menu'), 0);
  });

  await test('findSuggestions finds prefix and fuzzy matches', () => {
    const tebakMatches = findSuggestions('tebak', commands);
    assert.ok(tebakMatches.length >= 2);
    assert.ok(tebakMatches.some((c) => c.name === 'tebakgambar'));
    assert.ok(tebakMatches.some((c) => c.name === 'tebakkata'));

    const typoMatches = findSuggestions('githb', commands);
    assert.ok(typoMatches.some((c) => c.name === 'github'));
  });

  await test('Self-Chat Mode processes commands with fromMe: true', async () => {
    let replyCount = 0;
    let lastReply = '';
    const fakeSock = {
      sendPresenceUpdate: async () => {},
      sendMessage: async (jid, content) => {
        replyCount++;
        lastReply = content.text;
      },
    };

    // Case 1: fromMe: true with prefix -> MUST execute
    await messageHandler(fakeSock, {
      messages: [
        {
          key: { fromMe: true, remoteJid: '628999999999@s.whatsapp.net' },
          message: { conversation: '.ping' },
        },
      ],
      type: 'notify',
    });
    assert.ok(replyCount >= 1, 'Self-chat command should be processed');
    assert.ok(lastReply.includes('Pong') || lastReply.includes('Kecepatan'));

    // Case 2: fromMe: true without prefix -> MUST NOT execute
    replyCount = 0;
    await messageHandler(fakeSock, {
      messages: [
        {
          key: { fromMe: true, remoteJid: '628999999999@s.whatsapp.net' },
          message: { conversation: 'Halo lagi ngapain?' },
        },
      ],
      type: 'notify',
    });
    assert.equal(replyCount, 0, 'Self-chat ordinary message should be ignored');

    // Case 3: fromMe: true answering active game (WITHOUT prefix) -> MUST answer and win!
    activeGames.set('628999999999@s.whatsapp.net', {
      type: 'tebakgambar',
      answer: 'TANTANGAN SERU',
      reward: 50,
      timer: setTimeout(() => {}, 10000),
    });

    replyCount = 0;
    await messageHandler(fakeSock, {
      messages: [
        {
          key: { id: 'user_phone_msg_1', fromMe: true, remoteJid: '628999999999@s.whatsapp.net' },
          message: { conversation: 'tantangan seru' }, // Jawaban tanpa titik!
        },
      ],
      type: 'notify',
    });
    assert.ok(replyCount >= 1, 'Self-chat answering active game without prefix should win');
    assert.ok(lastReply.includes('BENAR SEKALI'), 'Should announce correct answer');

    // Case 4: Slash prefix '/ping' -> MUST execute
    replyCount = 0;
    await messageHandler(fakeSock, {
      messages: [
        {
          key: { id: 'user_slash_1', fromMe: false, remoteJid: '628777777777@s.whatsapp.net' },
          message: { conversation: '/ping' },
        },
      ],
      type: 'notify',
    });
    assert.ok(replyCount >= 1, 'Slash command /ping should be executed');
    assert.ok(lastReply.includes('Pong') || lastReply.includes('Kecepatan'));

    // Case 5: Slash prefix only '/' -> MUST return search helper
    replyCount = 0;
    await messageHandler(fakeSock, {
      messages: [
        {
          key: { id: 'user_slash_helper', fromMe: false, remoteJid: '628666666666@s.whatsapp.net' },
          message: { conversation: '/' },
        },
      ],
      type: 'notify',
    });
    assert.ok(replyCount >= 1, 'Slash only / should return helper');
    assert.ok(lastReply.includes('PENCARIAN PERINTAH CEPAT'));
  });

  // 4c. Media & Sticker Tools Tests
  console.log('\n🎨 4c. Media, Sticker & PhotoLive Tools:');
  await test('imageToWebpSticker and stickerToPng convert accurately', async () => {
    const dummyJpg = execSync('ffmpeg -y -f lavfi -i color=c=red:s=100x100:d=1 -vframes 1 -f image2 -');
    const webpBuffer = await imageToWebpSticker(dummyJpg);
    assert.ok(webpBuffer.length > 50, 'WebP buffer should be valid');
    assert.equal(webpBuffer.subarray(0, 4).toString(), 'RIFF');
    assert.equal(webpBuffer.subarray(8, 12).toString(), 'WEBP');

    const pngBuffer = await stickerToPng(webpBuffer);
    assert.ok(pngBuffer.length > 50, 'PNG buffer should be valid');
    assert.equal(pngBuffer.subarray(1, 4).toString(), 'PNG');
  });

  await test('generateQuoteSticker renders aesthetic quote card', async () => {
    const qcWebp = await generateQuoteSticker('Putra', 'Kata-kata mutiara hari ini', '628123456');
    assert.ok(qcWebp.length > 100);
    assert.equal(qcWebp.subarray(8, 12).toString(), 'WEBP');
  });

  // 4d. Group Utility & AFK Tests
  console.log('\n👥 4d. Group Management & AFK Tracking:');
  await test('AFK store tracks, checks, and removes status correctly', () => {
    const userJid = 'user_afk_test@s.whatsapp.net';
    setAfk(userJid, 'Sedang makan siang', 'Putra');
    const afk = getAfk(userJid);
    assert.ok(afk);
    assert.equal(afk.reason, 'Sedang makan siang');
    assert.equal(afk.name, 'Putra');

    removeAfk(userJid);
    assert.equal(getAfk(userJid), undefined);
  });

  // 4e. Telegram Bot Engine & Adapter
  console.log('\n🤖 4e. Telegram Bot Engine & Multi-Platform Adapter:');
  await test('formatTelegramHtml converts WhatsApp markdown and escapes HTML safely', () => {
    const sample = 'Halo *Admin*! Cek `code` & _italic_ ~coret~ ```block code``` <script>';
    const formatted = formatTelegramHtml(sample);
    assert.ok(formatted.includes('<b>Admin</b>'), 'Should format bold');
    assert.ok(formatted.includes('<code>code</code>'), 'Should format inline code');
    assert.ok(formatted.includes('<i>italic</i>'), 'Should format italic');
    assert.ok(formatted.includes('<s>coret</s>'), 'Should format strikethrough');
    assert.ok(formatted.includes('<pre><code>block code</code></pre>'), 'Should format pre/code block');
    assert.ok(formatted.includes('&lt;script&gt;'), 'Should escape HTML tags');
  });

  await test('createTelegramSocketAdapter routes messages to Telegram bot API', async () => {
    const sentMessages = [];
    const mockBot = {
      api: {
        sendMessage: async (destId, text, opts) => {
          sentMessages.push({ type: 'text', destId, text, opts });
          return { message_id: 101 };
        },
        sendPhoto: async (destId, photo, opts) => {
          sentMessages.push({ type: 'photo', destId, photo, opts });
          return { message_id: 102 };
        },
        sendVideo: async (destId, video, opts) => {
          sentMessages.push({ type: 'video', destId, video, opts });
          return { message_id: 103 };
        },
        sendSticker: async (destId, sticker) => {
          sentMessages.push({ type: 'sticker', destId, sticker });
          return { message_id: 104 };
        },
        sendChatAction: async (destId, action) => {
          sentMessages.push({ type: 'action', destId, action });
        },
      },
    };

    const adapter = createTelegramSocketAdapter(mockBot, null, '123456');
    await adapter.sendMessage('123456', { text: '*Halo* Dunia' });
    assert.equal(sentMessages.length, 1);
    assert.equal(sentMessages[0].type, 'text');
    assert.ok(sentMessages[0].text.includes('<b>Halo</b>'));

    await adapter.sendMessage('123456', { image: Buffer.from('fake_image'), caption: '*Foto*' });
    assert.equal(sentMessages.length, 2);
    assert.equal(sentMessages[1].type, 'photo');
    assert.ok(sentMessages[1].opts.caption.includes('<b>Foto</b>'));

    await adapter.sendMessage('123456', { video: Buffer.from('fake_video'), caption: 'Video' });
    assert.equal(sentMessages.length, 3);
    assert.equal(sentMessages[2].type, 'video');

    await adapter.sendMessage('123456', { sticker: Buffer.from('fake_sticker') });
    assert.equal(sentMessages.length, 4);
    assert.equal(sentMessages[3].type, 'sticker');
  });

  await test('handleTelegramMessage executes /ping on Telegram context', async () => {
    const replies = [];
    const mockBot = {
      api: {
        sendMessage: async (chatId, text) => replies.push({ chatId, text }),
        sendChatAction: async () => {},
      },
    };

    const mockCtx = {
      chat: { id: 987654, type: 'private' },
      from: { id: 112233, first_name: 'Budi', username: 'budi_dev' },
      message: { message_id: 55, text: '/ping' },
      reply: async (text) => {
        replies.push({ chatId: 987654, text });
      },
    };

    await handleTelegramMessage(mockBot, mockCtx);
    assert.ok(replies.length >= 2, 'Should receive Pong and latency replies');
    assert.ok(replies[0].text.includes('Pong!'));
  });

  await test('Telegram exclusive commands are registered and platform separation is enforced', async () => {
    registerTelegramExclusiveCommands();
    const diceCmd = commands.get('dice');
    const hidetagCmd = commands.get('hidetag');

    assert.ok(diceCmd, 'dice command should be registered');
    assert.equal(isCommandSupported(diceCmd, 'telegram'), true, 'dice supported on telegram');
    assert.equal(isCommandSupported(diceCmd, 'whatsapp'), false, 'dice NOT supported on whatsapp');

    assert.ok(hidetagCmd, 'hidetag command should be registered');
    assert.equal(isCommandSupported(hidetagCmd, 'whatsapp'), true, 'hidetag supported on whatsapp');
    assert.equal(isCommandSupported(hidetagCmd, 'telegram'), false, 'hidetag NOT supported on telegram');
  });

  await test('buildTelegramMainMenu generates interactive InlineKeyboard buttons', () => {
    const menu = buildTelegramMainMenu('Putra');
    assert.ok(menu.text.toLowerCase().includes('putra'), 'Menu should greet user');
    assert.ok(menu.keyboard, 'Menu should have inline keyboard');
    const json = JSON.stringify(menu.keyboard);
    assert.ok(json.includes('menu_cat:game'), 'Keyboard should have game category button');
    assert.ok(json.includes('menu_cat:ai'), 'Keyboard should have AI category button');
    assert.ok(json.includes('dice_picker'), 'Keyboard should have dice picker button');
  });

  await test('handleTelegramCallback handles menu navigation and dice games', async () => {
    const sentTexts = [];
    const mockCtx = {
      callbackQuery: { data: 'menu_cat:game' },
      from: { id: 112233, first_name: 'Putra', username: 'putra_dev' },
      answerCallbackQuery: async () => {},
      editMessageText: async (text, opts) => {
        sentTexts.push({ type: 'edit', text, opts });
      },
      reply: async (text, opts) => {
        sentTexts.push({ type: 'reply', text, opts });
      },
      replyWithDice: async (emoji) => {
        return { dice: { value: 6 } };
      },
    };

    await handleTelegramCallback(null, mockCtx);
    assert.equal(sentTexts.length, 1);
    assert.ok(sentTexts[0].text.includes('GAME & KUIS'), 'Should display game category text');

    // Test interactive dice roll
    mockCtx.callbackQuery.data = 'dice_roll:dice';
    await handleTelegramCallback(null, mockCtx);
    assert.equal(sentTexts.length, 2);
    assert.ok(sentTexts[1].text.includes('ANGKA MAKSIMAL 6'), 'Should calculate score for dice roll 6');
  });

  await test('render8BitBar and create8BitProgressTracker format 8-bit retro bar correctly', async () => {
    const bar = render8BitBar(50, 'FETCHING', 'MEDIA');
    assert.ok(bar.includes('50%'), 'Bar should contain 50%');
    assert.ok(bar.includes('▓▓▓▓▓▓'), 'Bar should contain 6 filled blocks for 50%');
    assert.ok(bar.includes('░░░░░░'), 'Bar should contain 6 empty blocks');
    assert.ok(bar.includes('STATUS: <code>[FETCHING]</code>'));

    let testOutput = '';
    const tracker = await create8BitProgressTracker({
      reply: async (text) => {
        testOutput = text;
      },
      title: 'SPOTIFY',
    });

    assert.ok(testOutput.includes('15%') || testOutput.includes('STARTING'), 'Should start initial progress');
    await tracker.finish('MUSIC READY');
  });

  // 4f. Visual Button-Based Games & Interactive Engine
  console.log('\n🎮 4f. Visual Button Games (Tic-Tac-Toe 3x3 & RPS):');
  await test('Visual Tic-Tac-Toe creates session, renders 3x3 grid, and checks winner', () => {
    const session = createTicTacToeSession('chat_101', { id: 'user_1', name: 'Putra' });
    assert.ok(session.id.startsWith('ttt_'));
    assert.equal(session.board.length, 9);

    const render = renderTicTacToeBoard(session);
    assert.ok(render.text.includes('TIC-TAC-TOE 3x3'));
    assert.equal(render.keyboard.inline_keyboard.length, 4, 'Should have 3x3 rows + 1 surrender row');

    // Test win checking
    const winningBoard = ['X', 'X', 'X', 'O', 'O', '', '', '', ''];
    assert.equal(checkTicTacToeWinner(winningBoard), 'X');

    const drawBoard = ['X', 'O', 'X', 'X', 'O', 'O', 'O', 'X', 'X'];
    assert.equal(checkTicTacToeWinner(drawBoard), 'draw');

    // Test bot AI move
    const botMove = makeBotMove(['X', 'X', '', 'O', '', '', '', '', '']);
    assert.equal(botMove, 2, 'Bot should block X at index 2');
  });

  await test('Visual Batu Gunting Kertas computes round outcome and scores', () => {
    const winRound = playRpsRound('batu', 'Putra', '112233');
    assert.ok(winRound.text.includes('BATU GUNTING KERTAS'));
    assert.ok(winRound.keyboard.inline_keyboard.length > 0);
  });
  // 5. Web Server & REST API Tests
  console.log('\n🌐 5. Web Server REST API & Endpoints:');
  const app = createWebServer();
  const TEST_PORT = 3888;
  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(TEST_PORT, '127.0.0.1', resolve));

  try {
    await test('GET /health returns 200 OK', async () => {
      const res = await fetch(`http://127.0.0.1:${TEST_PORT}/health`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.status, 'ok');
      assert.ok(typeof data.memoryMb === 'number');
    });

    await test('POST /api/auth/login validates credentials', async () => {
      const badRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'wrong_password_xyz' }),
      });
      assert.equal(badRes.status, 401);

      const cfg = getConfig();
      const goodRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: cfg.adminPassword }),
      });
      assert.equal(goodRes.status, 200);
      const goodData = await goodRes.json();
      assert.ok(goodData.token);
    });

    await test('GET /api/status returns telemetry and bot state', async () => {
      const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/status`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.ok(data.system.memoryRssMb < 250, 'RAM should be low (< 250 MB)');
      assert.ok(data.config);
      assert.ok(data.bot);
      assert.ok(data.telegram);
      assert.ok(typeof data.telegram.status === 'string');
      assert.ok(data.stats);
    });

    await test('GET /api/leaderboard returns ranked list', async () => {
      const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/leaderboard`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.ok(Array.isArray(data));
    });

    await test('GET / serves frontend index.html', async () => {
      const res = await fetch(`http://127.0.0.1:${TEST_PORT}/`);
      assert.equal(res.status, 200);
      const text = await res.text();
      assert.ok(text.includes('NexBot'), 'HTML should include NexBot');
      assert.ok(text.includes('Pairing Code'), 'HTML should include Pairing Code');
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  // 6. External Sandbox & AI Integration Test
  console.log('\n⚙️ 6. Code Execution & AI Integration:');
  await test('Code runner executes Python code in sandbox', async () => {
    try {
      const res = await executeCode('python', 'print("SMOKE_TEST_OK_" + str(7 * 7))');
      assert.ok(res.isSuccess);
      assert.ok(res.stdout.includes('SMOKE_TEST_OK_49'));
    } catch (err) {
      assert.ok(err.message.includes('Wandbox') || err.message.includes('timeout') || err.message.includes('aborted'));
    }
  });

  await test('Hybrid AI fallback returns valid answer', async () => {
    const answer = await askAI('1 + 1 berapa? Jawab hanya angka.');
    assert.ok(typeof answer === 'string' && answer.length > 0);
  });

  // Summary
  console.log('\n' + '='.repeat(55));
  console.log(`📊 TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('='.repeat(55));

  if (failedTests > 0) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('Test Runner Failed:', err);
  process.exit(1);
});
