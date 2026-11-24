import {
  app,
  BrowserWindow,
  clipboard,
  ClipboardItem,
  desktopCapturer,
  dialog,
  nativeImage,
  Notification,
  screen,
  shell,
  webContents as electronWebContents
} from 'electron';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  CaptureAction,
  CaptureRecord,
  DisplayInfo,
  OverlayConfirm,
  OverlayInit,
  SelectionRect,
  ServerInfo,
  UploadRecord,
  UploadResult
} from '../shared/types';
import type { Settings } from '../shared/settings';
import { extensionFor, formatFilename, parseDataUrl, sanitizeFilename } from '../shared/format';
import type { SettingsStore } from './settings-store';
import type { WindowManager } from './windows';
import type { Library } from './library';
import type { UploadServer } from './upload-server';
import { log } from './logger';
import { printImage } from './print';

interface DisplayCapture {
  display: DisplayInfo;
  dataUrl: string;
  cursor: { x: number; y: number };
}

interface ActiveSession {
  id: string;
  hidden: BrowserWindow[];
  displays: Map<number, DisplayInfo>;
  overlays: Map<number, BrowserWindow>;
  activeDisplayId: number;
  finishing: boolean;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toDisplayInfo(display: Electron.Display, index: number): DisplayInfo {
  return {
    id: display.id,
    label: display.label || `Display ${index + 1}`,
    primary: display.id === screen.getPrimaryDisplay().id,
    bounds: { ...display.bounds },
    workArea: { ...display.workArea },
    scaleFactor: display.scaleFactor
  };
}

export class CaptureService {
  private session: ActiveSession | null = null;
  private pendingInits = new Map<number, OverlayInit>();
  private pendingReady = new Map<number, () => void>();
  private busy = false;

  constructor(
    private readonly windows: WindowManager,
    private readonly settings: SettingsStore,
    private readonly library: Library,
    private readonly uploadServer: UploadServer,
    private readonly iconPath: string
  ) {}

  getOverlayInit(senderId: number): OverlayInit {
    const init = this.pendingInits.get(senderId);
    if (!init) throw new Error('This capture window is no longer active');
    return init;
  }

  markOverlayReady(senderId: number): void {
    const resolve = this.pendingReady.get(senderId);
    this.pendingReady.delete(senderId);
    resolve?.();
  }

  focusOverlay(senderId: number): void {
    const contents = electronWebContents.fromId(senderId);
    const win = contents ? BrowserWindow.fromWebContents(contents) : null;
    if (win && !win.isDestroyed()) {
      win.focus();
      win.webContents.focus();
    }
  }

