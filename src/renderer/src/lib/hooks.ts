import { useCallback, useEffect, useState } from 'react';
import type { Settings } from '@shared/settings';
import type {
  AppInfo,
  HotkeyStatus,
  UpdateCheckResult,
  UpdateDismissKind
} from '@shared/types';
import { api, errorMessage } from './api';

export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api.settings
      .get()
      .then((value) => {
        if (alive) setSettings(value);
      })
      .catch((reason) => {
        if (alive) setError(errorMessage(reason));
      });
    const unsubscribe = api.settings.onChanged((value) => setSettings(value));
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!settings) return;
    const theme = settings.general.theme;
    const root = document.documentElement;
    if (theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = theme;
    root.style.colorScheme = theme === 'system' ? 'light dark' : theme;
  }, [settings]);

  async function update(next: Settings): Promise<Settings | null> {
    setSettings(next);
    try {
      const saved = await api.settings.update(next);
      setSettings(saved);
      setError(null);
      return saved;
    } catch (reason) {
      setError(errorMessage(reason));
      return null;
    }
  }

  async function reset(): Promise<Settings | null> {
    try {
      const value = await api.settings.reset();
      setSettings(value);
      return value;
    } catch (reason) {
      setError(errorMessage(reason));
      return null;
    }
  }

  return { settings, setSettings, update, reset, error };
}

export function useAppInfo() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  useEffect(() => {
    let alive = true;
    api.app
      .info()
      .then((value) => {
        if (alive) setInfo(value);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return info;
}

export function useUpdates(autoCheck = false) {
  const [result, setResult] = useState<UpdateCheckResult | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    let alive = true;
    api.updates
      .status()
      .then((value) => {
        if (alive) setResult(value);
      })
      .catch(() => undefined);
    const unsubscribe = api.updates.onChanged((value) => {
      if (alive) setResult(value);
    });
    if (autoCheck) {
      api.updates
        .check(false)
        .then((value) => {
          if (alive) setResult(value);
        })
        .catch(() => undefined);
    }
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [autoCheck]);

  const check = useCallback(async (manual = true) => {
    setChecking(true);
    try {
      const value = await api.updates.check(manual);
      setResult(value);
      return value;
    } finally {
      setChecking(false);
    }
  }, []);

  const dismiss = useCallback(async (kind: UpdateDismissKind) => {
    const value = await api.updates.dismiss(kind);
    setResult(value);
    return value;
  }, []);

  return { result, checking, check, dismiss };
}

export function useHotkeyStatus() {
  const [statuses, setStatuses] = useState<HotkeyStatus[]>([]);
  useEffect(() => {
    let alive = true;
    api.settings
      .getHotkeyStatus()
      .then((value) => {
        if (alive) setStatuses(value);
      })
      .catch(() => undefined);
    const unsubscribe = api.settings.onHotkeyStatus(setStatuses);
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);
  return statuses;
}
