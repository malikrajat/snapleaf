import { useEffect } from 'react';
import { Download, Sparkles } from 'lucide-react';
import type { UpdateCheckResult, UpdateDismissKind } from '@shared/types';
import { api } from '../lib/api';
import { Logo } from './Logo';

interface UpdatePromptProps {
  result: UpdateCheckResult | null;
  onDismiss: (kind: UpdateDismissKind) => Promise<unknown> | void;
}

export function UpdatePrompt({ result, onDismiss }: UpdatePromptProps) {
  const update = result?.status === 'available' ? result.update : undefined;

  useEffect(() => {
    if (!update) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        void onDismiss('later');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [update, onDismiss]);

  if (!update) return null;

  const download = async () => {
    await api.updates.open();
    await onDismiss('later');
  };

  return (
    <div className="update-backdrop">
      <section className="update-dialog" role="dialog" aria-modal="true" aria-labelledby="update-title">
        <div className="update-mark">
          <Logo size={44} />
          <span className="update-pulse" aria-hidden="true" />
        </div>
        <div className="update-copy">
          <span className="eyebrow"><Sparkles size={14} /> Update available</span>
          <h2 id="update-title">Snapleaf {update.version} is ready</h2>
          <p className="update-version">You are using {update.currentVersion}.</p>
          {update.notes ? <p className="update-notes">{update.notes.slice(0, 1200)}</p> : null}
          <div className="update-actions">
            <button type="button" className="button primary" onClick={() => void download()}>
              <Download size={16} /> Download update
            </button>
            <button type="button" className="button" onClick={() => void onDismiss('later')}>
              Remind me later
            </button>
            <button type="button" className="button ghost" onClick={() => void onDismiss('skip')}>
              Skip this version
            </button>
          </div>
          <p className="update-footnote">
            Download opens the release page in your browser. You can change update checks in
            Settings → Advanced.
          </p>
        </div>
      </section>
    </div>
  );
}
