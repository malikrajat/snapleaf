import { BrowserWindow, shell, screen } from 'electron';
import { join } from 'node:path';
import type { DisplayInfo } from '../shared/types';
import { log } from './logger';

const PRELOAD = join(__dirname, '../preload/index.js');
const RENDERER_HTML = join(__dirname, '../renderer/index.html');
const DEV_URL = process.env['ELECTRON_RENDERER_URL'];

function rendererUrl(route: string): string {
  if (DEV_URL) return `${DEV_URL.replace(/\/$/, '')}/#${route}`;
  return `file://${RENDERER_HTML.replaceAll('\\', '/')}#${route}`;
}

function load(win: BrowserWindow, route: string): void {
  if (DEV_URL) {
    void win.loadURL(rendererUrl(route));
  } else {
    void win.loadFile(RENDERER_HTML, { hash: route });
  }
}

function commonOptions(icon: string): Electron.BrowserWindowConstructorOptions {
  return {
    show: false,
    backgroundColor: '#0f1216',
    icon,
    autoHideMenuBar: true,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      webSecurity: true
    }
  };
}

function lockNavigation(win: BrowserWindow): void {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    const current = win.webContents.getURL();
    if (url !== current && !url.startsWith('file://') && !url.startsWith(DEV_URL ?? 'http://localhost')) {
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    }
  });
}

export class WindowManager {
  private home: BrowserWindow | null = null;
  private settings: BrowserWindow | null = null;
  private gallery: BrowserWindow | null = null;
  private upload: BrowserWindow | null = null;
  private editors = new Map<number, BrowserWindow>();
  private overlays = new Map<number, BrowserWindow>();

  constructor(private readonly icon: string) {}

  private create(
    route: string,
    options: Electron.BrowserWindowConstructorOptions,
    kind: 'normal' | 'overlay',
    autoShow = kind === 'normal'
  ): BrowserWindow {
    const win = new BrowserWindow({
      ...commonOptions(this.icon),
      ...options
    });
    lockNavigation(win);
    if (kind === 'overlay') {
      win.setAlwaysOnTop(true, 'screen-saver');
      win.setMenuBarVisibility(false);
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    }
    win.webContents.on('did-fail-load', (_event, code, description, url) => {
      log.error('Window failed to load', { code, description, url });
    });
    win.webContents.on('render-process-gone', (_event, details) => {
      log.error('Window renderer exited', { reason: details.reason, exitCode: details.exitCode });
    });
    if (autoShow) {
      win.once('ready-to-show', () => {
        if (!win.isDestroyed() && !win.isVisible()) win.show();
      });
    }
    load(win, route);
    return win;
  }

  showHome(show = true): BrowserWindow {
    if (this.home && !this.home.isDestroyed()) {
      if (show) {
        if (this.home.isMinimized()) this.home.restore();
        this.home.show();
        this.home.focus();
      }
      return this.home;
    }
    const win = this.create('/home', {
      width: 1180,
      height: 780,
      minWidth: 780,
      minHeight: 580,
      center: true
    }, 'normal', show);
    win.on('closed', () => {
      this.home = null;
    });
    this.home = win;
    return win;
  }

  toggleHome(): void {
    if (this.home && !this.home.isDestroyed() && this.home.isVisible()) {
      this.home.hide();
    } else {
      this.showHome();
    }
  }

  showSettings(): BrowserWindow {
    if (this.settings && !this.settings.isDestroyed()) {
      this.settings.show();
      this.settings.focus();
      return this.settings;
    }
    const win = this.create('/settings', {
      width: 960,
      height: 760,
      minWidth: 780,
      minHeight: 600,
      center: true
    }, 'normal');
    win.on('closed', () => {
      this.settings = null;
    });
    this.settings = win;
    return win;
  }

  showGallery(): BrowserWindow {
    if (this.gallery && !this.gallery.isDestroyed()) {
      this.gallery.show();
      this.gallery.focus();
      return this.gallery;
    }
    const win = this.create('/gallery', {
      width: 1160,
      height: 800,
      minWidth: 820,
      minHeight: 620,
      center: true
    }, 'normal');
    win.on('closed', () => {
      this.gallery = null;
    });
    this.gallery = win;
    return win;
  }

  showUpload(id: string): BrowserWindow {
    if (this.upload && !this.upload.isDestroyed()) {
      this.upload.show();
      this.upload.focus();
      return this.upload;
    }
    const win = this.create(`/upload?id=${encodeURIComponent(id)}`, {
      width: 1160,
      height: 780,
      minWidth: 760,
      minHeight: 560,
      center: true
    }, 'normal');
    win.on('closed', () => {
      this.upload = null;
    });
    this.upload = win;
    return win;
  }

  showEditor(captureId: string): BrowserWindow {
    const area = screen.getPrimaryDisplay().workAreaSize;
    const width = Math.min(1380, Math.max(900, Math.round(area.width * 0.86)));
    const height = Math.min(940, Math.max(640, Math.round(area.height * 0.88)));
    const win = this.create(`/editor?captureId=${encodeURIComponent(captureId)}`, {
      width,
      height,
      minWidth: 860,
      minHeight: 580,
      center: true
    }, 'normal');
    this.editors.set(win.id, win);
    win.on('closed', () => this.editors.delete(win.id));
    return win;
  }

  createOverlay(sessionId: string, display: DisplayInfo): BrowserWindow {
    const win = this.create(`/overlay?session=${encodeURIComponent(sessionId)}&display=${display.id}`, {
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height,
      frame: false,
      transparent: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      hasShadow: false,
      roundedCorners: false,
      thickFrame: false,
      title: 'Snapleaf capture',
      focusable: true
    }, 'overlay', false);
    win.setBounds(display.bounds);
    this.overlays.set(display.id, win);
    win.on('closed', () => this.overlays.delete(display.id));
    return win;
  }

  getOverlay(displayId: number): BrowserWindow | undefined {
    return this.overlays.get(displayId);
  }

  closeOverlays(): void {
    for (const win of [...this.overlays.values()]) {
      if (!win.isDestroyed()) win.close();
    }
    this.overlays.clear();
  }

  hideForCapture(): BrowserWindow[] {
    const visible: BrowserWindow[] = [];
    const overlayIds = new Set([...this.overlays.values()].map((win) => win.id));
    for (const win of this.allWindows()) {
      if (!win.isDestroyed() && win.isVisible() && !overlayIds.has(win.id)) {
        visible.push(win);
        win.hide();
      }
    }
    return visible;
  }

  restoreAfterCapture(windows: BrowserWindow[]): void {
    for (const win of windows) {
      if (!win.isDestroyed() && win !== this.upload) win.show();
    }
  }

  allWindows(): BrowserWindow[] {
    return [
      this.home,
      this.settings,
      this.gallery,
      this.upload,
      ...this.editors.values(),
      ...this.overlays.values()
    ].filter((win): win is BrowserWindow => Boolean(win && !win.isDestroyed()));
  }

  closeAll(): void {
    for (const win of this.allWindows()) {
      if (!win.isDestroyed()) win.destroy();
    }
    this.overlays.clear();
    this.editors.clear();
  }
}
