import { DEFAULT_UPDATE_FEED } from './update';

export type ThemeMode = 'system' | 'light' | 'dark';
export type ImageFormat = 'png' | 'jpeg';
export type ToolId =
  | 'pen'
  | 'line'
  | 'arrow'
  | 'rect'
  | 'ellipse'
  | 'marker'
  | 'text'
  | 'step'
  | 'blur'
  | 'eraser'
  | 'crop';

export interface HotkeyBinding {
  enabled: boolean;
  accelerator: string;
}

export interface LastRegion {
  displayId: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Settings {
  version: number;
  general: {
    theme: ThemeMode;
    language: string;
    launchAtLogin: boolean;
    startMinimized: boolean;
    notifications: boolean;
    singleClickTray: boolean;
  };
  capture: {
    includeCursor: boolean;
    keepSelection: boolean;
    lastRegion: LastRegion | null;
    copyImageAfterCapture: boolean;
    playSound: boolean;
    dimOpacity: number;
    takeOverPrintScreen: boolean;
  };
  editor: {
    defaultTool: ToolId;
    defaultColor: string;
    defaultWidth: number;
    showLabels: boolean;
    fontFamily: string;
  };
  save: {
    directory: string;
    filenamePattern: string;
    format: ImageFormat;
    jpegQuality: number;
    optimizePng: boolean;
    openFolderAfterSave: boolean;
  };
  upload: {
    localServer: boolean;
    port: number;
    publicBaseUrl: string;
    format: ImageFormat;
    jpegQuality: number;
    autoCopyLink: boolean;
    autoCloseWindow: boolean;
  };
  hotkeys: {
    capture: HotkeyBinding;
    fullscreenSave: HotkeyBinding;
    fullscreenUpload: HotkeyBinding;
    quickCopy: HotkeyBinding;
  };
  proxy: {
    mode: 'system' | 'none' | 'manual';
    server: string;
  };
  updates: {
    checkOnLaunch: boolean;
    feedUrl: string;
    skippedVersion: string | null;
    remindAfter: number | null;
  };
}

export const TOOL_IDS: ToolId[] = [
  'pen',
  'line',
  'arrow',
  'rect',
  'ellipse',
  'marker',
  'text',
  'step',
  'blur',
  'eraser',
  'crop'
];

export const COLOR_SWATCHES = [
  '#ff3b30',
  '#ff9500',
  '#ffcc00',
  '#34c759',
  '#00c7be',
  '#32ade6',
  '#007aff',
  '#5856d6',
  '#af52de',
  '#ff2d55',
  '#ffffff',
  '#111111'
];

export const FONT_STACKS = [
  { label: 'System', value: 'system-ui, sans-serif' },
  { label: 'Segoe UI', value: '"Segoe UI", sans-serif' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Consolas', value: 'Consolas, monospace' }
];

export function createDefaultSettings(): Settings {
  return {
    version: 1,
    general: {
      theme: 'system',
      language: 'en',
      launchAtLogin: false,
      startMinimized: false,
      notifications: true,
      singleClickTray: true
    },
    capture: {
      includeCursor: false,
      keepSelection: true,
      lastRegion: null,
      copyImageAfterCapture: false,
      playSound: false,
      dimOpacity: 0.58,
      takeOverPrintScreen: true
    },
    editor: {
      defaultTool: 'pen',
      defaultColor: '#ff3b30',
      defaultWidth: 4,
      showLabels: true,
      fontFamily: 'system-ui, sans-serif'
    },
    save: {
      directory: '',
      filenamePattern: 'Snapleaf_{yyyy}-{MM}-{dd}_{HH}-{mm}-{ss}',
      format: 'png',
      jpegQuality: 90,
      optimizePng: true,
      openFolderAfterSave: false
    },
    upload: {
      localServer: true,
      port: 38473,
      publicBaseUrl: '',
      format: 'png',
      jpegQuality: 90,
      autoCopyLink: true,
      autoCloseWindow: false
    },
    hotkeys: {
      capture: { enabled: true, accelerator: 'PrintScreen' },
      fullscreenSave: { enabled: false, accelerator: 'Alt+Shift+PrintScreen' },
      fullscreenUpload: { enabled: false, accelerator: 'Control+Alt+PrintScreen' },
      quickCopy: { enabled: false, accelerator: 'Alt+Shift+C' }
    },
    proxy: {
      mode: 'system',
      server: ''
    },
    updates: {
      checkOnLaunch: true,
      feedUrl: DEFAULT_UPDATE_FEED,
      skippedVersion: null,
      remindAfter: null
    }
  };
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): UnknownRecord {
  return isRecord(value) ? value : {};
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asString(value: unknown, fallback: string, max = 2048): string {
  return typeof value === 'string' && value.length <= max ? value : fallback;
}

function asNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function asEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function asNullableVersion(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^\d+(?:\.\d+){0,3}(?:[-+][0-9A-Za-z.-]+)?$/.test(trimmed) ? trimmed.slice(0, 80) : null;
}

function asTimestamp(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value > 0 && value < 4102444800000 ? Math.round(value) : null;
}

function asFeedUrl(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 1024) return fallback;
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : fallback;
  } catch {
    return fallback;
  }
}

function asHotkey(value: unknown, fallback: HotkeyBinding): HotkeyBinding {
  const raw = asRecord(value);
  return {
    enabled: asBoolean(raw.enabled, fallback.enabled),
    accelerator: asString(raw.accelerator, fallback.accelerator, 120)
  };
}

function asLastRegion(value: unknown): LastRegion | null {
  if (!isRecord(value)) return null;
  const displayId = asNumber(value.displayId, Number.NaN, -1e9, 1e9);
  const x = asNumber(value.x, Number.NaN, -1e6, 1e6);
  const y = asNumber(value.y, Number.NaN, -1e6, 1e6);
  const width = asNumber(value.width, Number.NaN, 1, 100000);
  const height = asNumber(value.height, Number.NaN, 1, 100000);
  if (![displayId, x, y, width, height].every(Number.isFinite)) return null;
  return { displayId: Math.round(displayId), x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
}

/** Merge unknown persisted JSON into a complete, validated Settings object. */
export function normalizeSettings(input: unknown): Settings {
  const defaults = createDefaultSettings();
  const raw = asRecord(input);
  const general = asRecord(raw.general);
  const capture = asRecord(raw.capture);
  const editor = asRecord(raw.editor);
  const save = asRecord(raw.save);
  const upload = asRecord(raw.upload);
  const hotkeys = asRecord(raw.hotkeys);
  const proxy = asRecord(raw.proxy);
  const updates = asRecord(raw.updates);

  return {
    version: 1,
    general: {
      theme: asEnum(general.theme, ['system', 'light', 'dark'] as const, defaults.general.theme),
      language: asString(general.language, defaults.general.language, 16),
      launchAtLogin: asBoolean(general.launchAtLogin, defaults.general.launchAtLogin),
      startMinimized: asBoolean(general.startMinimized, defaults.general.startMinimized),
      notifications: asBoolean(general.notifications, defaults.general.notifications),
      singleClickTray: asBoolean(general.singleClickTray, defaults.general.singleClickTray)
    },
    capture: {
      includeCursor: asBoolean(capture.includeCursor, defaults.capture.includeCursor),
      keepSelection: asBoolean(capture.keepSelection, defaults.capture.keepSelection),
      lastRegion: asLastRegion(capture.lastRegion),
      copyImageAfterCapture: asBoolean(capture.copyImageAfterCapture, defaults.capture.copyImageAfterCapture),
      playSound: asBoolean(capture.playSound, defaults.capture.playSound),
      dimOpacity: asNumber(capture.dimOpacity, defaults.capture.dimOpacity, 0.15, 0.9),
      takeOverPrintScreen: asBoolean(capture.takeOverPrintScreen, defaults.capture.takeOverPrintScreen)
    },
    editor: {
      defaultTool: asEnum(editor.defaultTool, TOOL_IDS, defaults.editor.defaultTool),
      defaultColor: asString(editor.defaultColor, defaults.editor.defaultColor, 32),
      defaultWidth: asNumber(editor.defaultWidth, defaults.editor.defaultWidth, 1, 40),
      showLabels: asBoolean(editor.showLabels, defaults.editor.showLabels),
      fontFamily: asString(editor.fontFamily, defaults.editor.fontFamily, 120)
    },
    save: {
      directory: asString(save.directory, defaults.save.directory, 1024),
      filenamePattern: asString(save.filenamePattern, defaults.save.filenamePattern, 160),
      format: asEnum(save.format, ['png', 'jpeg'] as const, defaults.save.format),
      jpegQuality: asNumber(save.jpegQuality, defaults.save.jpegQuality, 30, 100),
      optimizePng: asBoolean(save.optimizePng, defaults.save.optimizePng),
      openFolderAfterSave: asBoolean(save.openFolderAfterSave, defaults.save.openFolderAfterSave)
    },
    upload: {
      localServer: asBoolean(upload.localServer, defaults.upload.localServer),
      port: Math.round(asNumber(upload.port, defaults.upload.port, 1024, 65535)),
      publicBaseUrl: asString(upload.publicBaseUrl, defaults.upload.publicBaseUrl, 512),
      format: asEnum(upload.format, ['png', 'jpeg'] as const, defaults.upload.format),
      jpegQuality: asNumber(upload.jpegQuality, defaults.upload.jpegQuality, 30, 100),
      autoCopyLink: asBoolean(upload.autoCopyLink, defaults.upload.autoCopyLink),
      autoCloseWindow: asBoolean(upload.autoCloseWindow, defaults.upload.autoCloseWindow)
    },
    hotkeys: {
      capture: asHotkey(hotkeys.capture, defaults.hotkeys.capture),
      fullscreenSave: asHotkey(hotkeys.fullscreenSave, defaults.hotkeys.fullscreenSave),
      fullscreenUpload: asHotkey(hotkeys.fullscreenUpload, defaults.hotkeys.fullscreenUpload),
      quickCopy: asHotkey(hotkeys.quickCopy, defaults.hotkeys.quickCopy)
    },
    proxy: {
      mode: asEnum(proxy.mode, ['system', 'none', 'manual'] as const, defaults.proxy.mode),
      server: asString(proxy.server, defaults.proxy.server, 512)
    },
    updates: {
      checkOnLaunch: asBoolean(updates.checkOnLaunch, defaults.updates.checkOnLaunch),
      feedUrl: asFeedUrl(updates.feedUrl, defaults.updates.feedUrl),
      skippedVersion: asNullableVersion(updates.skippedVersion),
      remindAfter: asTimestamp(updates.remindAfter)
    }
  };
}

export function hotkeySummary(settings: Settings): string {
  const binding = settings.hotkeys.capture;
  if (!binding.enabled) return 'No capture hotkey';
  return binding.accelerator.replace('CommandOrControl', 'Ctrl').replace('Control', 'Ctrl');
}

/** Electron only receives the bare Print Screen key as `PrintScreen`. */
export function isBarePrintScreen(accelerator: string): boolean {
  return accelerator.trim().replace(/\s+/g, '').toLowerCase() === 'printscreen';
}

/** Windows only reserves the unmodified Print Screen key for Snipping Tool. */
export function usesBarePrintScreen(settings: Settings): boolean {
  return Object.values(settings.hotkeys).some(
    (binding) => binding.enabled && isBarePrintScreen(binding.accelerator)
  );
}
