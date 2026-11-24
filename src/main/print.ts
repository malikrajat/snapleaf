import { BrowserWindow } from 'electron';
import { log } from './logger';

export async function printImage(dataUrl: string): Promise<void> {
  const html = `<!doctype html><html><head><meta charset="utf-8"/><title>Print screenshot</title>
  <style>@page{margin:10mm}html,body{margin:0;padding:0}body{display:flex;align-items:center;justify-content:center}img{max-width:100%;max-height:100vh;object-fit:contain}</style>
  </head><body><img src="${dataUrl}" alt="Screenshot"/></body></html>`;
  const win = new BrowserWindow({
    show: false,
    width: 1000,
    height: 800,
    webPreferences: { sandbox: true, contextIsolation: true }
  });
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    await win.webContents.executeJavaScript(
      `new Promise((resolve) => { const image = document.images[0]; if (!image || image.complete) resolve(true); else { image.onload = () => resolve(true); image.onerror = () => resolve(false); } })`
    );
    await new Promise<void>((resolve) => {
      win.webContents.print({ silent: false, printBackground: true }, (success, reason) => {
        if (!success && reason) log.warn('Print was not completed', { reason });
        resolve();
      });
    });
  } finally {
    if (!win.isDestroyed()) win.close();
  }
}
