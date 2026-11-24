import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { networkInterfaces } from 'node:os';
import { existsSync, readFileSync } from 'node:fs';
import { nativeImage } from 'electron';
import type { UploadRecord, ServerInfo } from '../shared/types';
import type { Library } from './library';
import type { SettingsStore } from './settings-store';
import { log } from './logger';

const MAX_UPLOAD_BYTES = 64 * 1024 * 1024;

function lanAddress(): string {
  const interfaces = networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) return entry.address;
    }
  }
  return '127.0.0.1';
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function isLoopback(request: IncomingMessage): boolean {
  const address = request.socket.remoteAddress ?? '';
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

function readBody(request: IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('Upload is larger than the 64 MB limit'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

const pageStyles = `
  :root { color-scheme: light dark; --bg:#f6f7f9; --card:#fff; --text:#15181d; --muted:#667085; --accent:#1e90ff; --line:#e6e8ec; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0f1216; --card:#171c22; --text:#f2f4f7; --muted:#98a2b3; --accent:#4aa8ff; --line:#27303a; } }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif; }
  main { max-width: 1080px; margin: 0 auto; padding: 32px 20px 64px; }
  header { display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:24px; }
  .brand { display:flex; align-items:center; gap:10px; font-weight:700; letter-spacing:-.02em; }
  .mark { width:30px; height:30px; border-radius:9px; background:linear-gradient(135deg,#4aa8ff,#1e90ff); display:grid; place-items:center; color:#fff; font-size:16px; }
  a { color: var(--accent); }
  .card { background:var(--card); border:1px solid var(--line); border-radius:20px; padding:16px; box-shadow:0 16px 50px rgba(16,24,40,.08); }
  .preview { display:block; max-width:100%; max-height:70vh; margin:0 auto; border-radius:12px; }
  h1 { font-size:22px; letter-spacing:-.03em; margin:0; }
  .meta { color:var(--muted); font-size:13px; }
  .buttons { display:flex; flex-wrap:wrap; gap:10px; margin-top:18px; }
  button, .button { appearance:none; border:1px solid var(--line); background:var(--card); color:var(--text); padding:9px 14px; border-radius:10px; font:inherit; font-weight:600; cursor:pointer; text-decoration:none; }
  .primary { background:var(--accent); border-color:var(--accent); color:#fff; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(210px,1fr)); gap:16px; }
  .tile { display:block; text-decoration:none; color:inherit; }
  .tile img { width:100%; aspect-ratio:16/10; object-fit:cover; border-radius:12px; background:#000; display:block; }
  .tile strong { display:block; margin-top:8px; font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .empty { text-align:center; padding:64px 20px; color:var(--muted); }
  code { background:rgba(127,127,127,.12); padding:2px 6px; border-radius:6px; }
`;

function imagePage(record: UploadRecord): string {
  const created = new Date(record.createdAt).toLocaleString();
  const title = record.originalName || `Screenshot ${record.id}`;
  const width = record.width;
  const height = record.height;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escapeHtml(title)} · Snapleaf</title>
<meta property="og:title" content="${escapeHtml(title)}"/>
<meta property="og:description" content="Shared with Snapleaf"/>
<meta property="og:image" content="${escapeHtml(record.fileUrl)}"/>
<meta name="twitter:card" content="summary_large_image"/>
<style>${pageStyles}</style></head>
<body><main>
<header><div class="brand"><span class="mark">S</span> Snapleaf</div><span class="meta">${escapeHtml(created)}</span></header>
<section class="card">
  <img class="preview" src="/i/${encodeURIComponent(record.id)}" alt="${escapeHtml(title)}"/>
  <div class="buttons">
    <button class="primary" id="copy">Copy image link</button>
    <a class="button" href="/i/${encodeURIComponent(record.id)}?download=1">Download image</a>
    <a class="button" href="/">Gallery</a>
  </div>
  <p class="meta">${width} × ${height} px · ${(record.bytes / 1024).toFixed(1)} KB · <code>${escapeHtml(record.id)}</code></p>
</section></main>
<script>
const button = document.getElementById('copy');
button.addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(location.href); button.textContent = 'Copied!'; setTimeout(() => button.textContent = 'Copy image link', 1600); }
  catch { prompt('Copy this link', location.href); }
});
</script></body></html>`;
}

function galleryPage(records: UploadRecord[]): string {
  const tiles = records
    .map(
      (record) => `<a class="tile" href="/p/${encodeURIComponent(record.id)}">
        <img loading="lazy" src="/i/${encodeURIComponent(record.id)}" alt="${escapeHtml(record.originalName || record.id)}"/>
        <strong>${escapeHtml(record.originalName || record.id)}</strong>
        <span class="meta">${record.width} × ${record.height} · ${new Date(record.createdAt).toLocaleDateString()}</span>
      </a>`
    )
    .join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Snapleaf gallery</title><style>${pageStyles}</style></head>
<body><main>
<header><div class="brand"><span class="mark">S</span> Snapleaf gallery</div><span class="meta">${records.length} image${records.length === 1 ? '' : 's'}</span></header>
${records.length ? `<div class="grid">${tiles}</div>` : `<div class="card empty">No uploads yet. Capture something with Snapleaf.</div>`}
</main></body></html>`;
}

