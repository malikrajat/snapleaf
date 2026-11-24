import { contextBridge, ipcRenderer } from 'electron';
import type {
  CaptureAction,
  HotkeyStatus,
  NavigateMessage,
  OverlayConfirm,
  SaveRequest,
  SnapleafApi,
  UpdateCheckResult,
  UpdateDismissKind,
  UploadRequest
} from '../shared/types';
import type { Settings } from '../shared/settings';
import { IPC } from '../shared/types';

function on<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, payload: T) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api: SnapleafApi = {
  app: {
    info: () => ipcRenderer.invoke(IPC.appInfo),
    quit: () => void ipcRenderer.invoke(IPC.appQuit),
    minimize: () => void ipcRenderer.invoke(IPC.appMinimize),
    maximize: () => void ipcRenderer.invoke(IPC.appMaximize),
    close: () => void ipcRenderer.invoke(IPC.appClose),
    openExternal: (url: string) => ipcRenderer.invoke(IPC.appOpenExternal, url),
    showItemInFolder: (path: string) => ipcRenderer.invoke(IPC.appShowItem, path),
    openPath: (path: string) => ipcRenderer.invoke(IPC.appOpenPath, path),
    openSettings: () => void ipcRenderer.invoke(IPC.appOpenSettings),
    openGallery: () => void ipcRenderer.invoke(IPC.appOpenGallery),
    chooseDirectory: () => ipcRenderer.invoke(IPC.appChooseDirectory),
    onNavigate: (callback: (message: NavigateMessage) => void) => on(IPC.appNavigate, callback)
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.settingsGet),
    update: (settings: Settings) => ipcRenderer.invoke(IPC.settingsUpdate, settings),
    reset: () => ipcRenderer.invoke(IPC.settingsReset),
    getHotkeyStatus: () => ipcRenderer.invoke(IPC.hotkeyGet),
    onChanged: (callback: (settings: Settings) => void) => on(IPC.settingsChanged, callback),
    onHotkeyStatus: (callback: (status: HotkeyStatus[]) => void) => on(IPC.hotkeyStatus, callback)
  },
  capture: {
    startRegion: () => ipcRenderer.invoke(IPC.captureStartRegion),
    startFullscreen: (action: CaptureAction) => ipcRenderer.invoke(IPC.captureStartFullscreen, action),
    getOverlayInit: () => ipcRenderer.invoke(IPC.captureOverlayInit),
    overlayReady: () => ipcRenderer.invoke(IPC.captureOverlayReady),
    confirm: (payload: OverlayConfirm) => ipcRenderer.invoke(IPC.captureConfirm, payload),
    cancel: () => ipcRenderer.invoke(IPC.captureCancel),
    focus: () => void ipcRenderer.invoke(IPC.captureFocus)
  },
  editor: {
    getCapture: (id: string) => ipcRenderer.invoke(IPC.editorGetCapture, id),
    getImage: (id: string) => ipcRenderer.invoke(IPC.editorGetImage, id),
    save: (request: SaveRequest) => ipcRenderer.invoke(IPC.editorSave, request),
    copy: (dataUrl: string) => ipcRenderer.invoke(IPC.editorCopy, dataUrl),
    print: (dataUrl: string) => ipcRenderer.invoke(IPC.editorPrint, dataUrl),
    upload: (request: UploadRequest) => ipcRenderer.invoke(IPC.editorUpload, request),
    close: () => void ipcRenderer.invoke(IPC.editorClose)
  },
  library: {
    list: () => ipcRenderer.invoke(IPC.libraryList),
    deleteCapture: (id: string) => ipcRenderer.invoke(IPC.libraryDeleteCapture, id),
    deleteUpload: (id: string) => ipcRenderer.invoke(IPC.libraryDeleteUpload, id),
    openCapture: (id: string) => ipcRenderer.invoke(IPC.libraryOpenCapture, id),
    importImage: () => ipcRenderer.invoke(IPC.libraryImportImage),
    openCapturesFolder: () => ipcRenderer.invoke(IPC.libraryOpenCaptures),
    openUploadsFolder: () => ipcRenderer.invoke(IPC.libraryOpenUploads),
    onChanged: (callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on(IPC.libraryChanged, listener);
      return () => ipcRenderer.removeListener(IPC.libraryChanged, listener);
    }
  },
  upload: {
    get: (id: string) => ipcRenderer.invoke(IPC.uploadGet, id),
    serverInfo: () => ipcRenderer.invoke(IPC.uploadServerInfo),
    copyText: (text: string) => ipcRenderer.invoke(IPC.uploadCopyText, text)
  },
  notifications: {
    show: (title: string, body: string) => void ipcRenderer.invoke(IPC.notifyShow, title, body)
  },
  hotkeys: {
    suspend: () => ipcRenderer.invoke(IPC.hotkeySuspend),
    resume: () => ipcRenderer.invoke(IPC.hotkeyResume)
  },
  updates: {
    check: (manual = false) => ipcRenderer.invoke(IPC.updateCheck, manual),
    status: () => ipcRenderer.invoke(IPC.updateStatus),
    dismiss: (kind: UpdateDismissKind) => ipcRenderer.invoke(IPC.updateDismiss, kind),
    open: () => ipcRenderer.invoke(IPC.updateOpen),
    onChanged: (callback: (result: UpdateCheckResult) => void) => on(IPC.updateChanged, callback)
  },
  debug: {
    captureWindow: (path: string) => ipcRenderer.invoke(IPC.debugCaptureWindow, path)
  }
};

contextBridge.exposeInMainWorld('snapleaf', api);