  async startRegion(): Promise<void> {
    if (this.busy) return;
    if (this.session) {
      const active = this.session.overlays.get(this.session.activeDisplayId);
      active?.focus();
      return;
    }
    this.busy = true;
    const hidden = this.windows.hideForCapture();
    await delay(170);
    let captures: DisplayCapture[];
    try {
      captures = await this.captureAllDisplays();
    } catch (error) {
      this.windows.restoreAfterCapture(hidden);
      await this.showError('Could not capture the screen', describeError(error));
      this.busy = false;
      return;
    }

    const cursorDisplay = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const sessionId = `cap_${Date.now().toString(36)}`;
    const session: ActiveSession = {
      id: sessionId,
      hidden,
      displays: new Map(captures.map((capture) => [capture.display.id, capture.display])),
      overlays: new Map(),
      activeDisplayId: cursorDisplay.id,
      finishing: false
    };
    this.session = session;
    const settings = this.settings.get();
    const readyWaits: Promise<unknown>[] = [];

    for (const capture of captures) {
      const win = this.windows.createOverlay(sessionId, capture.display);
      const webContentsId = win.webContents.id;
      session.overlays.set(capture.display.id, win);
      const init: OverlayInit = {
        sessionId,
        display: capture.display,
        imageDataUrl: capture.dataUrl,
        settings,
        lastRegion:
          settings.capture.keepSelection &&
          settings.capture.lastRegion &&
          settings.capture.lastRegion.displayId === capture.display.id
            ? {
                x: settings.capture.lastRegion.x,
                y: settings.capture.lastRegion.y,
                width: settings.capture.lastRegion.width,
                height: settings.capture.lastRegion.height
              }
            : null,
        cursor: capture.cursor
      };
      this.pendingInits.set(webContentsId, init);
      readyWaits.push(
        Promise.race([
          new Promise<void>((resolve) => {
            this.pendingReady.set(webContentsId, resolve);
          }),
          delay(2500)
        ])
      );
      win.webContents.on('did-fail-load', () => this.cancelSession());
      win.on('closed', () => {
        this.pendingInits.delete(webContentsId);
        this.pendingReady.delete(webContentsId);
        if (this.session?.id === sessionId && !this.session.finishing) this.cancelSession();
      });
    }

    await Promise.all(readyWaits);
    if (this.session?.id !== sessionId) {
      this.busy = false;
      return;
    }

    const active = session.overlays.get(session.activeDisplayId) ?? [...session.overlays.values()][0];
    for (const win of session.overlays.values()) {
      if (win === active) continue;
      if (!win.isDestroyed()) win.showInactive();
    }
    if (active && !active.isDestroyed()) {
      active.show();
      active.focus();
      active.webContents.focus();
    }
    this.busy = false;
  }

  async startFullscreen(action: CaptureAction): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    const hidden = this.windows.hideForCapture();
    await delay(170);
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    try {
      const capture = await this.captureDisplay(display);
      this.windows.restoreAfterCapture(hidden);
      await this.processCapture(
        capture.dataUrl,
        capture.display,
        action,
        {
          x: 0,
          y: 0,
          width: capture.display.bounds.width,
          height: capture.display.bounds.height
        },
        'fullscreen'
      );
    } catch (error) {
      this.windows.restoreAfterCapture(hidden);
      await this.showError('Could not capture the screen', describeError(error));
    } finally {
      this.busy = false;
    }
  }

  async confirm(senderId: number, payload: OverlayConfirm): Promise<void> {
    const session = this.session;
    if (!session || session.id !== payload.sessionId) throw new Error('Capture session has expired');
    const init = this.pendingInits.get(senderId);
    if (!init || init.display.id !== payload.displayId) throw new Error('Capture window mismatch');
    const display = session.displays.get(payload.displayId);
    if (!display) throw new Error('Unknown display');
    this.finishSession();
    await this.processCapture(payload.dataUrl, display, payload.action, payload.selection, 'region');
  }

  cancel(senderId?: number): void {
    if (senderId !== undefined) {
      const init = this.pendingInits.get(senderId);
      if (!init) return;
    }
    this.cancelSession();
  }

  private cancelSession(): void {
    const session = this.session;
    if (!session) return;
    session.finishing = true;
    this.windows.closeOverlays();
    this.session = null;
    this.windows.restoreAfterCapture(session.hidden);
    for (const id of [...this.pendingInits.keys()]) this.pendingInits.delete(id);
    for (const id of [...this.pendingReady.keys()]) this.pendingReady.delete(id);
  }

  private finishSession(): void {
    const session = this.session;
    if (!session) return;
    session.finishing = true;
    this.windows.closeOverlays();
    this.session = null;
    this.windows.restoreAfterCapture(session.hidden);
    for (const id of [...this.pendingInits.keys()]) this.pendingInits.delete(id);
    for (const id of [...this.pendingReady.keys()]) this.pendingReady.delete(id);
  }

  private async captureAllDisplays(): Promise<DisplayCapture[]> {
    const displays = screen.getAllDisplays();
    const captures: DisplayCapture[] = [];
    for (let index = 0; index < displays.length; index += 1) {
      captures.push(await this.captureDisplay(displays[index]));
    }
    return captures;
  }

