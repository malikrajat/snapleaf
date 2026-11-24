import type { Settings } from './settings';

export interface DisplayInfo {
  id: number;
  label: string;
  primary: boolean;
  bounds: { x: number; y: number; width: number; height: number };
  workArea: { x: number; y: number; width: number; height: number };
  scaleFactor: number;
}

export interface SelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type CaptureAction = 'edit' | 'copy' | 'save' | 'upload' | 'print';
export type CaptureSource = 'region' | 'fullscreen' | 'file' | 'clipboard';

export interface OverlayInit {
  sessionId: string;
  display: DisplayInfo;
  imageDataUrl: string;
  settings: Settings;
  lastRegion: SelectionRect | null;
  cursor: { x: number; y: number };
}

export interface OverlayConfirm {
  sessionId: string;
  displayId: number;
  action: CaptureAction;
  width: number;
  height: number;
  dataUrl: string;
  selection: SelectionRect;
}

export interface CaptureRecord {
  id: string;
  filename: string;
  path: string;
  url: string;
  width: number;
  height: number;
  bytes: number;
  createdAt: string;
  source: CaptureSource;
  displayLabel?: string;
}

export interface UploadRecord {
  id: string;
  filename: string;
  path: string;
  localUrl: string;
  fileUrl: string;
  pageUrl: string;
  width: number;
  height: number;
  bytes: number;
  createdAt: string;
  format: 'png' | 'jpeg';
  originalName?: string;
}

export interface GalleryData {
  captures: CaptureRecord[];
  uploads: UploadRecord[];
}

export interface AppInfo {
  name: string;
  version: string;
  electron: string;
  platform: string;
  userData: string;
  capturesDir: string;
  uploadsDir: string;
  logsDir: string;
  upload: ServerInfo;
}

export interface ServerInfo {
  running: boolean;
  port: number;
  localUrl: string;
  lanUrl: string;
  publicBaseUrl: string;
  effectiveBaseUrl: string;
  error?: string;
}

export interface SaveRequest {
  dataUrl: string;
  format: 'png' | 'jpeg';
  quality: number;
  suggestedName?: string;
}

export interface SaveResult {
  canceled: boolean;
  path?: string;
}

export interface UploadRequest {
  dataUrl: string;
  format: 'png' | 'jpeg';
  quality: number;
  originalName?: string;
  width: number;
  height: number;
}

export interface UploadResult {
  record: UploadRecord;
  server: ServerInfo;
}

export interface HotkeyStatus {
  id: keyof Settings['hotkeys'];
  accelerator: string;
  enabled: boolean;
  registered: boolean;
  error?: string;
}

export interface NavigateMessage {
  route: string;
}

export type UpdateStatus = 'available' | 'current' | 'skipped' | 'reminded' | 'disabled' | 'error';
export type UpdateDismissKind = 'later' | 'skip';

export interface UpdateInfo {
  version: string;
  currentVersion: string;
  downloadUrl: string;
  releaseUrl: string;
  notes: string;
  publishedAt: string | null;
}

export interface UpdateCheckResult {
  status: UpdateStatus;
  currentVersion: string;
  checkedAt: number;
  update?: UpdateInfo;
  error?: string;
}

export interface CaptureSummary {
  id: string;
  url: string;
  width: number;
  height: number;
}

export interface WindowState {
  maximized: boolean;
}