export class UploadServer {
  private server: Server | null = null;
  private port = 0;
  private lastError: string | undefined;
  private starting: Promise<ServerInfo> | null = null;

  constructor(
    private readonly settings: SettingsStore,
    private readonly library: Library
  ) {}

  private baseInfo(): ServerInfo {
    const settings = this.settings.get();
    const lan = lanAddress();
    const localUrl = this.port ? `http://127.0.0.1:${this.port}` : '';
    const lanUrl = this.port ? `http://${lan}:${this.port}` : '';
    const publicBaseUrl = settings.upload.publicBaseUrl.trim().replace(/\/+$/, '');
    const effectiveBaseUrl = publicBaseUrl || lanUrl || localUrl;
    return {
      running: this.server !== null,
      port: this.port,
      localUrl,
      lanUrl,
      publicBaseUrl,
      effectiveBaseUrl,
      error: this.lastError
    };
  }

  getInfo(): ServerInfo {
    return this.baseInfo();
  }

  async start(): Promise<ServerInfo> {
    if (this.starting) return this.starting;
    this.starting = this.startInternal();
    try {
      return await this.starting;
    } finally {
      this.starting = null;
    }
  }

  private async startInternal(): Promise<ServerInfo> {
    const settings = this.settings.get();
    if (!settings.upload.localServer) {
      await this.stop();
      this.lastError = undefined;
      return this.getInfo();
    }
    if (this.server) return this.getInfo();
    await this.stop();
    const requestedPort = settings.upload.port;
    try {
      await this.listen(requestedPort);
      this.lastError = undefined;
    } catch (error) {
      log.warn('Preferred upload port unavailable; using an ephemeral port', { port: requestedPort, error: String(error) });
      try {
        await this.listen(0);
        this.lastError = `Port ${requestedPort} was busy, so Snapleaf is using port ${this.port}.`;
      } catch (fallbackError) {
        this.lastError = String(fallbackError);
        log.error('Local upload server could not start', { error: String(fallbackError) });
      }
    }
    return this.getInfo();
  }

