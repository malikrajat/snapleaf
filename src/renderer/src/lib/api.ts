export const api = window.snapleaf;

export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
      .replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
      .replace(/^Error: /, '');
  }
  return String(error);
}

export async function copyText(text: string): Promise<void> {
  await api.upload.copyText(text);
}

export function openExternal(url: string): void {
  void api.app.openExternal(url);
}

export function isMac(): boolean {
  return navigator.platform.toLowerCase().includes('mac');
}