  private async captureDisplay(display: Electron.Display): Promise<DisplayCapture> {
    const width = Math.max(1, Math.round(display.bounds.width * display.scaleFactor));
    const height = Math.max(1, Math.round(display.bounds.height * display.scaleFactor));
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width, height },
      fetchWindowIcons: false
    });
    if (!sources.length) throw new Error('No screen sources were returned');
    const source =
      sources.find((candidate) => candidate.display_id === String(display.id)) ??
      sources.find((candidate) => candidate.name === display.label) ??
      sources[0];
    if (!source || source.thumbnail.isEmpty()) throw new Error(`Display ${display.label} returned an empty image`);
    const actual = source.thumbnail.getSize();
    if (actual.width < width * 0.75 || actual.height < height * 0.75) {
      log.warn('Screen capture is lower resolution than requested', {
        display: display.label,
        requested: { width, height },
        actual
      });
    }
    const cursor = screen.getCursorScreenPoint();
    const info = toDisplayInfo(display, screen.getAllDisplays().findIndex((item) => item.id === display.id));
    return {
      display: info,
      dataUrl: source.thumbnail.toDataURL(),
      cursor: { x: cursor.x - display.bounds.x, y: cursor.y - display.bounds.y }
    };
  }

  private async processCapture(
    dataUrl: string,
    display: DisplayInfo,
    action: CaptureAction,
    selection: SelectionRect,
    source: 'region' | 'fullscreen'
  ): Promise<void> {
    try {
      const current = this.settings.get();
      if (source === 'region' && current.capture.keepSelection) {
        this.settings.update({
          ...current,
          capture: {
            ...current.capture,
            lastRegion: {
              displayId: display.id,
              x: Math.round(selection.x),
              y: Math.round(selection.y),
              width: Math.max(1, Math.round(selection.width)),
              height: Math.max(1, Math.round(selection.height))
            }
          }
        });
      }

      if (action === 'edit') {
        const record = this.library.addCapture(dataUrl, source, display.label);
        if (current.capture.copyImageAfterCapture) await this.copyDataUrl(dataUrl, false);
        this.windows.showEditor(record.id);
        return;
      }
      if (action === 'copy') {
        await this.copyDataUrl(dataUrl, true);
        return;
      }
      if (action === 'save') {
        const result = await this.saveDataUrl(dataUrl, current.save.format, current.save.jpegQuality);
        if (!result.canceled && result.path) {
          this.notify('Screenshot saved', result.path, () => shell.showItemInFolder(result.path!));
          if (current.save.openFolderAfterSave) shell.showItemInFolder(result.path);
        }
        return;
      }
      if (action === 'upload') {
        const uploaded = await this.uploadDataUrl(dataUrl, undefined, undefined);
        if (uploaded) this.windows.showUpload(uploaded.record.id);
        return;
      }
      if (action === 'print') {
        await printImage(dataUrl);
      }
    } catch (error) {
      log.error('Capture action failed', { action, error: String(error) });
      await this.showError('Could not finish the screenshot', describeError(error));
    }
  }

  async copyDataUrl(dataUrl: string, announce: boolean): Promise<void> {
    const { buffer, mime } = parseDataUrl(dataUrl);
    const image = nativeImage.createFromBuffer(buffer);
    if (image.isEmpty()) throw new Error('Image could not be decoded');
    await clipboard.write([
      new ClipboardItem({
        [mime]: new Blob([buffer], { type: mime })
      })
    ]);
    if (announce) this.notify('Screenshot copied', 'The image is on your clipboard.');
  }

  async saveDataUrl(
    dataUrl: string,
    format: 'png' | 'jpeg',
    quality: number,
    suggestedName?: string
  ): Promise<{ canceled: boolean; path?: string }> {
    const settings = this.settings.get();
    const { buffer } = parseDataUrl(dataUrl);
    const image = nativeImage.createFromBuffer(buffer);
    if (image.isEmpty()) throw new Error('Image could not be decoded');
    let payload: Buffer;
    if (format === 'jpeg') {
      payload = image.toJPEG(Math.round(quality));
    } else {
      payload = settings.save.optimizePng ? image.toPNG() : buffer;
    }
    const directory = settings.save.directory || join(app.getPath('pictures'), 'Snapleaf');
    mkdirSync(directory, { recursive: true });
    const base = sanitizeFilename(suggestedName || formatFilename(settings.save.filenamePattern));
    const extension = extensionFor(format);
    let candidate = join(directory, `${base}.${extension}`);
    let counter = 2;
    while (existsSync(candidate) && counter < 10000) {
      candidate = join(directory, `${base} (${counter}).${extension}`);
      counter += 1;
    }
    const parent = BrowserWindow.getFocusedWindow();
    const options = {
      title: 'Save screenshot',
      defaultPath: candidate,
      filters:
        format === 'jpeg'
          ? [{ name: 'JPEG image', extensions: ['jpg', 'jpeg'] }]
          : [{ name: 'PNG image', extensions: ['png'] }]
    };
    const result = parent ? await dialog.showSaveDialog(parent, options) : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return { canceled: true };
    writeFileSync(result.filePath, payload);
    log.info('Screenshot saved', { path: result.filePath, bytes: payload.byteLength });
    return { canceled: false, path: result.filePath };
  }

  async uploadDataUrl(
    dataUrl: string,
    originalName: string | undefined,
    dimensions: { width: number; height: number } | undefined
  ): Promise<UploadResult | null> {
    const settings = this.settings.get();
    if (!settings.upload.localServer) {
      const answer = await dialog.showMessageBox({
        type: 'info',
        title: 'Local sharing is off',
        message: 'Turn on the built-in sharing server to upload screenshots.',
        detail: 'Snapleaf creates local links on your computer or network. No account or cloud service is required.',
        buttons: ['Open sharing settings', 'Cancel'],
        defaultId: 0,
        cancelId: 1
      });
      if (answer.response === 0) this.windows.showSettings();
      return null;
    }
    const info = this.uploadServer.getInfo();
    if (!info.running) {
      await this.showError('Sharing server is not running', info.error || 'Open Settings → Sharing and try a different port.');
      return null;
    }
    const { buffer } = parseDataUrl(dataUrl);
    const image = nativeImage.createFromBuffer(buffer);
    if (image.isEmpty()) throw new Error('Image could not be decoded');
    const size = dimensions ?? image.getSize();
    const format = settings.upload.format;
    const payload = format === 'jpeg' ? image.toJPEG(Math.round(settings.upload.jpegQuality)) : buffer;
    const record = this.uploadServer.storeUpload(payload, {
      format,
      width: size.width,
      height: size.height,
      originalName: originalName || formatFilename(settings.save.filenamePattern)
    });
    if (settings.upload.autoCopyLink) {
      await clipboard.writeText(record.pageUrl);
    }
    this.notify(
      settings.upload.autoCopyLink ? 'Screenshot uploaded — link copied' : 'Screenshot uploaded',
      record.pageUrl,
      () => this.windows.showUpload(record.id)
    );
    return { record, server: this.uploadServer.getInfo() };
  }

  private notify(title: string, body: string, onClick?: () => void): void {
    const settings = this.settings.get();
    if (!settings.general.notifications || !Notification.isSupported()) return;
    try {
      const notification = new Notification({ title, body, icon: this.iconPath, silent: !settings.capture.playSound });
      if (onClick) notification.on('click', onClick);
      notification.show();
    } catch (error) {
      log.warn('Notification failed', { error: String(error) });
    }
  }

  private async showError(message: string, detail: string): Promise<void> {
    await dialog.showMessageBox({
      type: 'error',
      title: 'Snapleaf',
      message,
      detail,
      buttons: ['OK']
    });
  }

  dispose(): void {
    this.cancelSession();
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
