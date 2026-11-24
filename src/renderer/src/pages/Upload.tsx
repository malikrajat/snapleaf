import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  FolderOpen,
  Globe,
  Images,
  Link2,
  Loader2,
  Mail,
  MessageCircle,
  QrCode,
  Search,
  Share2,
  Trash2,
  Users
} from 'lucide-react';
import QRCode from 'qrcode';
import type { UploadRecord } from '@shared/types';
import { formatBytes, formatRelativeTime, isLocalUrl } from '@shared/format';
import { api, errorMessage } from '../lib/api';
import { useSettings } from '../lib/hooks';
import { toast } from '../lib/toast';
import { Logo } from '../components/Logo';

export function UploadPage({ id }: { id: string }) {
  const { settings } = useSettings();
  const [record, setRecord] = useState<UploadRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState<'page' | 'image' | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);

  useEffect(() => {
    if (!id) {
      setError('Missing image id.');
      return;
    }
    api.upload
      .get(id)
      .then((value) => {
        if (!value) setError('This shared image was not found.');
        else setRecord(value);
      })
      .catch((reason) => setError(errorMessage(reason)));
  }, [id]);

  useEffect(() => {
    if (!record) return;
    QRCode.toDataURL(record.pageUrl, {
      margin: 1,
      width: 320,
      color: { dark: '#0f1216ff', light: '#ffffffff' }
    })
      .then(setQr)
      .catch(() => undefined);
  }, [record]);

  useEffect(() => {
    if (!settings?.upload.autoCloseWindow || !record) return;
    setCountdown(3);
    const timer = window.setInterval(() => {
      setCountdown((value) => {
        if (value === null) return null;
        if (value <= 1) {
          window.clearInterval(timer);
          api.app.close();
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [record, settings?.upload.autoCloseWindow]);

  const local = record ? isLocalUrl(record.pageUrl) : false;

  const copy = async (kind: 'page' | 'image') => {
    if (!record) return;
    try {
      await api.upload.copyText(kind === 'page' ? record.pageUrl : record.fileUrl);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 1800);
      toast(kind === 'page' ? 'Page link copied' : 'Direct image link copied', 'success');
    } catch (reason) {
      toast(errorMessage(reason), 'error');
    }
  };

  const remove = async () => {
    if (!record) return;
    if (!window.confirm('Delete this shared image? The link will stop working.')) return;
    try {
      await api.library.deleteUpload(record.id);
      toast('Shared image deleted', 'success');
      api.app.close();
    } catch (reason) {
      toast(errorMessage(reason), 'error');
    }
  };

  const shareLinks = useMemo(() => {
    if (!record) return [];
    const url = encodeURIComponent(record.pageUrl);
    const media = encodeURIComponent(record.fileUrl);
    const text = encodeURIComponent('Screenshot shared with Snapleaf');
    return [
      { label: 'X / Twitter', icon: MessageCircle, href: `https://twitter.com/intent/tweet?url=${url}&text=${text}` },
      { label: 'Facebook', icon: Users, href: `https://www.facebook.com/sharer/sharer.php?u=${url}` },
      { label: 'Email', icon: Mail, href: `mailto:?subject=Snapleaf%20screenshot&body=${text}%20${url}` },
      { label: 'Pinterest', icon: Images, href: `https://pinterest.com/pin/create/button/?url=${url}&media=${media}&description=${text}` },
      { label: 'VK', icon: Share2, href: `https://vk.com/share.php?url=${url}` },
      { label: 'Google Lens', icon: Globe, href: `https://lens.google.com/uploadbyurl?url=${media}` },
      { label: 'TinEye', icon: Search, href: `https://tineye.com/search?url=${media}` }
    ];
  }, [record]);

  if (error) {
    return (
      <div className="fatal">
        <div className="fatal-card">
          <h1>Shared image unavailable</h1>
          <p>{error}</p>
          <div className="fatal-actions">
            <button type="button" className="button primary" onClick={() => api.app.close()}>Close</button>
            <button type="button" className="button ghost" onClick={() => api.app.openGallery()}>
              <Images size={15} /> Open gallery
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!record) {
    return (
      <div className="settings-loading">
        <Loader2 size={22} className="spin" />
        <span>Loading shared image…</span>
      </div>
    );
  }

  return (
    <div className="upload-shell">
      <header className="page-header">
        <div className="page-heading">
          <Logo size={26} />
          <div>
            <h1>Shared screenshot</h1>
            <p>Stored locally on this computer · {formatRelativeTime(record.createdAt)}</p>
          </div>
        </div>
        <div className="page-header-right">
          {countdown !== null ? <span className="save-status">Closing in {countdown}s</span> : null}
          <button type="button" className="icon-button" title="Open gallery" onClick={() => api.app.openGallery()}>
            <Images size={17} />
          </button>
          <button type="button" className="icon-button" title="Close" onClick={() => api.app.close()}>
            <span aria-hidden="true">×</span>
          </button>
        </div>
      </header>

      <main className="upload-main">
        <section className="upload-preview-card">
          <img src={record.localUrl} alt={record.originalName ?? 'Shared screenshot'} />
          <div className="upload-preview-meta">
            <span>{record.width} × {record.height} · {formatBytes(record.bytes)}</span>
            <span className="shared-chip"><Link2 size={13} /> Local link</span>
          </div>
        </section>

        <section className="upload-details">
          <div className="upload-success">
            <span className="success-icon"><Check size={20} /></span>
            <div>
              <h2>Image ready to share</h2>
              <p>{local ? 'This link works on this computer and your local network.' : 'This link is using your public base URL.'}</p>
            </div>
          </div>

          <div className="link-box">
            <label>Share page</label>
            <div className="link-row">
              <code>{record.pageUrl}</code>
              <button type="button" className="button ghost" onClick={() => void copy('page')}>
                {copied === 'page' ? <Check size={15} /> : <Copy size={15} />} {copied === 'page' ? 'Copied' : 'Copy'}
              </button>
              <button type="button" className="icon-button" title="Open page" onClick={() => void api.app.openExternal(record.pageUrl)}>
                <ExternalLink size={15} />
              </button>
            </div>
          </div>

          <div className="link-box">
            <label>Direct image</label>
            <div className="link-row">
              <code>{record.fileUrl}</code>
              <button type="button" className="button ghost" onClick={() => void copy('image')}>
                {copied === 'image' ? <Check size={15} /> : <Copy size={15} />} {copied === 'image' ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          {local ? (
            <p className="settings-note">
              <QrCode size={14} />
              For sharing outside your network, set a public base URL in Settings → Sharing and point a tunnel or reverse proxy at port {new URL(record.pageUrl).port}.
            </p>
          ) : null}

          <div className="share-row">
            {shareLinks.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  type="button"
                  className="share-button"
                  onClick={() => void api.app.openExternal(item.href)}
                  title={item.label}
                >
                  <Icon size={16} />
                  {item.label}
                </button>
              );
            })}
          </div>

          <div className="upload-actions">
            <button type="button" className="button primary" onClick={() => void copy('page')}>
              <Copy size={15} /> Copy link
            </button>
            <button type="button" className="button ghost" onClick={() => void api.app.showItemInFolder(record.path)}>
              <FolderOpen size={15} /> Show file
            </button>
            <button type="button" className="button ghost" onClick={() => api.app.close()}>
              Done
            </button>
            <button type="button" className="button danger" onClick={() => void remove()}>
              <Trash2 size={15} /> Delete
            </button>
          </div>
        </section>

        {qr ? (
          <aside className="qr-card">
            <img src={qr} alt="QR code for share link" />
            <span>Scan to open the page</span>
          </aside>
        ) : null}
      </main>
    </div>
  );
}
