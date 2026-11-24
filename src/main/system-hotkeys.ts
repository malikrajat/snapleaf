import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { release } from 'node:os';
import type { Settings } from '../shared/settings';
import { usesBarePrintScreen } from '../shared/settings';
import { appPaths } from './paths';
import { log } from './logger';

type PrintScreenPreference = 'snipping' | 'classic' | 'unset';

interface TakeoverState {
  /** What Windows was set to before Snapleaf disabled the Snipping Tool binding. */
  original: PrintScreenPreference;
}

export interface SystemHotkeyState {
  supported: boolean;
  /** True when Windows will consume a bare Print Screen press before Snapleaf sees it. */
  systemOwnsPrintScreen: boolean;
  takeover: boolean;
  /** The registry value changed during this sync, so Windows may need a sign-out. */
  changed: boolean;
}

const REGISTRY_PATH = 'HKCU\\Control Panel\\Keyboard';
const REGISTRY_VALUE = 'PrintScreenKeyForSnippingEnabled';
const REGISTRY_ARGS = ['/v', REGISTRY_VALUE];

/**
 * Windows 11 build 22621.1928 and later open Snipping Tool on Print Screen by
 * default, even when the per-user registry value has never been written.
 */
function snippingToolOwnsPrintScreenByDefault(): boolean {
  if (process.platform !== 'win32') return false;
  const [, , build = '0'] = release().split('.');
  return Number.parseInt(build, 10) >= 22621;
}

export function readPrintScreenPreference(): PrintScreenPreference {
  if (process.platform !== 'win32') return 'unset';
  try {
    const output = execFileSync('reg.exe', ['query', REGISTRY_PATH, ...REGISTRY_ARGS], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 3000
    });
    const match = output.match(/PrintScreenKeyForSnippingEnabled\s+REG_DWORD\s+0x([0-9a-f]+)/i);
    if (!match) return 'unset';
    return Number.parseInt(match[1], 16) === 0 ? 'classic' : 'snipping';
  } catch {
    // A missing value (or an unavailable reg.exe) means Windows owns the
    // default behavior; the caller decides what that means for its build.
    return 'unset';
  }
}

function writePrintScreenPreference(preference: PrintScreenPreference): boolean {
  if (process.platform !== 'win32') return false;
  try {
    if (preference === 'unset') {
      execFileSync('reg.exe', ['delete', REGISTRY_PATH, ...REGISTRY_ARGS, '/f'], {
        windowsHide: true,
        timeout: 3000
      });
    } else {
      execFileSync(
        'reg.exe',
        [
          'add',
          REGISTRY_PATH,
          ...REGISTRY_ARGS,
          '/t',
          'REG_DWORD',
          '/d',
          preference === 'snipping' ? '1' : '0',
          '/f'
        ],
        { windowsHide: true, timeout: 3000 }
      );
    }
    return true;
  } catch (error) {
    // Deleting a value that no longer exists is harmless.
    if (preference === 'unset' && readPrintScreenPreference() === 'unset') return true;
    log.warn('Could not update the Windows Print Screen setting', {
      preference,
      error: String(error)
    });
    return false;
  }
}

function readTakeoverState(): TakeoverState | null {
  try {
    const parsed = JSON.parse(readFileSync(appPaths().systemHotkeysFile, 'utf8')) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const original = (parsed as { original?: unknown }).original;
    return original === 'snipping' || original === 'classic' || original === 'unset'
      ? { original }
      : null;
  } catch {
    return null;
  }
}

function writeTakeoverState(state: TakeoverState): void {
  try {
    writeFileSync(appPaths().systemHotkeysFile, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  } catch (error) {
    log.warn('Could not remember the Windows Print Screen setting', { error: String(error) });
  }
}

function clearTakeoverState(): void {
  try {
    rmSync(appPaths().systemHotkeysFile, { force: true });
  } catch (error) {
    log.warn('Could not clear the Print Screen takeover state', { error: String(error) });
  }
}

/**
 * Toggles Windows' Snipping Tool Print Screen binding so Snapleaf can own the
 * bare Print Screen key. HKCU does not require elevation. The change is kept
 * across restarts (Windows may only re-read it at sign-in) and is reversed when
 * the takeover setting is turned off or the shortcut no longer uses PrtSc.
 */
export class SystemHotkeyManager {
  sync(settings: Settings): SystemHotkeyState {
    if (process.platform !== 'win32' || process.env.SNAPLEAF_E2E === '1') {
      return {
        supported: process.platform === 'win32',
        systemOwnsPrintScreen: false,
        takeover: false,
        changed: false
      };
    }

    const takeover = settings.capture.takeOverPrintScreen && usesBarePrintScreen(settings);
    const state = readTakeoverState();
    const current = readPrintScreenPreference();
    let changed = false;

    if (takeover) {
      const windowsOwnsIt =
        current === 'snipping' || (current === 'unset' && snippingToolOwnsPrintScreenByDefault());
      if (windowsOwnsIt) {
        if (!state) writeTakeoverState({ original: current });
        changed = writePrintScreenPreference('classic');
        log.info('Requested the Windows Print Screen key for Snapleaf', {
          previous: current,
          changed
        });
      }
    } else if (state) {
      const restored = writePrintScreenPreference(state.original);
      if (restored) {
        clearTakeoverState();
        log.info('Returned the Windows Print Screen key', { restored: state.original });
      }
    }

    const effective = readPrintScreenPreference();
    const systemOwnsPrintScreen =
      effective === 'snipping' ||
      (effective === 'unset' && snippingToolOwnsPrintScreenByDefault());

    return { supported: true, systemOwnsPrintScreen, takeover, changed };
  }
}
