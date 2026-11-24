import { app, Menu, nativeTheme, Notification, session } from 'electron';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { HotkeyStatus } from '../shared/types';
import type { Settings as SettingsType } from '../shared/settings';
import { IPC } from '../shared/types';
import { SettingsStore } from './settings-store';
import { Library } from './library';
import { UploadServer } from './upload-server';
import { WindowManager } from './windows';
import { CaptureService } from './capture';
import { HotkeyManager } from './hotkeys';
import { SystemHotkeyManager } from './system-hotkeys';
import { TrayManager } from './tray';
import { UpdateService } from './updates';
import { registerIpc } from './ipc';
import { registerPrivilegedSchemes, registerSnapleafProtocol } from './protocol';
import { log } from './logger';

app.setName('Snapleaf');
registerPrivilegedSchemes();

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  let windows: WindowManager | null = null;
  let settings: SettingsStore | null = null;
  let library: Library | null = null;
  let uploadServer: UploadServer | null = null;
  let capture: CaptureService | null = null;
  let hotkeys: HotkeyManager | null = null;
  let systemHotkeys: SystemHotkeyManager | null = null;
  let tray: TrayManager | null = null;
  let quitting = false;

  const iconPath = app.isPackaged
    ? join(process.resourcesPath, 'icon.png')
    : join(app.getAppPath(), 'resources', 'icon.png');

  function broadcast(channel: string, payload: unknown): void {
    for (const win of windows?.allWindows() ?? []) {
      if (!win.isDestroyed()) win.webContents.send(channel, payload);
    }
  }

  async function applyProxy(next: SettingsType): Promise<void> {
    const mode =
      next.proxy.mode === 'system' ? 'system' : next.proxy.mode === 'none' ? 'direct' : 'fixed_servers';
    try {
      await session.defaultSession.setProxy({
        mode,
        proxyRules: mode === 'fixed_servers' ? next.proxy.server || 'http://127.0.0.1:8080' : undefined,
        proxyBypassRules: '<local>'
      });
    } catch (error) {
      log.warn('Could not apply proxy settings', { error: String(error) });
    }
  }

  function applyLoginItem(next: SettingsType): void {
    if (!app.isPackaged) return;
    try {
      app.setLoginItemSettings({
        openAtLogin: next.general.launchAtLogin,
        path: process.execPath,
        args: ['--hidden']
      });
    } catch (error) {
      log.warn('Could not update launch-at-login', { error: String(error) });
    }
  }

  async function applySettings(next: SettingsType, previous: SettingsType): Promise<HotkeyStatus[]> {
    nativeTheme.themeSource = next.general.theme;
    applyLoginItem(next);
    await applyProxy(next);
    if (!uploadServer || !hotkeys) return [];
    const restartServer =
      previous.upload.localServer !== next.upload.localServer || previous.upload.port !== next.upload.port;
    if (restartServer) await uploadServer.restart();
    const systemState = systemHotkeys?.sync(next);
    const statuses = hotkeys.apply(
      systemState
        ? {
            systemOwnsPrintScreen: systemState.systemOwnsPrintScreen,
            printScreenTakeover: systemState.takeover
          }
        : {}
    );
    tray?.refresh(statuses);
    broadcast(IPC.hotkeyStatus, statuses);
    return statuses;
  }

  async function bootstrap(): Promise<void> {
    Menu.setApplicationMenu(null);
    app.setAppUserModelId('tools.snapleaf.app');
    registerSnapleafProtocol();
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));

    const settingsStore = new SettingsStore();
    settings = settingsStore;
    const libraryStore = new Library();
    library = libraryStore;
    const server = new UploadServer(settingsStore, libraryStore);
    uploadServer = server;
    await server.start();

    const windowManager = new WindowManager(iconPath);
    windows = windowManager;
    libraryStore.on('changed', () => broadcast(IPC.libraryChanged, {}));
    const captureService = new CaptureService(windowManager, settingsStore, libraryStore, server, iconPath);
    capture = captureService;
    const systemHotkeyManager = new SystemHotkeyManager();
    systemHotkeys = systemHotkeyManager;
    const updateService = new UpdateService({
      settings: settingsStore,
      windows: windowManager,
      iconPath,
      broadcast
    });

    const hotkeyManager = new HotkeyManager(
      settingsStore,
      {
        capture: () => void captureService.startRegion(),
        fullscreenSave: () => void captureService.startFullscreen('save'),
        fullscreenUpload: () => void captureService.startFullscreen('upload'),
        quickCopy: () => void captureService.startFullscreen('copy')
      },
      (statuses) => {
        tray?.refresh(statuses);
        broadcast(IPC.hotkeyStatus, statuses);
      }
    );
    hotkeys = hotkeyManager;

    registerIpc({
      windows: windowManager,
      settings: settingsStore,
      capture: captureService,
      library: libraryStore,
      uploadServer: server,
      updates: updateService,
      iconPath,
      applySettings,
      getHotkeyStatuses: () => hotkeyManager.getStatuses(),
      suspendHotkeys: () => hotkeyManager.suspend(),
      resumeHotkeys: () => {
        const state = systemHotkeyManager.sync(settingsStore.get());
        const nextStatuses = hotkeyManager.resume({
          systemOwnsPrintScreen: state.systemOwnsPrintScreen,
          printScreenTakeover: state.takeover
        });
        tray?.refresh(nextStatuses);
        broadcast(IPC.hotkeyStatus, nextStatuses);
        return nextStatuses;
      },
      broadcast
    });

    const trayManager = new TrayManager(iconPath, windowManager, settingsStore, {
      startRegion: () => void captureService.startRegion(),
      startFullscreen: (action) => void captureService.startFullscreen(action),
      openGallery: () => windowManager.showGallery(),
      openSettings: () => windowManager.showSettings(),
      quit: () => app.quit()
    });
    tray = trayManager;
    trayManager.create();

    nativeTheme.themeSource = settingsStore.get().general.theme;
    await applyProxy(settingsStore.get());
    applyLoginItem(settingsStore.get());
    const systemState = systemHotkeyManager.sync(settingsStore.get());
    const statuses = hotkeyManager.apply({
      systemOwnsPrintScreen: systemState.systemOwnsPrintScreen,
      printScreenTakeover: systemState.takeover
    });
    trayManager.refresh(statuses);

    if (
      systemState.changed &&
      settingsStore.get().general.notifications &&
      Notification.isSupported()
    ) {
      new Notification({
        title: 'PrintScreen is now Snapleaf’s key',
        body: 'Sign out or restart Windows once so PrtSc opens Snapleaf instead of Snipping Tool.',
        icon: iconPath
      }).show();
    }

    const hiddenLaunch = process.argv.includes('--hidden');
    const capturePath = process.env.SNAPLEAF_CAPTURE_PATH;
    const shouldStayHidden = (settingsStore.get().general.startMinimized || hiddenLaunch) && trayManager.isReady();
    if (capturePath) {
      let target = windowManager.showHome();
      if (process.env.SNAPLEAF_OPEN_SETTINGS === '1') target = windowManager.showSettings();
      if (process.env.SNAPLEAF_OPEN_GALLERY === '1') target = windowManager.showGallery();
      if (process.env.SNAPLEAF_OPEN_IMAGE) {
        try {
          const imported = libraryStore.importImage(process.env.SNAPLEAF_OPEN_IMAGE);
          target = windowManager.showEditor(imported.id);
        } catch (error) {
          log.error('Could not open fixture image', { error: String(error) });
        }
      }
      setTimeout(async () => {
        try {
          const image = await target.webContents.capturePage();
          mkdirSync(dirname(capturePath), { recursive: true });
          writeFileSync(capturePath, image.toPNG());
          log.info('Captured UI preview', { path: capturePath });
        } catch (error) {
          log.error('Could not capture UI preview', { error: String(error) });
        } finally {
          if (process.env.SNAPLEAF_CAPTURE_QUIT === '1') app.quit();
        }
      }, 2600);
    } else if (!shouldStayHidden) {
      windowManager.showHome();
    }

    log.info('Snapleaf started', {
      version: app.getVersion(),
      electron: process.versions.electron,
      uploadServer: server.getInfo(),
      hotkeys: statuses
    });

    setTimeout(() => void updateService.check(false), 2200);

    if (process.env.SNAPLEAF_TEST_REGION === '1') {
      setTimeout(() => void captureService.startRegion(), 1400);
    }
  }

  app.on('second-instance', () => {
    windows?.showHome();
  });

  app.on('activate', () => {
    windows?.showHome();
  });

  app.on('window-all-closed', () => {
    if (!tray?.isReady()) app.quit();
  });

  app.on('before-quit', () => {
    if (quitting) return;
    quitting = true;
    try {
      capture?.dispose();
      hotkeys?.dispose();
      tray?.destroy();
      void uploadServer?.stop();
      windows?.closeAll();
    } catch (error) {
      log.warn('Cleanup during quit failed', { error: String(error) });
    }
  });

  process.on('uncaughtException', (error) => {
    log.error('Uncaught exception', { message: error.message, stack: error.stack });
  });
  process.on('unhandledRejection', (reason) => {
    log.error('Unhandled rejection', { reason: String(reason) });
  });

  app
    .whenReady()
    .then(bootstrap)
    .catch((error) => {
      log.error('Startup failed', { message: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
      app.quit();
    });
}
