import assert from 'node:assert/strict';
import http from 'node:http';
import { initConfig, getConfig, updateConfig } from '../src/config.js';
import { initDatabase, addScore, getLeaderboard, getStats, getUser } from '../src/utils/database.js';
import { commands, registerCommand } from '../src/bot/handler.js';
import { createWebServer } from '../src/web/server.js';
import { TicTacToeSession } from '../src/modules/game/tictactoe.js';
import { tebakGambarList, tebakKataList, asahOtakList, generateMathProblem } from '../src/modules/game/questions.js';
import { executeCode } from '../src/modules/programming/index.js';
import { askAI } from '../src/modules/ai/index.js';
import { registerGameCommands } from '../src/modules/game/index.js';
import { registerOsintCommands } from '../src/modules/osint/index.js';
import { registerAiCommands } from '../src/modules/ai/index.js';
import { registerProgrammingCommands } from '../src/modules/programming/index.js';

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

    const expectedCommands = [
      'ping', 'menu',
      'tebakgambar', 'tebakkata', 'asahotak', 'math', 'tictactoe', 'leaderboard', 'score',
      'ip', 'whois', 'dns', 'github', 'subdomain', 'headers',
      'ai', 'explain', 'summarize', 'translate',
      'run', 'regex', 'json', 'cheat',
    ];

    for (const cmd of expectedCommands) {
      assert.ok(commands.has(cmd), `Command ${cmd} should be registered`);
    }
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
    const res = await executeCode('python', 'print("SMOKE_TEST_OK_" + str(7 * 7))');
    assert.ok(res.isSuccess);
    assert.ok(res.stdout.includes('SMOKE_TEST_OK_49'));
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
