import type { UpdateInfo } from './types';

/**
 * The default manifest is a small JSON document the app can host next to the
 * Snapleaf download. It can also point at a GitHub "latest release" response;
 * the parser accepts either shape.
 */
export const DEFAULT_UPDATE_FEED = 'https://rajatmalik.dev/snapleaf/latest.json';

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function text(value: unknown, max = 4000): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
}

function webUrl(value: unknown): string | null {
  const candidate = text(value, 2048);
  if (!candidate) return null;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function normalizeVersion(value: unknown): string | null {
  const candidate = text(value, 80)?.replace(/^v/i, '');
  if (!candidate || !/^\d+(?:\.\d+){0,3}(?:[-+][0-9A-Za-z.-]+)?$/.test(candidate)) return null;
  return candidate;
}

/** Numeric comparison; enough for Snapleaf's date-like semantic versions. */
export function isNewerVersion(latest: string, current: string): boolean {
  const left = latest.split(/[.+-]/).map((part) => Number.parseInt(part, 10) || 0);
  const right = current.split(/[.+-]/).map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    if (a !== b) return a > b;
  }
  return false;
}

/**
 * Accept Snapleaf's own manifest:
 * { version, downloadUrl, releaseUrl?, notes?, publishedAt? }
 * and GitHub's releases/latest payload:
 * { tag_name, html_url, body, published_at }
 */
export function parseUpdateManifest(input: unknown, currentVersion: string): UpdateInfo | null {
  const raw = record(input);
  if (!raw) return null;
  const version =
    normalizeVersion(raw.version) ?? normalizeVersion(raw.tag_name) ?? normalizeVersion(raw.name);
  if (!version) return null;
  const downloadUrl =
    webUrl(raw.downloadUrl) ??
    webUrl(raw.download_url) ??
    webUrl(raw.html_url) ??
    webUrl(raw.releaseUrl) ??
    webUrl(raw.url);
  if (!downloadUrl) return null;
  const releaseUrl = webUrl(raw.releaseUrl) ?? webUrl(raw.html_url) ?? downloadUrl;
  return {
    version,
    currentVersion,
    downloadUrl,
    releaseUrl,
    notes: text(raw.notes ?? raw.releaseNotes ?? raw.body ?? raw.summary) ?? '',
    publishedAt: text(raw.publishedAt ?? raw.published_at ?? raw.date, 80)
  };
}
