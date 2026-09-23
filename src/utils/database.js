import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'database.json');

const DEFAULT_DB = {
  users: {},
  stats: {
    totalCommands: 0,
    byCategory: {
      game: 0,
      osint: 0,
      ai: 0,
      programming: 0,
      general: 0,
    },
  },
};

let db = { ...DEFAULT_DB };

export function initDatabase() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (fs.existsSync(DB_PATH)) {
    try {
      const raw = fs.readFileSync(DB_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      db = {
        ...DEFAULT_DB,
        ...parsed,
        stats: {
          ...DEFAULT_DB.stats,
          ...(parsed.stats || {}),
          byCategory: {
            ...DEFAULT_DB.stats.byCategory,
            ...((parsed.stats && parsed.stats.byCategory) || {}),
          },
        },
      };
    } catch {
      db = { ...DEFAULT_DB };
      saveDatabase();
    }
  } else {
    saveDatabase();
  }

  return db;
}

export function saveDatabase() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
}

export function getUser(jid, pushName = null) {
  if (!db.users[jid]) {
    db.users[jid] = {
      jid,
      name: pushName || 'User',
      score: 0,
      gamesWon: 0,
      lastActive: new Date().toISOString(),
    };
    saveDatabase();
  } else if (pushName && pushName !== 'User' && db.users[jid].name !== pushName) {
    db.users[jid].name = pushName;
    saveDatabase();
  }
  return db.users[jid];
}

export function addScore(jid, points, pushName = 'User') {
  const user = getUser(jid, pushName);
  user.score = (user.score || 0) + points;
  if (points > 0) {
    user.gamesWon = (user.gamesWon || 0) + 1;
  }
  user.lastActive = new Date().toISOString();
  saveDatabase();
  return user.score;
}

export function getLeaderboard(limit = 10) {
  const list = Object.values(db.users)
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, limit);
  return list;
}

export function incrementCommandStat(category = 'general') {
  db.stats.totalCommands = (db.stats.totalCommands || 0) + 1;
  if (!db.stats.byCategory[category]) {
    db.stats.byCategory[category] = 0;
  }
  db.stats.byCategory[category] += 1;
  // throttled save or save on change
  saveDatabase();
}

export function getStats() {
  return {
    ...db.stats,
    totalUsers: Object.keys(db.users).length,
  };
}

// In-memory active game sessions (ephemeral per chat JID)
export const activeGames = new Map();
// activeGames.set(jid, { type: 'tebakgambar' | 'math' | 'tictactoe' | ..., answer: '...', timeoutId: ... })
