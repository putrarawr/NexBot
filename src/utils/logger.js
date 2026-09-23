import pino from 'pino';
import { EventEmitter } from 'node:events';

class LogEmitter extends EventEmitter {}
export const logEmitter = new LogEmitter();

const MAX_LOGS = 100;
const logHistory = [];

export function getLogHistory() {
  return [...logHistory];
}

export function pushLogEntry(level, message, meta = null) {
  const timestamp = new Date().toISOString();
  const entry = {
    id: Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    timestamp,
    level,
    message: typeof message === 'string' ? message : JSON.stringify(message),
    meta,
  };

  logHistory.push(entry);
  if (logHistory.length > MAX_LOGS) {
    logHistory.shift();
  }

  logEmitter.emit('log', entry);
  return entry;
}

// Pino custom destination stream to capture logs into our buffer & SSE
const memoryStream = {
  write(chunk) {
    try {
      const data = JSON.parse(chunk);
      const levelMap = { 10: 'trace', 20: 'debug', 30: 'info', 40: 'warn', 50: 'error', 60: 'fatal' };
      const level = levelMap[data.level] || 'info';
      const msg = data.msg || '';
      pushLogEntry(level, msg, data);
    } catch {
      // ignore parse error
    }
  },
};

export const pinoLogger = pino(
  {
    level: process.env.LOG_LEVEL || 'info',
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  pino.multistream([
    { stream: process.stdout },
    { stream: memoryStream },
  ])
);

export const logger = {
  info(msg, meta) {
    pinoLogger.info(meta || {}, msg);
    pushLogEntry('info', msg, meta);
  },
  warn(msg, meta) {
    pinoLogger.warn(meta || {}, msg);
    pushLogEntry('warn', msg, meta);
  },
  error(msg, meta) {
    pinoLogger.error(meta || {}, msg);
    pushLogEntry('error', msg, meta);
  },
  debug(msg, meta) {
    pinoLogger.debug(meta || {}, msg);
    pushLogEntry('debug', msg, meta);
  },
  bot(msg, meta) {
    pinoLogger.info(meta || {}, `[BOT] ${msg}`);
    pushLogEntry('bot', msg, meta);
  },
};
