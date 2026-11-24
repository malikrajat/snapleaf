import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  nativeImage,
  Notification,
  shell
} from 'electron';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Settings } from '../shared/settings';
import { printImage } from './print';
import type {
  AppInfo,
  CaptureAction,
  HotkeyStatus,
  OverlayConfirm,
  SaveRequest,
  UploadRequest
} from '../shared/types';
import { IPC } from '../shared/types';
import type { SettingsStore } from './settings-store';
import type { WindowManager } from './windows';
import type { CaptureService } from './capture';
import type { Library } from './library';
import type { UploadServer } from './upload-server';
import type { UpdateService } from './updates';
import { appPaths } from './paths';
import { log } from './logger';

interface IpcDependencies {
  windows: WindowManager;
  settings: SettingsStore;
  capture: CaptureService;
  library: Library;
  uploadServer: UploadServer;
  updates: UpdateService;
  iconPath: string;
  applySettings: (next: Settings, previous: Settings) => Promise<HotkeyStatus[]>;
  getHotkeyStatuses: () => HotkeyStatus[];
  suspendHotkeys: () => void;
  resumeHotkeys: () => HotkeyStatus[];
  broadcast: (channel: string, payload: unknown) => void;
}

function handle(channel: string, fn: (...args: any[]) => unknown): void {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await fn(event, ...args);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`IPC ${channel} failed`, { message, args: summarizeArgs(args) });
      throw new Error(message);
    }
  });
}

function summarizeArgs(args: unknown[]): unknown {
  return args.map((arg) => {
    if (typeof arg === 'string') return arg.length > 200 ? `${arg.slice(0, 60)}…(${arg.length})` : arg;
    if (arg && typeof arg === 'object') {
      const record = arg as Record<string, unknown>;
      if (typeof record.dataUrl === 'string') {
        return { ...record, dataUrl: `[${record.dataUrl.slice(0, 30)}… ${record.dataUrl.length} chars]` };
      }
    }
    return arg;
  });
}

function validateDataUrl(value: unknown): string {
  if (typeof value !== 'string' || !/^data:image\/(?:png|jpeg);base64,/.test(value)) {
    throw new Error('Invalid image payload');
  }
  return value;
}

function validateId(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{4,80}$/.test(value)) throw new Error('Invalid id');
  return value;
}