  private listen(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = createServer((request, response) => {
        this.handle(request, response).catch((error) => {
          log.error('Upload server request failed', { error: String(error) });
          if (!response.headersSent) {
            response.writeHead(500, { 'content-type': 'application/json' });
          }
          response.end(JSON.stringify({ error: 'Internal server error' }));
        });
      });
      const onError = (error: NodeJS.ErrnoException) => {
        server.removeAllListeners();
        server.close();
        reject(error);
      };
      server.once('error', onError);
      server.listen(port, '0.0.0.0', () => {
        server.off('error', onError);
        server.on('error', (error) => log.error('Upload server error', { error: String(error) }));
        this.server = server;
        this.port = (server.address() as { port?: number } | null)?.port ?? port;
        log.info('Local upload server listening', { port: this.port });
        resolve();
      });
    });
  }

  async restart(): Promise<ServerInfo> {
    await this.stop();
    return this.start();
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = null;
    this.port = 0;
    if (!server) return;
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      setTimeout(resolve, 1500);
    });
  }

  storeUpload(
    buffer: Buffer,
    meta: { format: 'png' | 'jpeg'; width?: number; height?: number; originalName?: string }
  ): UploadRecord {
    const info = this.getInfo();
    if (!info.running) throw new Error(info.error || 'Local upload server is not running');
    let width = meta.width ?? 0;
    let height = meta.height ?? 0;
    if (!width || !height) {
      const image = nativeImage.createFromBuffer(buffer);
      const size = image.getSize();
      width = size.width;
      height = size.height;
    }
    if (!width || !height) throw new Error('Uploaded image could not be decoded');
    return this.library.addUpload(buffer, {
      format: meta.format,
      width,
      height,
      originalName: meta.originalName,
      baseUrl: info.effectiveBaseUrl
    });
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);
    const path = url.pathname;

    if (request.method === 'GET' && path === '/health') {
      return this.json(response, 200, { ok: true, images: this.library.list().uploads.length });
    }
    if (request.method === 'GET' && path === '/') {
      const records = this.library.list().uploads;
      return this.html(response, 200, galleryPage(records));
    }
    if (request.method === 'GET' && path === '/api/images') {
      return this.json(response, 200, { images: this.library.list().uploads, server: this.getInfo() });
    }
    if (request.method === 'POST' && path === '/api/upload') {
      const contentType = String(request.headers['content-type'] ?? '');
      if (!contentType.startsWith('image/png') && !contentType.startsWith('image/jpeg')) {
        return this.json(response, 415, { error: 'Send image/png or image/jpeg' });
      }
      const body = await readBody(request, MAX_UPLOAD_BYTES);
      const format = contentType.startsWith('image/jpeg') ? 'jpeg' : 'png';
      const originalName = String(request.headers['x-snapleaf-name'] ?? '').slice(0, 160) || undefined;
      const record = this.storeUpload(body, {
        format,
        originalName,
        width: Number(request.headers['x-snapleaf-width']) || undefined,
        height: Number(request.headers['x-snapleaf-height']) || undefined
      });
      return this.json(response, 201, { record, server: this.getInfo() });
    }
    const imageMatch = /^\/i\/([A-Za-z0-9_-]{4,32})$/.exec(path);
    if (request.method === 'GET' && imageMatch) {
      const record = this.library.getUpload(imageMatch[1]);
      if (!record || !existsSync(record.path)) return this.notFound(response);
      const body = readFileSync(record.path);
      const download = url.searchParams.get('download') === '1';
      response.writeHead(200, {
        'content-type': record.format === 'jpeg' ? 'image/jpeg' : 'image/png',
        'content-length': body.byteLength,
        'cache-control': 'public, max-age=31536000, immutable',
        'x-content-type-options': 'nosniff',
        ...(download
          ? { 'content-disposition': `attachment; filename="snapleaf-${record.id}.${record.format === 'jpeg' ? 'jpg' : 'png'}"` }
          : {})
      });
      response.end(body);
      return;
    }
    const pageMatch = /^\/p\/([A-Za-z0-9_-]{4,32})$/.exec(path);
    if (request.method === 'GET' && pageMatch) {
      const record = this.library.getUpload(pageMatch[1]);
      if (!record) return this.notFound(response);
      return this.html(response, 200, imagePage(record));
    }
    const deleteMatch = /^\/api\/images\/([A-Za-z0-9_-]{4,32})$/.exec(path);
    if (request.method === 'DELETE' && deleteMatch) {
      if (!isLoopback(request)) return this.json(response, 403, { error: 'Deleting images is limited to this computer' });
      const removed = this.library.deleteUpload(deleteMatch[1]);
      return this.json(response, removed ? 200 : 404, { removed });
    }
    if (request.method === 'GET' && path === '/favicon.ico') {
      response.writeHead(204).end();
      return;
    }
    return this.notFound(response);
  }

  private json(response: ServerResponse, status: number, value: unknown): void {
    const body = Buffer.from(JSON.stringify(value));
    response.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': body.byteLength,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff'
    });
    response.end(body);
  }

  private html(response: ServerResponse, status: number, value: string): void {
    const body = Buffer.from(value);
    response.writeHead(status, {
      'content-type': 'text/html; charset=utf-8',
      'content-length': body.byteLength,
      'content-security-policy': "default-src 'self'; img-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'",
      'x-content-type-options': 'nosniff'
    });
    response.end(body);
  }

  private notFound(response: ServerResponse): void {
    this.json(response, 404, { error: 'Not found' });
  }
}
