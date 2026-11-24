import { useEffect, useMemo, useState } from 'react';
import {
  Camera,
  Check,
  Copy,
  ExternalLink,
  FolderOpen,
  Images,
  Link2,
  Loader2,
  RefreshCw,
  Search,
  Settings,
  Trash2
} from 'lucide-react';
import type { CaptureRecord, GalleryData, UploadRecord } from '@shared/types';
import { formatBytes, formatRelativeTime } from '@shared/format';
import { api, errorMessage } from '../lib/api';
import { useAppInfo } from '../lib/hooks';
import { toast } from '../lib/toast';
import { Logo } from '../components/Logo';

type Tab = 'captures' | 'uploads';

export function GalleryPage() {
  const info = useAppInfo();
  const [tab, setTab] = useState<Tab>('captures');
  const [data, setData] = useState<GalleryData | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api.library
      .list()
      .then((value) => {
        setData(value);
        setError(null);
      })
      .catch((reason) => setError(errorMessage(reason)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    window.addEventListener('focus', load);
    const unsubscribe = api.library.onChanged(load);
    return () => {
      window.removeEventListener('focus', load);
      unsubscribe();
    };
  }, []);

  const captures = useMemo(() => {
    const items = data?.captures ?? [];
    const term = query.trim().toLowerCase();
    return term ? items.filter((item) => item.filename.toLowerCase().includes(term)) : items;
  }, [data?.captures, query]);

  const uploads = useMemo(() => {
    const items = data?.uploads ?? [];
    const term = query.trim().toLowerCase();
    return term
      ? items.filter((item) => item.id.toLowerCase().includes(term) || (item.originalName ?? '').toLowerCase().includes(term))
      : items;
  }, [data?.uploads, query]);

  const copyLink = async (record: UploadRecord) => {
    try {
      await api.upload.copyText(record.pageUrl);
      setCopied(record.id);
      window.setTimeout(() => setCopied(null), 1600);
      toast('Link copied', 'success');
    } catch (reason) {
      toast(errorMessage(reason), 'error');
    }
  };

  const deleteCapture = async (record: CaptureRecord) => {
    if (!window.confirm(`Delete ${record.filename}?`)) return;
    try {
      await api.library.deleteCapture(record.id);
      load();
      toast('Screenshot deleted', 'success');
    } catch (reason) {
      toast(errorMessage(reason), 'error');
    }
  };

  const deleteUpload = async (record: UploadRecord) => {
    if (!window.confirm('Delete this shared image? The link will stop working.')) return;
    try {
      await api.library.deleteUpload(record.id);
      load();
      toast('Shared image deleted', 'success');
    } catch (reason) {
      toast(errorMessage(reason), 'error');
    }
  };

  return (
    <div className="gallery-shell">
      <header className="page-header">
        <div className="page-heading">
          <Logo size={26} />
          <div>
            <h1>Gallery</h1>
            <p>{data ? `${data.captures.length} capture${data.captures.length === 1 ? '' : 's'} · ${data.uploads.length} shared link${data.uploads.length === 1 ? '' : 's'}` : 'Loading your screenshots…'}</p>
          </div>
        </div>
        <div className="page-header-right">
          <button type="button" className="button ghost" onClick={() => void api.capture.startRegion()}>
            <Camera size={16} /> Capture
          </button>
          <button type="button" className="icon-button" title="Open captures folder" onClick={() => void api.library.openCapturesFolder()}>
            <FolderOpen size={17} />
          </button>
          <button type="button" className="icon-button" title="Settings" onClick={() => api.app.openSettings()}>
            <Settings size={17} />
          </button>
          <button type="button" className="icon-button" title="Close gallery" onClick={() => api.app.close()}>
            <span aria-hidden="true">×</span>
          </button>
        </div>
      </header>

      <div className="gallery-toolbar">
        <div className="tabs">
          <button type="button" className={tab === 'captures' ? 'active' : ''} onClick={() => setTab('captures')}>
            <Images size={15} /> Captures <span>{data?.captures.length ?? 0}</span>
          </button>
          <button type="button" className={tab === 'uploads' ? 'active' : ''} onClick={() => setTab('uploads')}>
            <Link2 size={15} /> Shared <span>{data?.uploads.length ?? 0}</span>
          </button>
        </div>
        <div className="gallery-tools">
          <label className="search-field">
            <Search size={15} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search…" />
          </label>
          <button type="button" className="icon-button" title="Refresh" onClick={load}>
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      <main className="gallery-content">
        {loading ? (
          <div className="gallery-loading"><Loader2 size={22} className="spin" /> Loading gallery…</div>
        ) : error ? (
          <div className="empty-card gallery-empty"><p>{error}</p><button type="button" className="button" onClick={load}>Try again</button></div>
        ) : tab === 'captures' ? (
          captures.length ? (
            <div className="media-grid">
              {captures.map((record) => (
                <article className="media-card" key={record.id}>
                  <button type="button" className="media-thumb" onClick={() => void api.library.openCapture(record.id)}>
                    <img src={record.url} alt={record.filename} loading="lazy" />
                  </button>
                  <div className="media-meta">
                    <strong title={record.filename}>{record.filename}</strong>
                    <span>{record.width} × {record.height} · {formatBytes(record.bytes)} · {formatRelativeTime(record.createdAt)}</span>
                  </div>
                  <div className="media-actions">
                    <button type="button" className="mini-button" onClick={() => void api.library.openCapture(record.id)}>Edit</button>
                    <button type="button" className="mini-icon" title="Open folder" onClick={() => void api.app.showItemInFolder(record.path)}>
                      <FolderOpen size={14} />
                    </button>
                    <button type="button" className="mini-icon danger" title="Delete" onClick={() => void deleteCapture(record)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-card gallery-empty">
              <span className="empty-icon"><Camera size={22} /></span>
              <div><strong>No captures yet</strong><p>Capture a region or open an image to fill the gallery.</p></div>
              <button type="button" className="button primary" onClick={() => void api.capture.startRegion()}>Capture now</button>
            </div>
          )
        ) : uploads.length ? (
          <div className="media-grid">
            {uploads.map((record) => (
              <article className="media-card" key={record.id}>
                <button type="button" className="media-thumb" onClick={() => void api.app.openExternal(record.pageUrl)}>
                  <img src={record.localUrl} alt={record.originalName ?? record.id} loading="lazy" />
                  <span className="shared-badge"><Link2 size={12} /> Shared</span>
                </button>
                <div className="media-meta">
                  <strong title={record.originalName ?? record.id}>{record.originalName ?? record.id}</strong>
                  <span>{record.width} × {record.height} · {formatBytes(record.bytes)} · {formatRelativeTime(record.createdAt)}</span>
                  <code className="media-url" title={record.pageUrl}>{record.pageUrl}</code>
                </div>
                <div className="media-actions">
                  <button type="button" className="mini-button" onClick={() => void copyLink(record)}>
                    {copied === record.id ? <Check size={13} /> : <Copy size={13} />} {copied === record.id ? 'Copied' : 'Copy link'}
                  </button>
                  <button type="button" className="mini-icon" title="Open share page" onClick={() => void api.app.openExternal(record.pageUrl)}>
                    <ExternalLink size={14} />
                  </button>
                  <button type="button" className="mini-icon" title="Open uploads folder" onClick={() => void api.library.openUploadsFolder()}>
                    <FolderOpen size={14} />
                  </button>
                  <button type="button" className="mini-icon danger" title="Delete link" onClick={() => void deleteUpload(record)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-card gallery-empty">
            <span className="empty-icon"><Link2 size={22} /></span>
            <div><strong>No shared images</strong><p>Use Share in the editor to create a local link. Nothing leaves your network unless you set a public base URL.</p></div>
            <button type="button" className="button" onClick={() => api.app.openSettings()}>Open sharing settings</button>
          </div>
        )}
      </main>

      <footer className="gallery-footer">
        <span>{tab === 'captures' ? info?.capturesDir : info?.uploadsDir}</span>
        <button
          type="button"
          className="mini-button"
          onClick={() =>
            void (tab === 'captures' ? api.library.openCapturesFolder() : api.library.openUploadsFolder())
          }
        >
          <FolderOpen size={13} /> {tab === 'captures' ? 'Captures folder' : 'Uploads folder'}
        </button>
      </footer>
    </div>
  );
}
