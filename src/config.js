import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

const DATA_DIR = path.resolve(process.cwd(), 'data');
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');

const DEFAULT_CONFIG = {
  botName: process.env.BOT_NAME || 'NexBot',
  prefix: process.env.PREFIX || '.',
  adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
  ownerNumber: process.env.OWNER_NUMBER || '',
  features: {
    game: true,
    osint: true,
    ai: true,
    programming: true,
  },
  aiProvider: 'hybrid', // 'hybrid' | 'groq' | 'gemini' | 'free'
  groqApiKey: process.env.GROQ_API_KEY || '',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
};

let activeConfig = { ...DEFAULT_CONFIG };

export function initConfig() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (fs.existsSync(CONFIG_PATH)) {
    try {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      activeConfig = {
        ...DEFAULT_CONFIG,
        ...parsed,
        features: {
          ...DEFAULT_CONFIG.features,
          ...(parsed.features || {}),
        },
      };
    } catch {
      activeConfig = { ...DEFAULT_CONFIG };
      saveConfig();
    }
  } else {
    saveConfig();
  }

  return activeConfig;
}

export function getConfig() {
  return activeConfig;
}

export function updateConfig(updates = {}) {
  activeConfig = {
    ...activeConfig,
    ...updates,
    features: {
      ...activeConfig.features,
      ...(updates.features || {}),
    },
  };
  saveConfig();
  return activeConfig;
}

export function saveConfig() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(activeConfig, null, 2), 'utf-8');
}
