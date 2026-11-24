import { useEffect, useRef, useState } from 'react';
import { Keyboard, X } from 'lucide-react';
import { api } from '../lib/api';
import { eventToAccelerator, formatAccelerator } from '../lib/hotkey';

export function HotkeyRecorder({
  value,
  onChange,
  disabled = false
}: {
  value: string;
  onChange: (accelerator: string) => void;
  disabled?: boolean;
}) {
  const [recording, setRecording] = useState(false);
  const [preview, setPreview] = useState('');
  const suspended = useRef(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (suspended.current) {
        suspended.current = false;
        void api.hotkeys.resume().catch(() => undefined);
      }
    };
  }, []);

  useEffect(() => {
    if (!recording) return;
    return () => {
      if (suspended.current) {
        suspended.current = false;
        void api.hotkeys.resume().catch(() => undefined);
      }
    };
  }, [recording]);

  useEffect(() => {
    if (!recording) return;
    const onKey = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') {
        setRecording(false);
        return;
      }
      const accelerator = eventToAccelerator(event);
      if (accelerator) {
        onChange(accelerator);
        setRecording(false);
        return;
      }
      const modifiers: string[] = [];
      if (event.ctrlKey) modifiers.push('Ctrl');
      if (event.altKey) modifiers.push('Alt');
      if (event.shiftKey) modifiers.push('Shift');
      if (event.metaKey) modifiers.push('Win');
      setPreview(modifiers.length ? `${modifiers.join(' + ')} + …` : 'Press a shortcut…');
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [recording, onChange]);

  const startRecording = async () => {
    if (recording) {
      setRecording(false);
      return;
    }
    setPreview('');
    try {
      // Free the current global shortcuts while listening so pressing (for
      // example) the existing PrintScreen shortcut reaches this window instead
      // of starting a capture.
      await api.hotkeys.suspend();
      suspended.current = true;
    } catch {
      // Still allow recording even if the suspend channel is unavailable.
    }
    if (alive.current) setRecording(true);
    else if (suspended.current) {
      suspended.current = false;
      void api.hotkeys.resume().catch(() => undefined);
    }
  };

  return (
    <div className={`hotkey-recorder ${recording ? 'is-recording' : ''}`}>
      <Keyboard size={15} />
      <kbd>{recording ? preview || 'Press a shortcut…' : formatAccelerator(value)}</kbd>
      <button
        type="button"
        className="mini-button"
        onClick={() => void startRecording()}
        title={recording ? 'Cancel shortcut recording' : 'Record a new shortcut'}
        disabled={disabled}
      >
        {recording ? 'Listening' : 'Change'}
      </button>
      {value ? (
        <button
          type="button"
          className="mini-icon"
          title="Clear shortcut"
          onClick={() => onChange('')}
          disabled={disabled}
        >
          <X size={13} />
        </button>
      ) : null}
    </div>
  );
}
