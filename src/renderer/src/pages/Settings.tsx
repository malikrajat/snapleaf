import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Briefcase,
  Check,
  Copy,
  Download,
  ExternalLink,
  FileText,
  FolderOpen,
  Globe2,
  Images,
  Info,
  Keyboard,
  Laptop,
  Link2,
  Loader2,
  MapPin,
  Moon,
  Palette,
  Quote,
  RefreshCw,
  Save,
  Server,
  Settings2,
  Shield,
  SlidersHorizontal,
  Sun,
  Trash2,
  User,
  Users
} from 'lucide-react';
import type { HotkeyStatus, ServerInfo, UpdateCheckResult } from '@shared/types';
import type { Settings, ToolId } from '@shared/settings';
import { FONT_STACKS, TOOL_IDS, usesBarePrintScreen } from '@shared/settings';
import { formatFilename } from '@shared/format';
import { api, errorMessage } from '../lib/api';
import { useAppInfo, useHotkeyStatus, useSettings, useUpdates } from '../lib/hooks';
import { formatAccelerator } from '../lib/hotkey';
import { toast } from '../lib/toast';
import { Logo } from '../components/Logo';
import { HotkeyRecorder } from '../components/HotkeyRecorder';
import { Switch } from '../components/Switch';

type Section =
  | 'general'
  | 'capture'
  | 'editor'
  | 'saving'
  | 'sharing'
  | 'shortcuts'
  | 'advanced'
  | 'developer'
  | 'about';

const SECTIONS: Array<{ id: Section; label: string; icon: typeof Settings2 }> = [
  { id: 'general', label: 'General', icon: Settings2 },
  { id: 'capture', label: 'Capture', icon: SlidersHorizontal },
  { id: 'editor', label: 'Editor', icon: Palette },
  { id: 'saving', label: 'Saving', icon: Save },
  { id: 'sharing', label: 'Sharing', icon: Link2 },
  { id: 'shortcuts', label: 'Shortcuts', icon: Keyboard },
  { id: 'advanced', label: 'Advanced', icon: Shield },
  { id: 'developer', label: 'Developer', icon: User },
  { id: 'about', label: 'About', icon: Info }
];

const DEVELOPER_LINKS = [
  { label: 'Portfolio', href: 'https://rajatmalik.dev/' },
  { label: 'Contact / hire', href: 'https://rajatmalik.dev/#contact' },
  { label: 'LinkedIn', href: 'https://www.linkedin.com/in/errajatmalik/' },
  { label: 'GitHub', href: 'https://github.com/malikrajat' },
  { label: 'Resume PDF', href: 'https://rajatmalik.dev/assets/Rajat-JS-React-Angular.pdf' }
];

const DEVELOPER_SERVICES = [
  {
    title: 'Frontend architecture',
    copy: 'Platform and module boundaries that let teams ship independently.'
  },
  {
    title: 'Web performance',
    copy: 'Core Web Vitals, profiling, and rendering strategy with measurable outcomes.'
  },
  {
    title: 'Design systems',
    copy: 'Accessible component foundations and governance that stay maintainable.'
  },
  {
    title: 'Modernization',
    copy: 'Legacy Angular and React applications moved forward without stalling delivery.'
  }
];

const DEVELOPER_REFERENCES = [
  {
    name: 'Thomas Kocher',
    role: 'Product Manager',
    quote:
      'What truly sets Rajat apart is his innovative problem-solving mindset. He consistently brings fresh perspectives and stays calm and dependable even in challenging circumstances.'
  },
  {
    name: 'Suraj Vernekar',
    role: 'Product Owner',
    quote:
      'Rajat excels as lead, architect, and developer while meeting tight deadlines. His leadership significantly boosted the team’s productivity and kept everyone on track.'
  },
  {
    name: 'Pankaj Arora',
    role: 'Product Manager',
    quote:
      'Rajat was one of my star performers. His agility and speed helped us deliver significant work ahead of time, leaving room to improve overall quality.'
  },
  {
    name: 'Ruchika Mahajan',
    role: 'Project Manager',
    quote:
      'Rajat was an invaluable asset and a top performer. It was an absolute pleasure managing someone with his dedication, energy, and commitment.'
  }
];

const TOOL_LABELS: Record<ToolId, string> = {
  pen: 'Pen',
  line: 'Line',
  arrow: 'Arrow',
  rect: 'Rectangle',
  ellipse: 'Circle',
  marker: 'Marker',
  text: 'Text',
  step: 'Numbered step',
  blur: 'Pixelate',
  eraser: 'Eraser',
  crop: 'Crop'
};

