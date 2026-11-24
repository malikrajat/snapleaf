import type { ImageFormat } from './settings';

export function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

export interface FilenameTokens {
  date?: Date;
  counter?: number;
}

/** Expand the user's filename pattern into a safe base name without extension. */
export function formatFilename(pattern: string, tokens: FilenameTokens = {}): string {
  const date = tokens.date ?? new Date();
  const values: Record<string, string> = {
    yyyy: String(date.getFullYear()),
    MM: pad2(date.getMonth() + 1),
    dd: pad2(date.getDate()),
    HH: pad2(date.getHours()),
    mm: pad2(date.getMinutes()),
    ss: pad2(date.getSeconds()),
    counter: String(tokens.counter ?? 1)
  };
  const expanded = pattern.replace(/\{(yyyy|MM|dd|HH|mm|ss|counter)\}/g, (_, key: string) => values[key] ?? '');
  return sanitizeFilename(expanded || 'Snapleaf');
}

export function sanitizeFilename(name: string): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/[. ]+$/g, '')
    .replace(/^[. ]+/g, '')
    .trim();
  return cleaned.slice(0, 140) || 'Snapleaf';
}

export function extensionFor(format: ImageFormat): string {
  return format === 'jpeg' ? 'jpg' : 'png';
}

export function mimeFor(format: ImageFormat): string {
  return format === 'jpeg' ? 'image/jpeg' : 'image/png';
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatRelativeTime(iso: string, now = Date.now()): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString();
}

export function parseDataUrl(dataUrl: string): { mime: string; buffer: Buffer } {
  const match = /^data:([^;,]+);base64,(.+)$/s.exec(dataUrl);
  if (!match) throw new Error('Unsupported image payload');
  return { mime: match[1], buffer: Buffer.from(match[2], 'base64') };
}

export function isLocalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(parsed.hostname) || parsed.hostname.startsWith('192.168.') || parsed.hostname.startsWith('10.') || /^172\.(1[6-9]|2\d|3[01])\./.test(parsed.hostname);
  } catch {
    return true;
  }
}
