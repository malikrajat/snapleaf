import { nativeImage } from 'electron';
import { EventEmitter } from 'node:events';
import {
  copyFileSync,
  existsSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync
} from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { CaptureRecord, CaptureSource, GalleryData, UploadRecord } from '../shared/types';
import { parseDataUrl } from '../shared/format';
import { appPaths } from './paths';
import { log } from './logger';

interface LibraryFile {
  version: number;
  captures: CaptureRecord[];
  uploads: UploadRecord[];
}

function randomId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${randomBytes(4).toString('hex')}`;
}

function isInside(parent: string, child: string): boolean {
  const root = resolve(parent) + sep;
  return resolve(child).startsWith(root);
}

export class Library extends EventEmitter {
  private data: LibraryFile;

  constructor() {
    super();
    this.data = this.load();
    this.prune();
  }

  private load(): LibraryFile {
    try {
      const parsed = JSON.parse(readFileSync(appPaths().libraryFile, 'utf8')) as Partial<LibraryFile>;
      return {
        version: 1,
        captures: Array.isArray(parsed.captures) ? parsed.captures : [],
        uploads: Array.isArray(parsed.uploads) ? parsed.uploads : []
      };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') log.warn('Could not read library index', { error: String(error) });
      return { version: 1, captures: [], uploads: [] };
    }
  }

  private persist(): void {
    const file = appPaths().libraryFile;
    const temporary = `${file}.tmp`;
    try {
      writeFileSync(temporary, `${JSON.stringify(this.data, null, 2)}\n`, 'utf8');
      renameSync(temporary, file);
    } catch (error) {
      log.error('Could not persist library index', { error: String(error) });
    }
  }

  private prune(): void {
    const before = this.data.captures.length + this.data.uploads.length;
    this.data.captures = this.data.captures.filter((record) => existsSync(record.path));
    this.data.uploads = this.data.uploads.filter((record) => existsSync(record.path));
    if (this.data.captures.length + this.data.uploads.length !== before) this.persist();
  }

  list(): GalleryData {
    this.prune();
    return {
      captures: [...this.data.captures].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      uploads: [...this.data.uploads].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    };
  }

  addCapture(dataUrl: string, source: CaptureSource, displayLabel?: string): CaptureRecord {
    const { buffer, mime } = parseDataUrl(dataUrl);
    if (mime !== 'image/png' && mime !== 'image/jpeg') throw new Error('Capture must be a PNG or JPEG image');
    const image = nativeImage.createFromBuffer(buffer);
    const size = image.getSize();
    if (!size.width || !size.height) throw new Error('Capture image could not be decoded');
    const id = randomId('cap');
    const filename = `${id}.png`;
    const path = join(appPaths().captures, filename);
    writeFileSync(path, buffer);
    const record: CaptureRecord = {
      id,
      filename,
      path,
      url: `snapleaf://capture/${filename}`,
      width: size.width,
      height: size.height,
      bytes: buffer.byteLength,
      createdAt: new Date().toISOString(),
      source,
      displayLabel
    };
    this.data.captures.unshift(record);
    this.persist();
    this.emit('changed');
    return record;
  }

  importImage(sourcePath: string): CaptureRecord {
    if (!existsSync(sourcePath)) throw new Error('Image not found');
    const ext = extname(sourcePath).toLowerCase();
    const supported = ['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif'];
    if (!supported.includes(ext)) throw new Error('Unsupported image type');
    const buffer = readFileSync(sourcePath);
    const image = nativeImage.createFromBuffer(buffer);
    const size = image.getSize();
    if (!size.width || !size.height) throw new Error('Image could not be decoded');
    const id = randomId('img');
    const filename = `${id}${ext === '.jpeg' ? '.jpg' : ext}`;
    const path = join(appPaths().captures, filename);
    copyFileSync(sourcePath, path);
    const record: CaptureRecord = {
      id,
      filename,
      path,
      url: `snapleaf://capture/${filename}`,
      width: size.width,
      height: size.height,
      bytes: statSync(path).size,
      createdAt: new Date().toISOString(),
      source: 'file'
    };
    this.data.captures.unshift(record);
    this.persist();
    this.emit('changed');
    return record;
  }

  getCapture(id: string): CaptureRecord | null {
    return this.data.captures.find((record) => record.id === id) ?? null;
  }

  getUpload(id: string): UploadRecord | null {
    return this.data.uploads.find((record) => record.id === id) ?? null;
  }

  addUpload(
    buffer: Buffer,
    meta: {
      format: 'png' | 'jpeg';
      width: number;
      height: number;
      originalName?: string;
      baseUrl: string;
    }
  ): UploadRecord {
    const id = randomBytes(5).toString('base64url').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || randomId('up');
    const extension = meta.format === 'jpeg' ? 'jpg' : 'png';
    const filename = `${id}.${extension}`;
    const path = join(appPaths().uploads, filename);
    writeFileSync(path, buffer);
    const base = meta.baseUrl.replace(/\/+$/, '');
    const record: UploadRecord = {
      id,
      filename,
      path,
      localUrl: `snapleaf://upload/${filename}`,
      fileUrl: `${base}/i/${id}`,
      pageUrl: `${base}/p/${id}`,
      width: Math.max(1, Math.round(meta.width)),
      height: Math.max(1, Math.round(meta.height)),
      bytes: buffer.byteLength,
      createdAt: new Date().toISOString(),
      format: meta.format,
      originalName: meta.originalName
    };
    this.data.uploads.unshift(record);
    this.persist();
    this.emit('changed');
    return record;
  }

  deleteCapture(id: string): boolean {
    const index = this.data.captures.findIndex((record) => record.id === id);
    if (index < 0) return false;
    const [record] = this.data.captures.splice(index, 1);
    this.removeFile(record.path, appPaths().captures);
    this.persist();
    this.emit('changed');
    return true;
  }

  deleteUpload(id: string): boolean {
    const index = this.data.uploads.findIndex((record) => record.id === id);
    if (index < 0) return false;
    const [record] = this.data.uploads.splice(index, 1);
    this.removeFile(record.path, appPaths().uploads);
    this.persist();
    this.emit('changed');
    return true;
  }

  private removeFile(path: string, parent: string): void {
    if (!isInside(parent, path)) {
      log.warn('Refused to remove a file outside its library directory', { path });
      return;
    }
    try {
      if (existsSync(path)) unlinkSync(path);
    } catch (error) {
      log.warn('Could not remove library file', { path, error: String(error) });
    }
  }
}
