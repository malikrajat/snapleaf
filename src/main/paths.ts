import { app } from 'electron';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

let cached: {
  userData: string;
  captures: string;
  uploads: string;
  logs: string;
  settingsFile: string;
  libraryFile: string;
  systemHotkeysFile: string;
  defaultSaveDir: string;
} | null = null;

export function appPaths() {
  if (cached) return cached;
  const userData = app.getPath('userData');
  const captures = join(userData, 'captures');
  const uploads = join(userData, 'uploads');
  const logs = join(userData, 'logs');
  for (const dir of [userData, captures, uploads, logs]) mkdirSync(dir, { recursive: true });
  cached = {
    userData,
    captures,
    uploads,
    logs,
    settingsFile: join(userData, 'settings.json'),
    libraryFile: join(userData, 'library.json'),
    systemHotkeysFile: join(userData, 'system-hotkeys.json'),
    defaultSaveDir: join(app.getPath('pictures'), 'Snapleaf')
  };
  return cached;
}