const HOTKEY_ROWS: Array<{ id: keyof Settings['hotkeys']; label: string; description: string }> = [
  { id: 'capture', label: 'Capture region', description: 'Open the region selector.' },
  { id: 'fullscreenSave', label: 'Save full screen', description: 'Grab the current display and open the save dialog.' },
  { id: 'fullscreenUpload', label: 'Upload full screen', description: 'Grab the current display and share it immediately.' },
  { id: 'quickCopy', label: 'Copy full screen', description: 'Grab the current display and copy it to the clipboard.' }
];

export function SettingsPage() {
  const { settings, setSettings } = useSettings();
  const info = useAppInfo();
  const hotkeyStatuses = useHotkeyStatus();
  const {
    result: updateResult,
    checking: checkingUpdates,
    check: checkForUpdates,
    dismiss: dismissUpdate
  } = useUpdates(false);
  const [section, setSection] = useState<Section>('general');
  const [draft, setDraft] = useState<Settings | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);

  useEffect(() => {
    if (settings && !dirty) setDraft(settings);
  }, [settings, dirty]);

  useEffect(() => {
    if (!draft || !dirty) return;
    const timer = window.setTimeout(async () => {
      setSaving(true);
      try {
        const saved = await api.settings.update(draft);
        setDraft(saved);
        setSettings(saved);
        setDirty(false);
        setSaveError(null);
        setSavedAt(Date.now());
        setServerInfo(await api.upload.serverInfo());
      } catch (reason) {
        setSaveError(errorMessage(reason));
      } finally {
        setSaving(false);
      }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [draft, dirty, setSettings]);

  useEffect(() => {
    api.upload
      .serverInfo()
      .then(setServerInfo)
      .catch(() => undefined);
  }, []);

  const patch = <
    K extends 'general' | 'capture' | 'editor' | 'save' | 'upload' | 'hotkeys' | 'proxy' | 'updates'
  >(
    key: K,
    value: Partial<Settings[K]>
  ) => {
    setDraft((current) => (current ? ({ ...current, [key]: { ...current[key], ...value } } as Settings) : current));
    setDirty(true);
  };

  const checkNow = async () => {
    if (!draft) return;
    try {
      if (dirty) {
        const saved = await api.settings.update(draft);
        setDraft(saved);
        setSettings(saved);
        setDirty(false);
      }
      await checkForUpdates(true);
    } catch (reason) {
      toast(errorMessage(reason), 'error');
    }
  };

  const dismissUpdateKind = async (kind: 'later' | 'skip') => {
    try {
      await dismissUpdate(kind);
      toast(kind === 'skip' ? 'Version skipped' : 'We will remind you later', 'success');
    } catch (reason) {
      toast(errorMessage(reason), 'error');
    }
  };

  const openDeveloperLink = (href: string) => {
    void api.app.openExternal(href);
  };

  const reset = async () => {
    if (!window.confirm('Reset all Snapleaf settings to their defaults?')) return;
    try {
      const next = await api.settings.reset();
      setDraft(next);
      setDirty(false);
      setSaveError(null);
      toast('Settings reset', 'success');
    } catch (reason) {
      toast(errorMessage(reason), 'error');
    }
  };

  const browse = async () => {
    const directory = await api.app.chooseDirectory();
    if (directory) patch('save', { directory });
  };

  if (!draft) {
    return (
      <div className="settings-loading">
        <Loader2 size={22} className="spin" />
        <span>Loading settings…</span>
      </div>
    );
  }

  const active = SECTIONS.find((item) => item.id === section) ?? SECTIONS[0];
  const ActiveIcon = active.icon;
  const printScreenBound = usesBarePrintScreen(draft);
  const status = saveError ? (
    <span className="save-status error"><AlertCircle size={14} /> {saveError}</span>
  ) : saving ? (
    <span className="save-status"><Loader2 size={14} className="spin" /> Saving…</span>
  ) : dirty ? (
    <span className="save-status">Unsaved changes</span>
  ) : savedAt ? (
    <span className="save-status ok"><Check size={14} /> Saved</span>
  ) : (
    <span className="save-status">Changes save automatically</span>
  );

  return (
    <div className="settings-shell">
      <header className="page-header">
        <div className="page-heading">
          <Logo size={26} />
          <div>
            <h1>Settings</h1>
            <p>Make Snapleaf behave exactly how you work.</p>
          </div>
        </div>
        <div className="page-header-right">
          {status}
          <button type="button" className="icon-button" title="Close settings" onClick={() => api.app.close()}>
            <span aria-hidden="true">×</span>
          </button>
        </div>
      </header>

      <div className="settings-layout">
        <aside className="settings-nav">
          {SECTIONS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className={`settings-nav-item ${section === item.id ? 'is-active' : ''}`}
                onClick={() => setSection(item.id)}
              >
                <Icon size={17} />
                {item.label}
              </button>
            );
          })}
          <div className="settings-nav-footer">Snapleaf {info?.version ? `v${info.version}` : ''}</div>
        </aside>

        <main className="settings-content">
          <div className="settings-section-heading">
            <ActiveIcon size={20} />
            <div>
              <h2>{active.label}</h2>
              <p>{sectionDescription(section)}</p>
            </div>
          </div>

          {section === 'general' ? (
            <>
              <div className="settings-card">
                <h3>Appearance</h3>
                <div className="field-row">
                  <div>
                    <span className="field-label">Theme</span>
                    <span className="field-help">Follow Windows or lock a theme.</span>
                  </div>
                  <div className="segmented">
                    <button type="button" className={draft.general.theme === 'system' ? 'active' : ''} onClick={() => patch('general', { theme: 'system' })}>
                      <Laptop size={15} /> System
                    </button>
                    <button type="button" className={draft.general.theme === 'light' ? 'active' : ''} onClick={() => patch('general', { theme: 'light' })}>
                      <Sun size={15} /> Light
                    </button>
                    <button type="button" className={draft.general.theme === 'dark' ? 'active' : ''} onClick={() => patch('general', { theme: 'dark' })}>
                      <Moon size={15} /> Dark
                    </button>
                  </div>
                </div>
                <div className="field-row">
                  <div>
                    <span className="field-label">Language</span>
                    <span className="field-help">English ships today. The language layer is ready for community translations.</span>
                  </div>
                  <select value="en" disabled title="Additional translations are on the roadmap">
                    <option value="en">English</option>
                  </select>
                </div>
              </div>

              <div className="settings-card">
                <h3>Startup & tray</h3>
                <Switch
                  checked={draft.general.launchAtLogin}
                  onChange={(value) => patch('general', { launchAtLogin: value })}
                  label="Launch Snapleaf with Windows"
                  description="Starts in the tray so your capture shortcut is always ready."
                />
                <Switch
                  checked={draft.general.startMinimized}
                  onChange={(value) => patch('general', { startMinimized: value })}
                  label="Start minimized"
                  description="Open only the tray icon when Snapleaf launches."
                />
                <Switch
                  checked={draft.general.singleClickTray}
                  onChange={(value) => patch('general', { singleClickTray: value })}
                  label="Single-click tray opens the dashboard"
                  description="Turn off if you prefer the tray menu on left click."
                />
                <Switch
                  checked={draft.general.notifications}
                  onChange={(value) => patch('general', { notifications: value })}
                  label="Show native notifications"
                  description="Copy, save, and upload confirmations."
                />
              </div>
            </>
          ) : null}

          {section === 'capture' ? (
            <div className="settings-card">
              <h3>Selection & cursor</h3>
              <Switch
                checked={draft.capture.keepSelection}
                onChange={(value) => patch('capture', { keepSelection: value })}
                label="Remember the last selected area"
                description="Prefill the previous selection on the same display."
              />
              <Switch
                checked={draft.capture.includeCursor}
                onChange={(value) => patch('capture', { includeCursor: value })}
                label="Include the mouse cursor"
                description="Draws the pointer into region captures. Full-screen quick actions may omit it."
              />
              <Switch
                checked={draft.capture.copyImageAfterCapture}
                onChange={(value) => patch('capture', { copyImageAfterCapture: value })}
                label="Copy every edited capture to the clipboard"
                description="Useful when you almost always paste the result next."
              />
              <Switch
                checked={draft.capture.playSound}
                onChange={(value) => patch('capture', { playSound: value })}
                label="Play a sound with notifications"
                description="Uses the Windows notification sound."
              />
              <div className="field-row">
                <div>
                  <span className="field-label">Dim outside the selection</span>
                  <span className="field-help">Darken the rest of the screen while selecting.</span>
                </div>
                <label className="range-control wide">
                  <input
                    type="range"
                    min={15}
                    max={90}
                    value={Math.round(draft.capture.dimOpacity * 100)}
                    onChange={(event) => patch('capture', { dimOpacity: Number(event.target.value) / 100 })}
                  />
                  <b>{Math.round(draft.capture.dimOpacity * 100)}%</b>
                </label>
              </div>
            </div>
          ) : null}

          {section === 'editor' ? (
            <div className="settings-card">
              <h3>New captures</h3>
              <div className="field-row">
                <div>
                  <span className="field-label">Default tool</span>
                  <span className="field-help">The tool selected when the editor opens.</span>
                </div>
                <select value={draft.editor.defaultTool} onChange={(event) => patch('editor', { defaultTool: event.target.value as ToolId })}>
                  {TOOL_IDS.filter((tool) => tool !== 'crop').map((tool) => (
                    <option key={tool} value={tool}>{TOOL_LABELS[tool]}</option>
                  ))}
                </select>
              </div>
              <div className="field-row">
                <div>
                  <span className="field-label">Default color</span>
                  <span className="field-help">Used for new pen, shape, and text markup.</span>
                </div>
                <label className="color-field">
                  <input type="color" value={draft.editor.defaultColor} onChange={(event) => patch('editor', { defaultColor: event.target.value })} />
                  <span style={{ background: draft.editor.defaultColor }} />
                  <code>{draft.editor.defaultColor.toUpperCase()}</code>
                </label>
              </div>
              <div className="field-row">
                <div>
                  <span className="field-label">Default stroke size</span>
                  <span className="field-help">Measured in screenshot pixels.</span>
                </div>
                <label className="range-control wide">
                  <input
                    type="range"
                    min={1}
                    max={40}
                    value={draft.editor.defaultWidth}
                    onChange={(event) => patch('editor', { defaultWidth: Number(event.target.value) })}
                  />
                  <b>{draft.editor.defaultWidth}</b>
                </label>
              </div>
              <div className="field-row">
                <div>
                  <span className="field-label">Text font</span>
                  <span className="field-help">Used by the text tool.</span>
                </div>
                <select value={draft.editor.fontFamily} onChange={(event) => patch('editor', { fontFamily: event.target.value })}>
                  {FONT_STACKS.map((font) => (
                    <option key={font.value} value={font.value}>{font.label}</option>
                  ))}
                </select>
              </div>
              <Switch
                checked={draft.editor.showLabels}
                onChange={(value) => patch('editor', { showLabels: value })}
                label="Show tool names in the editor rail"
                description="Turn off for a compact icon-only toolbar."
              />
            </div>
          ) : null}

          {section === 'saving' ? (
            <>
              <div className="settings-card">
                <h3>Where files go</h3>
                <div className="field-row">
                  <div>
                    <span className="field-label">Save folder</span>
                    <span className="field-help">Default location for Save.</span>
                  </div>
                  <div className="path-field">
                    <code title={draft.save.directory}>{draft.save.directory}</code>
                    <button type="button" className="mini-button" onClick={() => void browse()}>Browse</button>
                  </div>
                </div>
                <div className="field-row">
                  <div>
                    <span className="field-label">Filename pattern</span>
                    <span className="field-help">Tokens: {'{yyyy} {MM} {dd} {HH} {mm} {ss} {counter}'}</span>
                  </div>
                  <input
                    className="text-input"
                    value={draft.save.filenamePattern}
                    onChange={(event) => patch('save', { filenamePattern: event.target.value })}
                    spellCheck={false}
                  />
                </div>
                <div className="preview-line">Preview: <code>{formatFilename(draft.save.filenamePattern)}.{draft.save.format === 'jpeg' ? 'jpg' : 'png'}</code></div>
              </div>
              <div className="settings-card">
                <h3>Format</h3>
                <div className="field-row">
                  <div>
                    <span className="field-label">Image format</span>
                    <span className="field-help">PNG is lossless; JPEG is smaller.</span>
                  </div>
                  <select value={draft.save.format} onChange={(event) => patch('save', { format: event.target.value as 'png' | 'jpeg' })}>
                    <option value="png">PNG</option>
                    <option value="jpeg">JPEG</option>
                  </select>
                </div>
                {draft.save.format === 'jpeg' ? (
                  <div className="field-row">
                    <div>
                      <span className="field-label">JPEG quality</span>
                      <span className="field-help">Higher is sharper and larger.</span>
                    </div>
                    <label className="range-control wide">
                      <input type="range" min={30} max={100} value={draft.save.jpegQuality} onChange={(event) => patch('save', { jpegQuality: Number(event.target.value) })} />
                      <b>{draft.save.jpegQuality}</b>
                    </label>
                  </div>
                ) : null}
                <Switch
                  checked={draft.save.optimizePng}
                  onChange={(value) => patch('save', { optimizePng: value })}
                  label="Optimize PNG on save"
                  description="Re-encodes the PNG through Chromium's encoder."
                />
                <Switch
                  checked={draft.save.openFolderAfterSave}
                  onChange={(value) => patch('save', { openFolderAfterSave: value })}
                  label="Show the saved file in Explorer"
                  description="Opens the containing folder after a successful save."
                />
              </div>
            </>
          ) : null}

          {section === 'sharing' ? (
            <>
              <div className="settings-card">
                <h3>Built-in sharing</h3>
                <Switch
                  checked={draft.upload.localServer}
                  onChange={(value) => patch('upload', { localServer: value })}
                  label="Run a local image server"
                  description="Creates short links on this computer or your local network. No account, no cloud."
                />
                <div className="field-row">
                  <div>
                    <span className="field-label">Server port</span>
                    <span className="field-help">Snapleaf falls back to a free port if this one is busy.</span>
                  </div>
                  <input
                    className="text-input short"
                    type="number"
                    min={1024}
                    max={65535}
                    value={draft.upload.port}
                    onChange={(event) => patch('upload', { port: Number(event.target.value) || 38473 })}
                  />
                </div>
                <div className={`server-status ${serverInfo?.running ? 'is-up' : 'is-off'}`}>
                  <Server size={16} />
                  {serverInfo?.running ? (
                    <span>Running at <code>{serverInfo.localUrl}</code></span>
                  ) : (
                    <span>{serverInfo?.error || 'Server is off'}</span>
                  )}
                  {serverInfo?.running ? (
                    <button type="button" className="mini-button" onClick={() => void api.app.openExternal(serverInfo.localUrl)}>
                      <ExternalLink size={13} /> Open
                    </button>
                  ) : null}
                </div>
                {serverInfo?.running ? (
                  <div className="inline-actions">
                    <button type="button" className="mini-button" onClick={() => { void api.upload.copyText(serverInfo.lanUrl); toast('LAN gallery link copied', 'success'); }}>
                      <Copy size={13} /> Copy LAN link
                    </button>
                    <button type="button" className="mini-button" onClick={() => void api.app.openExternal(serverInfo.effectiveBaseUrl)}>
                      <Images size={13} /> Open gallery
                    </button>
                    <button type="button" className="mini-button" onClick={() => void api.library.openUploadsFolder()}>
                      <FolderOpen size={13} /> Uploads folder
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="settings-card">
                <h3>Links & format</h3>
                <div className="field-row">
                  <div>
                    <span className="field-label">Public base URL</span>
                    <span className="field-help">Optional. Put a reverse proxy in front of the local server to share outside your network.</span>
                  </div>
                  <input
                    className="text-input"
                    placeholder="https://shots.example.com"
                    value={draft.upload.publicBaseUrl}
                    onChange={(event) => patch('upload', { publicBaseUrl: event.target.value })}
                    spellCheck={false}
                  />
                </div>
                <div className="field-row">
                  <div>
                    <span className="field-label">Upload format</span>
                    <span className="field-help">Links are generated after the image is stored.</span>
                  </div>
                  <select value={draft.upload.format} onChange={(event) => patch('upload', { format: event.target.value as 'png' | 'jpeg' })}>
                    <option value="png">PNG</option>
                    <option value="jpeg">JPEG</option>
                  </select>
                </div>
                {draft.upload.format === 'jpeg' ? (
                  <div className="field-row">
                    <div>
                      <span className="field-label">JPEG quality</span>
                      <span className="field-help">For shared links only.</span>
                    </div>
                    <label className="range-control wide">
                      <input type="range" min={30} max={100} value={draft.upload.jpegQuality} onChange={(event) => patch('upload', { jpegQuality: Number(event.target.value) })} />
                      <b>{draft.upload.jpegQuality}</b>
                    </label>
                  </div>
                ) : null}
                <Switch
                  checked={draft.upload.autoCopyLink}
                  onChange={(value) => patch('upload', { autoCopyLink: value })}
                  label="Copy the link after uploading"
                  description="The page URL is copied to your clipboard."
                />
                <Switch
                  checked={draft.upload.autoCloseWindow}
                  onChange={(value) => patch('upload', { autoCloseWindow: value })}
                  label="Close the upload window automatically"
                  description="Closes the share window a moment after the link is ready."
                />
                <p className="settings-note">
                  <Info size={14} />
                  Links use your computer's LAN address by default. For internet sharing, point a domain or tunnel at the port above and fill in the public base URL.
                </p>
              </div>
            </>
          ) : null}

          {section === 'shortcuts' ? (
            <div className="settings-card">
              <h3>Global shortcuts</h3>
              <p className="settings-note">
                <Info size={14} />
                Shortcuts work while Snapleaf is in the tray. If another app owns a combination, choose a different one.
                While a shortcut is being recorded, Snapleaf pauses its global shortcuts so the key combination reaches
                this window.
              </p>
              {HOTKEY_ROWS.map((row) => {
                const binding = draft.hotkeys[row.id];
                const status = hotkeyStatuses.find((item) => item.id === row.id);
                return (
                  <div className="hotkey-row" key={row.id}>
                    <div className="hotkey-copy">
                      <span className="field-label">{row.label}</span>
                      <span className="field-help">{row.description}</span>
                      {binding.enabled && status && !status.registered ? (
                        <span className="hotkey-error"><AlertCircle size={13} /> {status.error || 'Not registered'}</span>
                      ) : null}
                    </div>
                    <Switch
                      checked={binding.enabled}
                      onChange={(value) => patch('hotkeys', { [row.id]: { ...binding, enabled: value } })}
                      label="Enabled"
                    />
                    <HotkeyRecorder
                      value={binding.accelerator}
                      onChange={(accelerator) => patch('hotkeys', { [row.id]: { ...binding, accelerator } })}
                      disabled={!binding.enabled}
                    />
                  </div>
                );
              })}
              <div className="hotkey-current">
                Current capture shortcut: <kbd>{formatAccelerator(draft.hotkeys.capture.accelerator)}</kbd>
              </div>
              <Switch
                checked={draft.capture.takeOverPrintScreen}
                onChange={(value) => patch('capture', { takeOverPrintScreen: value })}
                label="Take over the Windows Print Screen key"
                description={
                  printScreenBound
                    ? 'Turns off the Windows Snipping Tool binding for PrtSc while this is enabled. Sign out or restart once after the first change; Windows re-reads the key at sign-in. Turning this off restores the previous Windows setting.'
                    : 'Assign PrintScreen to a shortcut above to use this. Other Windows shortcuts such as Win+Shift+S stay reserved by Windows.'
                }
                disabled={!printScreenBound}
              />
              <p className="settings-note">
                <Info size={14} />
                Windows owns some combinations permanently (Win+Shift+S, Win+G, and similar). No app
                can register those through the normal global-shortcut API, so use a Ctrl, Alt, or
                Shift combination for a guaranteed capture key.
              </p>
            </div>
          ) : null}

          {section === 'advanced' ? (
            <>
              <div className="settings-card">
                <h3>Proxy</h3>
                <div className="field-row">
                  <div>
                    <span className="field-label">Connection mode</span>
                    <span className="field-help">Applies to external web requests, not the local sharing server.</span>
                  </div>
                  <select value={draft.proxy.mode} onChange={(event) => patch('proxy', { mode: event.target.value as Settings['proxy']['mode'] })}>
                    <option value="system">Use system proxy</option>
                    <option value="none">Direct connection</option>
                    <option value="manual">Manual proxy</option>
                  </select>
                </div>
                {draft.proxy.mode === 'manual' ? (
                  <div className="field-row">
                    <div>
                      <span className="field-label">HTTP(S) proxy</span>
                      <span className="field-help">For example http://127.0.0.1:8080</span>
                    </div>
                    <input
                      className="text-input"
                      value={draft.proxy.server}
                      onChange={(event) => patch('proxy', { server: event.target.value })}
                      spellCheck={false}
                    />
                  </div>
                ) : null}
              </div>

              <div className="settings-card">
                <h3>Application updates</h3>
                <Switch
                  checked={draft.updates.checkOnLaunch}
                  onChange={(value) => patch('updates', { checkOnLaunch: value })}
                  label="Check for updates when Snapleaf starts"
                  description="Shows an in-app prompt and a Windows notification when a newer version is published."
                />
                <div className="field-row">
                  <div>
                    <span className="field-label">Update manifest URL</span>
                    <span className="field-help">
                      A small JSON file with the latest version and download link. The default is hosted on rajatmalik.dev.
                    </span>
                  </div>
                  <input
                    className="text-input"
                    value={draft.updates.feedUrl}
                    onChange={(event) => patch('updates', { feedUrl: event.target.value })}
                    spellCheck={false}
                  />
                </div>
                <div className="inline-actions">
                  <button type="button" className="button ghost" onClick={() => void checkNow()} disabled={checkingUpdates}>
                    <RefreshCw size={15} className={checkingUpdates ? 'spin' : ''} />
                    {checkingUpdates ? 'Checking…' : 'Check now'}
                  </button>
                  {updateResult?.status === 'available' && updateResult.update ? (
                    <button type="button" className="button primary" onClick={() => void api.updates.open()}>
                      <Download size={15} /> Download {updateResult.update.version}
                    </button>
                  ) : null}
                </div>
                <UpdateStatus result={updateResult} onDismiss={dismissUpdateKind} />
                <p className="settings-note">
                  <Info size={14} />
                  The manifest format and publishing steps are documented in docs/UPDATE-FEED.md.
                </p>
              </div>

              <div className="settings-card">
                <h3>Files & diagnostics</h3>
                <div className="path-list">
                  <div><span>Data folder</span><code>{info?.userData}</code><button type="button" className="mini-button" onClick={() => void api.app.openPath(info?.userData ?? '')}>Open</button></div>
                  <div><span>Captures</span><code>{info?.capturesDir}</code><button type="button" className="mini-button" onClick={() => void api.library.openCapturesFolder()}>Open</button></div>
                  <div><span>Uploads</span><code>{info?.uploadsDir}</code><button type="button" className="mini-button" onClick={() => void api.library.openUploadsFolder()}>Open</button></div>
                  <div><span>Logs</span><code>{info?.logsDir}</code><button type="button" className="mini-button" onClick={() => void api.app.openPath(info?.logsDir ?? '')}>Open</button></div>
                </div>
                <div className="inline-actions">
                  <button type="button" className="button ghost" onClick={() => void reset()}>
                    <RefreshCw size={15} /> Reset all settings
                  </button>
                </div>
              </div>
            </>
          ) : null}

          {section === 'developer' ? (
            <>
              <div className="settings-card developer-profile-card">
                <div className="developer-profile">
                  <div className="developer-avatar" aria-hidden="true">RM</div>
                  <div className="developer-profile-copy">
                    <span className="developer-availability">
                      <span className="developer-availability-dot" /> Available for senior / lead frontend roles
                    </span>
                    <h2>Rajat Malik</h2>
                    <p className="developer-role">
                      Senior Lead Software Engineer at Siemens · Frontend Architect &amp; Engineering Lead
                    </p>
                    <p className="developer-meta">
                      <MapPin size={14} /> Gurgaon, Haryana, India · 15+ years shipping digital products
                    </p>
                  </div>
                </div>
                <p className="about-copy">
                  I turn complex enterprise problems into fast, accessible products people actually enjoy
                  using — and I lead the teams that ship them. My work focuses on frontend architecture,
                  performance, design systems, accessibility, testing, and Angular/React modernization.
                </p>
                <div className="developer-actions">
                  <button
                    type="button"
                    className="button primary"
                    onClick={() => openDeveloperLink('https://rajatmalik.dev/#contact')}
                  >
                    <Briefcase size={16} /> Hire me
                  </button>
                  <button
                    type="button"
                    className="button"
                    onClick={() => openDeveloperLink('https://rajatmalik.dev/')}
                  >
                    <Globe2 size={16} /> Portfolio
                  </button>
                  <button
                    type="button"
                    className="button ghost"
                    onClick={() => openDeveloperLink('https://rajatmalik.dev/assets/Rajat-JS-React-Angular.pdf')}
                  >
                    <FileText size={16} /> Resume
                  </button>
                </div>
                <div className="developer-linkbar">
                  {DEVELOPER_LINKS.map((link) => (
                    <button
                      key={link.label}
                      type="button"
                      className="developer-link"
                      onClick={() => openDeveloperLink(link.href)}
                    >
                      {link.label} <ExternalLink size={12} />
                    </button>
                  ))}
                </div>
              </div>

              <div className="settings-card">
                <h3>References</h3>
                <p className="developer-lede">
                  Feedback from engineering managers, product owners, and project managers I have worked with.
                  Full recommendations are published on my portfolio.
                </p>
                <div className="reference-grid">
                  {DEVELOPER_REFERENCES.map((reference) => (
                    <blockquote className="reference-card" key={reference.name}>
                      <Quote size={16} />
                      <p>“{reference.quote}”</p>
                      <footer>
                        <strong>{reference.name}</strong>
                        <span>{reference.role}</span>
                      </footer>
                    </blockquote>
                  ))}
                </div>
                <div className="inline-actions">
                  <button
                    type="button"
                    className="button ghost"
                    onClick={() => openDeveloperLink('https://rajatmalik.dev/#testimonials')}
                  >
                    <Users size={15} /> Read all references
                  </button>
                  <button
                    type="button"
                    className="button ghost"
                    onClick={() => openDeveloperLink('https://rajatmalik.dev/#contact')}
                  >
                    <ExternalLink size={15} /> Discuss an opportunity
                  </button>
                </div>
              </div>

              <div className="settings-card">
                <h3>How I can help</h3>
                <div className="developer-service-grid">
                  {DEVELOPER_SERVICES.map((service) => (
                    <div className="developer-service" key={service.title}>
                      <strong>{service.title}</strong>
                      <span>{service.copy}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : null}

          {section === 'about' ? (
            <div className="settings-card about-card">
              <div className="about-brand">
                <Logo size={54} />
                <div>
                  <h2>Snapleaf</h2>
                  <p>Capture. Mark up. Share. A local-first screenshot studio.</p>
                </div>
              </div>
              <dl className="about-grid">
                <div><dt>Version</dt><dd>{info?.version ?? '0.2.0'}</dd></div>
                <div><dt>Electron</dt><dd>{info?.electron ?? '—'}</dd></div>
                <div><dt>Platform</dt><dd>{info?.platform ?? '—'}</dd></div>
                <div><dt>Sharing</dt><dd>{serverInfo?.running ? `Port ${serverInfo.port}` : 'Off'}</dd></div>
              </dl>
              <p className="about-copy">
                Snapleaf is an original, clean-room implementation inspired by the workflow of classic
                screenshot tools. It does not ship Lightshot code, icons, or branding. Feature research was
                performed on a locally installed copy using REA with Ghidra.
              </p>
              <p className="about-copy">
                Your screenshots and edits stay on this computer unless you explicitly share a link.
              </p>
              <div className="about-badges">
                <span><Shield size={14} /> Local-first</span>
                <span><Check size={14} /> No telemetry</span>
                <span><Keyboard size={14} /> Keyboard friendly</span>
              </div>
              <div className="about-developer">
                <div>
                  <strong>Designed and built by Rajat Malik</strong>
                  <span>Senior frontend architect and engineering lead — open to new work.</span>
                </div>
                <button type="button" className="button ghost" onClick={() => setSection('developer')}>
                  <User size={15} /> Developer &amp; references
                </button>
              </div>
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}

function sectionDescription(section: Section): string {
  switch (section) {
    case 'general': return 'Startup, appearance, and day-to-day behavior.';
    case 'capture': return 'How the screen is captured and remembered.';
    case 'editor': return 'Defaults for new annotations.';
    case 'saving': return 'Where and how screenshots are written to disk.';
    case 'sharing': return 'The built-in local image server and share links.';
    case 'shortcuts': return 'System-wide capture shortcuts.';
    case 'advanced': return 'Proxy, updates, storage, and diagnostics.';
    case 'developer': return 'About the developer, services, and client references.';
    case 'about': return 'Version and project details.';
  }
}

function UpdateStatus({
  result,
  onDismiss
}: {
  result: UpdateCheckResult | null;
  onDismiss: (kind: 'later' | 'skip') => Promise<void>;
}) {
  if (!result || result.checkedAt === 0) {
    return <p className="update-check-status">Not checked yet.</p>;
  }
  const checked = new Date(result.checkedAt).toLocaleString();
  if (result.status === 'error') {
    return (
      <div className="update-check-result is-error">
        <AlertCircle size={15} />
        <div>
          <strong>Could not check for updates</strong>
          <span>{result.error ?? 'Unknown error.'}</span>
          <small>Last attempt {checked}</small>
        </div>
      </div>
    );
  }
  if (result.status === 'available' && result.update) {
    return (
      <div className="update-check-result is-available">
        <Download size={16} />
        <div>
          <strong>Snapleaf {result.update.version} is available</strong>
          <span>{result.update.notes || `You are on ${result.currentVersion}. Download the newer build when you are ready.`}</span>
          <div className="inline-actions">
            <button type="button" className="button" onClick={() => void api.updates.open()}>
              <Download size={14} /> Download update
            </button>
            <button type="button" className="button ghost" onClick={() => void onDismiss('later')}>
              Remind me later
            </button>
            <button type="button" className="button ghost" onClick={() => void onDismiss('skip')}>
              Skip this version
            </button>
          </div>
          <small>Last checked {checked}</small>
        </div>
      </div>
    );
  }
  const messages: Record<Exclude<UpdateCheckResult['status'], 'error'>, string> = {
    available: 'An update is available.',
    current: `Snapleaf ${result.currentVersion} is up to date.`,
    skipped: 'This version is skipped. Future versions will still be offered.',
    reminded: 'A reminder is scheduled for later.',
    disabled: 'Automatic update checks are turned off.'
  };
  return (
    <p className={`update-check-status is-${result.status}`}>
      <Check size={14} /> {messages[result.status]} <small>Last checked {checked}</small>
    </p>
  );
}
