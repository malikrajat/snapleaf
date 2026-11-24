import { globalShortcut } from 'electron';
import type { HotkeyStatus } from '../shared/types';
import { isBarePrintScreen, type Settings } from '../shared/settings';
import type { SettingsStore } from './settings-store';
import { log } from './logger';

type HotkeyId = keyof Settings['hotkeys'];
type Action = () => void;

export interface HotkeyApplyContext {
  /** The registry still says Windows Snipping Tool owns a bare Print Screen press. */
  systemOwnsPrintScreen?: boolean;
  /** The user asked Snapleaf to take the key over, so the error can explain a restart. */
  printScreenTakeover?: boolean;
}

const LABELS: Record<HotkeyId, string> = {
  capture: 'Capture region',
  fullscreenSave: 'Save full screen',
  fullscreenUpload: 'Upload full screen',
  quickCopy: 'Copy full screen'
};

export class HotkeyManager {
  private statuses: HotkeyStatus[] = [];
  private suspended = false;

  constructor(
    private readonly settings: SettingsStore,
    private readonly actions: Record<HotkeyId, Action>,
    private readonly onChange: (statuses: HotkeyStatus[]) => void
  ) {}

  apply(context: HotkeyApplyContext = {}): HotkeyStatus[] {
    // Settings auto-saves can land while the recorder is listening. Do not
    // take the keys back until the recorder explicitly resumes.
    if (this.suspended) return this.getStatuses();
    globalShortcut.unregisterAll();
    const settings = this.settings.get();
    const used = new Map<string, HotkeyId>();
    const statuses: HotkeyStatus[] = [];

    for (const id of Object.keys(settings.hotkeys) as HotkeyId[]) {
      const binding = settings.hotkeys[id];
      const accel = binding.accelerator.trim();
      if (!binding.enabled) {
        statuses.push({ id, accelerator: accel, enabled: false, registered: false });
        continue;
      }
      if (!accel) {
        statuses.push({ id, accelerator: accel, enabled: true, registered: false, error: 'Choose a shortcut' });
        continue;
      }
      if (isBarePrintScreen(accel) && context.systemOwnsPrintScreen) {
        used.set(accel.toLowerCase(), id);
        statuses.push({
          id,
          accelerator: accel,
          enabled: true,
          registered: false,
          error: context.printScreenTakeover
            ? 'Windows still owns PrintScreen. Sign out or restart once after enabling the takeover.'
            : 'Windows is using PrintScreen for Snipping Tool. Enable “Take over Print Screen” or choose another shortcut.'
        });
        continue;
      }
      const other = used.get(accel.toLowerCase());
      if (other) {
        statuses.push({
          id,
          accelerator: accel,
          enabled: true,
          registered: false,
          error: `Also assigned to ${LABELS[other]}`
        });
        continue;
      }
      try {
        const registered = globalShortcut.register(accel, this.actions[id]);
        if (registered) {
          used.set(accel.toLowerCase(), id);
          statuses.push({ id, accelerator: accel, enabled: true, registered: true });
        } else {
          statuses.push({
            id,
            accelerator: accel,
            enabled: true,
            registered: false,
            error: 'This shortcut is already used by another app'
          });
        }
      } catch (error) {
        statuses.push({ id, accelerator: accel, enabled: true, registered: false, error: String(error) });
      }
    }

    this.statuses = statuses;
    for (const status of statuses) {
      if (status.enabled && !status.registered) {
        log.warn('Hotkey was not registered', status);
      }
    }
    this.onChange(statuses);
    return statuses;
  }

  getStatuses(): HotkeyStatus[] {
    return [...this.statuses];
  }

  /** Temporarily release every global shortcut while the recorder listens. */
  suspend(): void {
    this.suspended = true;
    globalShortcut.unregisterAll();
  }

  resume(context: HotkeyApplyContext = {}): HotkeyStatus[] {
    this.suspended = false;
    return this.apply(context);
  }

  dispose(): void {
    globalShortcut.unregisterAll();
  }
}