export function registerIpc(deps: IpcDependencies): void {
  const { windows, settings, capture, library, uploadServer, updates, iconPath } = deps;

  handle(IPC.appInfo, (): AppInfo => ({
    name: 'Snapleaf',
    version: app.getVersion(),
    electron: process.versions.electron,
    platform: process.platform,
    userData: appPaths().userData,
    capturesDir: appPaths().captures,
    uploadsDir: appPaths().uploads,
    logsDir: appPaths().logs,
    upload: uploadServer.getInfo()
  }));
  handle(IPC.appQuit, () => app.quit());
  handle(IPC.appMinimize, (event) => BrowserWindow.fromWebContents(event.sender)?.minimize());
  handle(IPC.appMaximize, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  handle(IPC.appClose, (event) => BrowserWindow.fromWebContents(event.sender)?.close());
  handle(IPC.appOpenExternal, async (_event, url: unknown) => {
    if (typeof url !== 'string' || !/^(https?|mailto):/i.test(url)) throw new Error('Unsupported link');
    await shell.openExternal(url);
  });
  handle(IPC.appShowItem, (_event, path: unknown) => {
    if (typeof path !== 'string' || !path) throw new Error('Invalid path');
    if (existsSync(path) && !path.endsWith('\\') && !path.endsWith('/')) shell.showItemInFolder(path);
    else void shell.openPath(path);
  });
  handle(IPC.appOpenPath, async (_event, path: unknown) => {
    if (typeof path !== 'string' || !path) throw new Error('Invalid path');
    return shell.openPath(path);
  });
  handle(IPC.appOpenSettings, () => {
    windows.showSettings();
  });
  handle(IPC.appOpenGallery, () => {
    windows.showGallery();
  });
  handle(IPC.appChooseDirectory, async () => {
    const result = await dialog.showOpenDialog({
      title: 'Choose a folder',
      properties: ['openDirectory', 'createDirectory']
    });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });

  handle(IPC.settingsGet, () => settings.get());
  handle(IPC.hotkeyGet, () => deps.getHotkeyStatuses());
  handle(IPC.hotkeySuspend, () => deps.suspendHotkeys());
  handle(IPC.hotkeyResume, () => deps.resumeHotkeys());
  handle(IPC.settingsUpdate, async (_event, raw: unknown) => {
    const previous = settings.get();
    const next = settings.update(raw);
    await deps.applySettings(next, previous);
    deps.broadcast(IPC.settingsChanged, next);
    return next;
  });
  handle(IPC.settingsReset, async () => {
    const previous = settings.get();
    const next = settings.reset();
    await deps.applySettings(next, previous);
    deps.broadcast(IPC.settingsChanged, next);
    return next;
  });

  handle(IPC.captureStartRegion, () => capture.startRegion());
  handle(IPC.captureStartFullscreen, (_event, action: unknown) => {
    if (!['edit', 'copy', 'save', 'upload', 'print'].includes(String(action))) throw new Error('Invalid capture action');
    return capture.startFullscreen(action as CaptureAction);
  });
  handle(IPC.captureOverlayInit, (event) => capture.getOverlayInit(event.sender.id));
  handle(IPC.captureOverlayReady, (event) => capture.markOverlayReady(event.sender.id));
  handle(IPC.captureConfirm, (event, payload: OverlayConfirm) => {
    if (!payload || typeof payload !== 'object') throw new Error('Invalid capture payload');
    validateDataUrl(payload.dataUrl);
    if (!Number.isFinite(payload.displayId)) throw new Error('Invalid display');
    if (!Number.isFinite(payload.width) || !Number.isFinite(payload.height)) throw new Error('Invalid dimensions');
    if (!payload.selection || !Number.isFinite(payload.selection.x) || !Number.isFinite(payload.selection.y)) {
      throw new Error('Invalid selection');
    }
    return capture.confirm(event.sender.id, payload);
  });
  handle(IPC.captureCancel, (event) => capture.cancel(event.sender.id));
  handle(IPC.captureFocus, (event) => capture.focusOverlay(event.sender.id));

  handle(IPC.editorGetCapture, (_event, id: unknown) => library.getCapture(validateId(id)));
  handle(IPC.editorGetImage, (_event, id: unknown) => {
    const record = library.getCapture(validateId(id));
    if (!record) throw new Error('Screenshot not found');
    const image = nativeImage.createFromPath(record.path);
    if (image.isEmpty()) throw new Error('Screenshot could not be decoded');
    return image.toDataURL();
  });
  handle(IPC.editorSave, (_event, request: SaveRequest) => {
    if (!request || typeof request !== 'object') throw new Error('Invalid save request');
    validateDataUrl(request.dataUrl);
    if (request.format !== 'png' && request.format !== 'jpeg') throw new Error('Invalid image format');
    return capture.saveDataUrl(
      request.dataUrl,
      request.format,
      Math.min(100, Math.max(30, Number(request.quality) || 90)),
      request.suggestedName
    );
  });
  handle(IPC.editorCopy, async (_event, dataUrl: unknown) => {
    await capture.copyDataUrl(validateDataUrl(dataUrl), true);
  });
  handle(IPC.editorPrint, async (_event, dataUrl: unknown) => {
    await printImage(validateDataUrl(dataUrl));
  });
  handle(IPC.editorUpload, async (_event, request: UploadRequest) => {
    if (!request || typeof request !== 'object') throw new Error('Invalid upload request');
    const dataUrl = validateDataUrl(request.dataUrl);
    const result = await capture.uploadDataUrl(dataUrl, request.originalName, {
      width: Math.max(1, Number(request.width) || 1),
      height: Math.max(1, Number(request.height) || 1)
    });
    if (result) windows.showUpload(result.record.id);
    return result;
  });
  handle(IPC.editorClose, (event) => BrowserWindow.fromWebContents(event.sender)?.close());

  handle(IPC.libraryList, () => library.list());
  handle(IPC.libraryDeleteCapture, (_event, id: unknown) => library.deleteCapture(validateId(id)));
  handle(IPC.libraryDeleteUpload, (_event, id: unknown) => library.deleteUpload(validateId(id)));
  handle(IPC.libraryOpenCapture, (_event, id: unknown) => {
    const record = library.getCapture(validateId(id));
    if (!record) throw new Error('Screenshot not found');
    windows.showEditor(record.id);
  });
  handle(IPC.libraryImportImage, async () => {
    const result = await dialog.showOpenDialog({
      title: 'Open an image',
      properties: ['openFile'],
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'] },
        { name: 'All files', extensions: ['*'] }
      ]
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const record = library.importImage(result.filePaths[0]);
    windows.showEditor(record.id);
    return record;
  });
  handle(IPC.libraryOpenCaptures, () => shell.openPath(appPaths().captures));
  handle(IPC.libraryOpenUploads, () => shell.openPath(appPaths().uploads));

  handle(IPC.uploadGet, (_event, id: unknown) => library.getUpload(validateId(id)));
  handle(IPC.uploadServerInfo, () => uploadServer.getInfo());
  handle(IPC.uploadCopyText, async (_event, text: unknown) => {
    if (typeof text !== 'string' || text.length > 4096) throw new Error('Invalid text');
    await clipboard.writeText(text);
  });

  handle(IPC.updateCheck, (_event, manual: unknown) => updates.check(Boolean(manual)));
  handle(IPC.updateStatus, () => updates.status());
  handle(IPC.updateDismiss, (_event, kind: unknown) => {
    if (kind !== 'later' && kind !== 'skip') throw new Error('Invalid update dismissal');
    return updates.dismiss(kind);
  });
  handle(IPC.updateOpen, () => updates.open());

  handle(IPC.notifyShow, (_event, title: unknown, body: unknown) => {
    if (!settings.get().general.notifications || !Notification.isSupported()) return;
    const notification = new Notification({
      title: String(title).slice(0, 120),
      body: String(body).slice(0, 600),
      icon: iconPath
    });
    notification.show();
  });

  handle(IPC.debugCaptureWindow, async (event, path: unknown) => {
    if (typeof path !== 'string' || !path) throw new Error('Invalid path');
    const win = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getFocusedWindow() ?? windows.allWindows()[0];
    if (!win) throw new Error('No window to capture');
    const image = await win.webContents.capturePage();
    const target = resolve(path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, image.toPNG());
    return target;
  });
}
