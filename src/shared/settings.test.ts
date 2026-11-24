import { describe, expect, it } from 'vitest';
import {
  createDefaultSettings,
  isBarePrintScreen,
  normalizeSettings,
  usesBarePrintScreen
} from './settings';

describe('normalizeSettings', () => {
  it('fills missing values from defaults', () => {
    const settings = normalizeSettings({});
    expect(settings.general.theme).toBe('system');
    expect(settings.upload.port).toBe(38473);
    expect(settings.hotkeys.capture.accelerator).toBe('PrintScreen');
    expect(settings.capture.takeOverPrintScreen).toBe(true);
  });

  it('preserves an explicit PrintScreen takeover choice', () => {
    expect(normalizeSettings({ capture: { takeOverPrintScreen: false } }).capture.takeOverPrintScreen).toBe(false);
    expect(normalizeSettings({ capture: { takeOverPrintScreen: true } }).capture.takeOverPrintScreen).toBe(true);
    expect(normalizeSettings({ capture: { takeOverPrintScreen: 'yes' } }).capture.takeOverPrintScreen).toBe(true);
  });

  it('detects which shortcuts compete for the bare Print Screen key', () => {
    const settings = createDefaultSettings();
    expect(isBarePrintScreen('PrintScreen')).toBe(true);
    expect(isBarePrintScreen(' print screen ')).toBe(true);
    expect(isBarePrintScreen('Control+PrintScreen')).toBe(false);
    expect(usesBarePrintScreen(settings)).toBe(true);

    settings.hotkeys.capture = { enabled: false, accelerator: 'PrintScreen' };
    expect(usesBarePrintScreen(settings)).toBe(false);

    settings.hotkeys.capture = { enabled: true, accelerator: 'Alt+Shift+PrintScreen' };
    expect(usesBarePrintScreen(settings)).toBe(false);
  });

  it('clamps numeric fields and rejects bad enums', () => {
    const settings = normalizeSettings({
      upload: { port: 999999, format: 'gif', jpegQuality: 200 },
      save: { jpegQuality: -10 },
      general: { theme: 'neon' }
    });
    expect(settings.upload.port).toBe(65535);
    expect(settings.upload.format).toBe('png');
    expect(settings.upload.jpegQuality).toBe(100);
    expect(settings.save.jpegQuality).toBe(30);
    expect(settings.general.theme).toBe('system');
  });

  it('validates the stored selection', () => {
    const valid = normalizeSettings({
      capture: { lastRegion: { displayId: 2, x: 10, y: 20, width: 300, height: 200 } }
    });
    expect(valid.capture.lastRegion).toEqual({ displayId: 2, x: 10, y: 20, width: 300, height: 200 });
    const invalid = normalizeSettings({ capture: { lastRegion: { x: 'nope' } } });
    expect(invalid.capture.lastRegion).toBeNull();
  });

  it('returns a fresh default object', () => {
    const a = createDefaultSettings();
    const b = createDefaultSettings();
    a.general.theme = 'dark';
    expect(b.general.theme).toBe('system');
  });
});
