import { app } from 'electron';
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';

let logFile = '';

function ensureLogFile(): string {
  if (logFile) return logFile;
  const dir = join(app.getPath('userData'), 'logs');
  mkdirSync(dir, { recursive: true });
  logFile = join(dir, 'snapleaf.log');
  return logFile;
}

function rotateIfNeeded(file: string): void {
  try {
    if (existsSync(file) && statSync(file).size > 2 * 1024 * 1024) {
      renameSync(file, `${file}.1`);
    }
  } catch {
    // Logging must never take down the app.
  }
}

function write(level: 'INFO' | 'WARN' | 'ERROR', message: string, meta?: unknown): void {
  const timestamp = new Date().toISOString();
  const detail = meta === undefined ? '' : ` ${safeJson(meta)}`;
  const line = `[${timestamp}] [${level}] ${message}${detail}\n`;
  if (level === 'ERROR') console.error(line.trimEnd());
  else if (level === 'WARN') console.warn(line.trimEnd());
  else console.log(line.trimEnd());
  try {
    const file = ensureLogFile();
    rotateIfNeeded(file);
    appendFileSync(file, line, 'utf8');
  } catch {
    // Ignore filesystem failures in the logger.
  }
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export const log = {
  info: (message: string, meta?: unknown) => write('INFO', message, meta),
  warn: (message: string, meta?: unknown) => write('WARN', message, meta),
  error: (message: string, meta?: unknown) => write('ERROR', message, meta),
  file: () => ensureLogFile()
};