export interface SnapleafApi {
  app: {
    info(): Promise<AppInfo>;
    quit(): void;
    minimize(): void;
    maximize(): void;
    close(): void;
    openExternal(url: string): Promise<void>;
    showItemInFolder(path: string): Promise<void>;
    openPath(path: string): Promise<string>;
    openSettings(): void;
    openGallery(): void;
    chooseDirectory(): Promise<string | null>;
    onNavigate(callback: (message: NavigateMessage) => void): () => void;
  };
  settings: {
    get(): Promise<Settings>;
    update(settings: Settings): Promise<Settings>;
    reset(): Promise<Settings>;
    getHotkeyStatus(): Promise<HotkeyStatus[]>;
    onChanged(callback: (settings: Settings) => void): () => void;
    onHotkeyStatus(callback: (status: HotkeyStatus[]) => void): () => void;
  };
  capture: {
    startRegion(): Promise<void>;
    startFullscreen(action: CaptureAction): Promise<void>;
    getOverlayInit(): Promise<OverlayInit>;
    overlayReady(): void;
    confirm(payload: OverlayConfirm): Promise<void>;
    cancel(): Promise<void>;
    focus(): void;
  };
  editor: {
    getCapture(id: string): Promise<CaptureRecord | null>;
    getImage(id: string): Promise<string>;
    save(request: SaveRequest): Promise<SaveResult>;
    copy(dataUrl: string): Promise<void>;
    print(dataUrl: string): Promise<void>;
    upload(request: UploadRequest): Promise<UploadResult>;
    close(): void;
  };
  library: {
    list(): Promise<GalleryData>;
    deleteCapture(id: string): Promise<void>;
    deleteUpload(id: string): Promise<void>;
    openCapture(id: string): Promise<void>;
    importImage(): Promise<CaptureRecord | null>;
    openCapturesFolder(): Promise<void>;
    openUploadsFolder(): Promise<void>;
    onChanged(callback: () => void): () => void;
  };
  upload: {
    get(id: string): Promise<UploadRecord | null>;
    serverInfo(): Promise<ServerInfo>;
    copyText(text: string): Promise<void>;
  };
  notifications: {
    show(title: string, body: string): void;
  };
  hotkeys: {
    suspend(): Promise<void>;
    resume(): Promise<HotkeyStatus[]>;
  };
  updates: {
    check(manual?: boolean): Promise<UpdateCheckResult>;
    status(): Promise<UpdateCheckResult>;
    dismiss(kind: UpdateDismissKind): Promise<UpdateCheckResult>;
    open(): Promise<void>;
    onChanged(callback: (result: UpdateCheckResult) => void): () => void;
  };
  debug?: {
    captureWindow(path: string): Promise<void>;
  };
}

export const IPC = {
  appInfo: 'app:info',
  appQuit: 'app:quit',
  appMinimize: 'app:minimize',
  appMaximize: 'app:maximize',
  appClose: 'app:close',
  appOpenExternal: 'app:open-external',
  appShowItem: 'app:show-item',
  appOpenPath: 'app:open-path',
  appOpenSettings: 'app:open-settings',
  appOpenGallery: 'app:open-gallery',
  appChooseDirectory: 'app:choose-directory',
  appNavigate: 'app:navigate',

  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  settingsReset: 'settings:reset',
  settingsChanged: 'settings:changed',
  hotkeyGet: 'hotkey:get',
  hotkeyStatus: 'hotkey:status',
  hotkeySuspend: 'hotkey:suspend',
  hotkeyResume: 'hotkey:resume',

  captureStartRegion: 'capture:start-region',
  captureStartFullscreen: 'capture:start-fullscreen',
  captureOverlayInit: 'capture:overlay-init',
  captureOverlayReady: 'capture:overlay-ready',
  captureConfirm: 'capture:confirm',
  captureCancel: 'capture:cancel',
  captureFocus: 'capture:focus',

  editorGetCapture: 'editor:get-capture',
  editorGetImage: 'editor:get-image',
  editorSave: 'editor:save',
  editorCopy: 'editor:copy',
  editorPrint: 'editor:print',
  editorUpload: 'editor:upload',
  editorClose: 'editor:close',

  libraryList: 'library:list',
  libraryDeleteCapture: 'library:delete-capture',
  libraryDeleteUpload: 'library:delete-upload',
  libraryOpenCapture: 'library:open-capture',
  libraryImportImage: 'library:import-image',
  libraryOpenCaptures: 'library:open-captures',
  libraryOpenUploads: 'library:open-uploads',
  libraryChanged: 'library:changed',

  uploadGet: 'upload:get',
  uploadServerInfo: 'upload:server-info',
  uploadCopyText: 'upload:copy-text',

  notifyShow: 'notify:show',

  updateCheck: 'updates:check',
  updateStatus: 'updates:status',
  updateDismiss: 'updates:dismiss',
  updateOpen: 'updates:open',
  updateChanged: 'updates:changed',

  debugCaptureWindow: 'debug:capture-window',
  debugOpenFixtureEditor: 'debug:open-fixture-editor'
} as const;
