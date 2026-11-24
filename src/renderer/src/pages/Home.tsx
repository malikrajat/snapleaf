import { useEffect, useState } from 'react';
import {
  ArrowRight,
  Camera,
  CheckCircle2,
  FolderOpen,
  Images,
  ImagePlus,
  Keyboard,
  Link2,
  Monitor,
  Settings,
  ShieldCheck,
  Sparkles
} from 'lucide-react';
import type { GalleryData } from '@shared/types';
import { formatBytes, formatRelativeTime } from '@shared/format';
import { api } from '../lib/api';
import { useAppInfo, useHotkeyStatus, useSettings, useUpdates } from '../lib/hooks';
import { formatAccelerator } from '../lib/hotkey';
import { Wordmark } from '../components/Logo';
import { Spinner } from '../components/Spinner';
import { UpdatePrompt } from '../components/UpdatePrompt';

export function HomePage() {
  const { settings } = useSettings();
  const info = useAppInfo();
  const statuses = useHotkeyStatus();
  const [library, setLibrary] = useState<GalleryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const { result: updateResult, dismiss: dismissUpdate } = useUpdates(true);

  const load = () => {
    api.library
      .list()
      .then(setLibrary)
      .catch(() => undefined)
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

  const captureStatus = statuses.find((status) => status.id === 'capture');
  const hotkey = settings ? formatAccelerator(settings.hotkeys.capture.accelerator) : 'PrtSc';
  const hotkeyEnabled = settings?.hotkeys.capture.enabled;
  const hotkeyBroken = Boolean(settings?.hotkeys.capture.enabled && captureStatus && !captureStatus.registered);
  const recent = library?.captures.slice(0, 6) ?? [];

  const startRegion = async () => {
    setStarting(true);
    try {
      await api.capture.startRegion();
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="home-shell">
      <header className="home-topbar">
        <Wordmark />
        <div className="home-top-actions">
          <button type="button" className="button ghost" onClick={() => api.app.openGallery()}>
            <Images size={16} /> Gallery
          </button>
          <button type="button" className="button ghost" onClick={() => api.app.openSettings()}>
            <Settings size={16} /> Settings
          </button>
        </div>
      </header>

      <main className="home-main">
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow"><Sparkles size={14} /> The screenshot tool that stays out of your way</div>
            <h1>Capture it. Mark it. Share it.</h1>
            <p>
              Select any part of your screen, add clear annotations in seconds, and copy, save,
              or share a link. Local-first by default — no account, no upload required.
            </p>
            <div className="hero-actions">
              <button type="button" className="button primary large" onClick={() => void startRegion()} disabled={starting}>
                {starting ? <Spinner label="" /> : <Camera size={19} />}
                Capture a region
                <kbd>{hotkey}</kbd>
              </button>
              <button type="button" className="button large" onClick={() => void api.capture.startFullscreen('edit')}>
                <Monitor size={18} />
                Full screen
              </button>
            </div>
            {hotkeyBroken ? (
              <button type="button" className="inline-warning" onClick={() => api.app.openSettings()}>
                <Keyboard size={15} />
                {captureStatus?.error || 'Your capture shortcut is not registered.'} Fix it
                <ArrowRight size={14} />
              </button>
            ) : null}
            {hotkeyEnabled === false ? (
              <button type="button" className="inline-note" onClick={() => api.app.openSettings()}>
                <Keyboard size={15} />
                Capture shortcut is off. Set one in Settings.
                <ArrowRight size={14} />
              </button>
            ) : null}
            <div className="trust-row">
              <span><ShieldCheck size={15} /> Private by default</span>
              <span><CheckCircle2 size={15} /> No account needed</span>
              <span><FolderOpen size={15} /> Your files, your folder</span>
            </div>
          </div>

          <div className="hero-visual" aria-hidden="true">
            <div className="mock-window">
              <div className="mock-titlebar">
                <i /><i /><i />
                <span>Project overview</span>
              </div>
              <div className="mock-body">
                <div className="mock-sidebar">
                  <span className="mock-pill active" />
                  <span className="mock-pill" />
                  <span className="mock-pill short" />
                  <span className="mock-pill" />
                </div>
                <div className="mock-content">
                  <div className="mock-heading" />
                  <div className="mock-chart">
                    <span style={{ height: '35%' }} />
                    <span style={{ height: '58%' }} />
                    <span style={{ height: '44%' }} />
                    <span style={{ height: '76%' }} />
                    <span style={{ height: '62%' }} />
                    <span style={{ height: '88%' }} />
                  </div>
                  <div className="mock-row"><i /><b /></div>
                  <div className="mock-row"><i /><b /></div>
                </div>
              </div>
              <div className="mock-selection">
                <span className="mock-size">684 × 392</span>
              </div>
              <div className="mock-arrow" />
              <div className="mock-note">Explain it clearly</div>
              <div className="mock-toolbar">
                <span><Camera size={15} /></span>
                <span className="active"><Sparkles size={14} /></span>
                <span><Link2 size={14} /></span>
              </div>
            </div>
            <div className="hero-glow" />
          </div>
        </section>

        <section className="quick-grid">
          <button type="button" className="quick-card" onClick={() => void api.capture.startRegion()}>
            <span className="quick-icon"><Camera size={20} /></span>
            <strong>Capture region</strong>
            <span>Drag any area of your screen</span>
            <kbd>{hotkey}</kbd>
          </button>
          <button type="button" className="quick-card" onClick={() => void api.capture.startFullscreen('edit')}>
            <span className="quick-icon"><Monitor size={20} /></span>
            <strong>Full screen</strong>
            <span>Grab the display under your cursor</span>
          </button>
          <button type="button" className="quick-card" onClick={() => void api.library.importImage()}>
            <span className="quick-icon"><ImagePlus size={20} /></span>
            <strong>Open an image</strong>
            <span>Annotate an existing screenshot</span>
          </button>
          <button type="button" className="quick-card" onClick={() => api.app.openGallery()}>
            <span className="quick-icon"><Images size={20} /></span>
            <strong>Gallery</strong>
            <span>Recent captures and shared links</span>
          </button>
        </section>

        <section className="recent-section">
          <div className="section-heading">
            <div>
              <h2>Recent captures</h2>
              <p>Editor screenshots and imported images stay on this computer.</p>
            </div>
            {recent.length ? (
              <button type="button" className="button ghost" onClick={() => api.app.openGallery()}>
                View all <ArrowRight size={15} />
              </button>
            ) : null}
          </div>
          {loading ? (
            <div className="recent-grid">
              <div className="skeleton recent-skeleton" />
              <div className="skeleton recent-skeleton" />
              <div className="skeleton recent-skeleton" />
            </div>
          ) : recent.length ? (
            <div className="recent-grid">
              {recent.map((record) => (
                <button
                  key={record.id}
                  type="button"
                  className="recent-card"
                  onClick={() => void api.library.openCapture(record.id)}
                >
                  <img src={record.url} alt="" loading="lazy" />
                  <span className="recent-meta">
                    <strong>{record.filename}</strong>
                    <span>{record.width} × {record.height} · {formatBytes(record.bytes)} · {formatRelativeTime(record.createdAt)}</span>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="empty-card">
              <span className="empty-icon"><Camera size={22} /></span>
              <div>
                <strong>Your captures will show up here</strong>
                <p>Press {hotkey} or use “Capture a region” to make your first screenshot.</p>
              </div>
            </div>
          )}
        </section>

        <section className="how-section">
          <h2>Three steps, no friction</h2>
          <div className="how-grid">
            <div><span>1</span><strong>Capture</strong><p>Press {hotkey}, drag a box, and the overlay gets out of the way.</p></div>
            <div><span>2</span><strong>Mark up</strong><p>Pen, arrows, boxes, text, highlights, and pixelate — with undo and redo.</p></div>
            <div><span>3</span><strong>Share</strong><p>Copy, save, print, or share a self-hosted link from the built-in gallery.</p></div>
          </div>
        </section>
      </main>

      <footer className="home-footer">
        <span>
          Snapleaf {info?.version ? `v${info.version}` : ''} · Built by{' '}
          <button type="button" className="footer-link" onClick={() => void api.app.openExternal('https://rajatmalik.dev/')}>
            Rajat Malik
          </button>{' '}
          ·{' '}
          <button type="button" className="footer-link" onClick={() => void api.app.openExternal('https://rajatmalik.dev/#contact')}>
            Hire me
          </button>
        </span>
        <span>{info?.upload.running ? `Sharing on port ${info.upload.port}` : 'Sharing server off'}</span>
      </footer>

      <UpdatePrompt result={updateResult} onDismiss={dismissUpdate} />
    </div>
  );
}
