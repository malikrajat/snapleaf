import { EventEmitter } from 'node:events';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { normalizeSettings, type Settings } from '../shared/settings';
import { appPaths } from './paths';
import { log } from './logger';

export class SettingsStore extends EventEmitter {
  private settings: Settings;

  constructor() {
    super();
    this.settings = this.load();
  }

  private load(): Settings {
    const file = appPaths().settingsFile;
    let raw: unknown = null;
    try {
      raw = JSON.parse(readFileSync(file, 'utf8'));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') log.warn('Could not read settings; using defaults', { error: String(error) });
    }
    const settings = normalizeSettings(raw);
    if (!settings.save.directory) settings.save.directory = appPaths().defaultSaveDir;
    if (raw === null) this.persist(settings);
    return settings;
  }

  get(): Settings {
    return structuredClone(this.settings);
  }

  update(raw: unknown): Settings {
    const next = normalizeSettings(raw);
    if (!next.save.directory) next.save.directory = appPaths().defaultSaveDir;
    this.settings = next;
    this.persist(next);
    this.emit('changed', this.get());
    return this.get();
  }

  reset(): Settings {
    const next = normalizeSettings(null);
    next.save.directory = appPaths().defaultSaveDir;
    this.settings = next;
    this.persist(next);
    this.emit('changed', this.get());
    return this.get();
  }

  private persist(settings: Settings): void {
    const file = appPaths().settingsFile;
    const temporary = `${file}.tmp`;
    try {
      writeFileSync(temporary, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
      renameSync(temporary, file);
    } catch (error) {
      log.error('Could not persist settings', { error: String(error) });
    }
  }
}
