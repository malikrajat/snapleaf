import { app, dialog, Menu, Tray, nativeImage, shell } from 'electron';
import type { CaptureAction, HotkeyStatus } from '../shared/types';
import type { SettingsStore } from './settings-store';
import type { WindowManager } from './windows';
import { appPaths } from './paths';
import { log } from './logger';

export interface TrayActions {
  startRegion: () => void;
  startFullscreen: (action: CaptureAction) => void;
  openGallery: () => void;
  openSettings: () => void;
  quit: () => void;
}

export class TrayManager {
  private tray: Tray | null = null;

  constructor(
    private readonly iconPath: string,
    private readonly windows: WindowManager,
    private readonly settings: SettingsStore,
    private readonly actions: TrayActions
  ) {}

  create(): void {
    try {
      const source = nativeImage.createFromPath(this.iconPath);
      const image = source.isEmpty() ? nativeImage.createEmpty() : source.resize({ width: 20, height: 20 });
      this.tray = new Tray(image);
      this.tray.setToolTip('Snapleaf');
      this.tray.on('click', () => {
        if (this.settings.get().general.singleClickTray) this.windows.toggleHome();
        else this.tray?.popUpContextMenu();
      });
      this.tray.on('double-click', () => this.actions.startRegion());
      this.refresh();
    } catch (error) {
      log.error('Tray icon could not be created', { error: String(error) });
    }
  }

  refresh(statuses: HotkeyStatus[] = []): void {
    if (!this.tray) return;
    const settings = this.settings.get();
    const capture = settings.hotkeys.capture;
    const captureStatus = statuses.find((status) => status.id === 'capture');
    const hotkey = capture.enabled && captureStatus?.registered !== false ? capture.accelerator : 'hotkey not set';
    this.tray.setToolTip(`Snapleaf — press ${hotkey.replace('CommandOrControl', 'Ctrl').replace('Control', 'Ctrl')} to capture`);

    const menu = Menu.buildFromTemplate([
      {
        label: 'Take screenshot',
        click: () => this.actions.startRegion()
      },
      {
        label: 'Capture full screen',
        click: () => this.actions.startFullscreen('edit')
      },
      {
        label: 'Save full screen now',
        click: () => this.actions.startFullscreen('save')
      },
      {
        label: 'Upload full screen now',
        click: () => this.actions.startFullscreen('upload')
      },
      { type: 'separator' },
      {
        label: 'Gallery',
        click: () => this.actions.openGallery()
      },
      {
        label: 'Open captures folder',
        click: () => void shell.openPath(appPaths().captures)
      },
      { type: 'separator' },
      {
        label: 'Settings…',
        click: () => this.actions.openSettings()
      },
      {
        label: 'Help & settings',
        click: () => this.actions.openSettings()
      },
      {
        label: 'About Snapleaf',
        click: () => {
          void dialog.showMessageBox({
            type: 'info',
            title: 'About Snapleaf',
            message: `Snapleaf ${app.getVersion()}`,
            detail: 'An original, local-first screenshot studio. No account, no analytics. Lightshot is a trademark of its owner; Snapleaf is not affiliated with Skillbrains.',
            buttons: ['OK']
          });
        }
      },
      { type: 'separator' },
      {
        label: 'Quit Snapleaf',
        click: () => this.actions.quit()
      }
    ]);
    this.tray.setContextMenu(menu);
  }

  isReady(): boolean {
    return this.tray !== null;
  }

  destroy(): void {
    this.tray?.destroy();
    this.tray = null;
  }
}
