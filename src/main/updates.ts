import { app, net, Notification, shell } from 'electron';
import type { UpdateCheckResult, UpdateDismissKind, UpdateInfo } from '../shared/types';
import { IPC } from '../shared/types';
import type { SettingsStore } from './settings-store';
import type { WindowManager } from './windows';
import { log } from './logger';
import { isNewerVersion, parseUpdateManifest } from '../shared/update';

const CACHE_MS = 30 * 60 * 1000;
const REMIND_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8000;

interface UpdateServiceOptions {
  settings: SettingsStore;
  windows: WindowManager;
  iconPath: string;
  broadcast: (channel: string, payload: unknown) => void;
}

export class UpdateService {
  private lastResult: UpdateCheckResult | null = null;
  private lastFeedUrl: string | null = null;
  private checking: Promise<UpdateCheckResult> | null = null;
  private notifiedVersion: string | null = null;

  constructor(private readonly deps: UpdateServiceOptions) {}

  status(): UpdateCheckResult {
    if (this.lastResult) return this.lastResult;
    return {
      status: this.deps.settings.get().updates.checkOnLaunch ? 'current' : 'disabled',
      currentVersion: app.getVersion(),
      checkedAt: 0
    };
  }

  async check(manual = false): Promise<UpdateCheckResult> {
    if (this.checking) return this.checking;
    const task = this.performCheck(manual).finally(() => {
      this.checking = null;
    });
    this.checking = task;
    return task;
  }

  async open(): Promise<void> {
    const url = this.lastResult?.update?.downloadUrl;
    if (!url) return;
    await shell.openExternal(url);
  }

  dismiss(kind: UpdateDismissKind): UpdateCheckResult {
    const previous = this.deps.settings.get();
    const update = this.lastResult?.update;
    if (!update) return this.status();
    const next = {
      ...previous,
      updates: {
        ...previous.updates,
        skippedVersion: kind === 'skip' ? update.version : null,
        remindAfter: kind === 'later' ? Date.now() + REMIND_MS : null
      }
    };
    this.deps.settings.update(next);
    const result: UpdateCheckResult = {
      status: kind === 'skip' ? 'skipped' : 'reminded',
      currentVersion: app.getVersion(),
      checkedAt: Date.now(),
      update
    };
    this.lastResult = result;
    this.publish(result);
    return result;
  }

  private async performCheck(manual: boolean): Promise<UpdateCheckResult> {
    const currentVersion = app.getVersion();
    const preferences = this.deps.settings.get().updates;
    if (!manual && !preferences.checkOnLaunch) {
      return this.finish({
        status: 'disabled',
        currentVersion,
        checkedAt: Date.now()
      });
    }

    const feedUrl = process.env.SNAPLEAF_UPDATE_FEED?.trim() || preferences.feedUrl;
    if (!/^https?:\/\//i.test(feedUrl)) {
      return this.finish(
        {
          status: 'error',
          currentVersion,
          checkedAt: Date.now(),
          error: 'The update manifest URL must start with http:// or https://.'
        },
        manual
      );
    }

    if (feedUrl !== this.lastFeedUrl) {
      this.lastFeedUrl = feedUrl;
      this.lastResult = null;
    }
    if (
      !manual &&
      this.lastResult &&
      this.lastResult.status !== 'error' &&
      Date.now() - this.lastResult.checkedAt < CACHE_MS
    ) {
      return this.lastResult;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response: Response;
    try {
      response = await net.fetch(feedUrl, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
        cache: 'no-store'
      });
    } catch (error) {
      log.warn('Update check failed', { error: String(error) });
      return this.finish(
        {
          status: 'error',
          currentVersion,
          checkedAt: Date.now(),
          error: 'Could not reach the update server.'
        },
        manual
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      return this.finish(
        {
          status: 'error',
          currentVersion,
          checkedAt: Date.now(),
          error: `The update server returned HTTP ${response.status}.`
        },
        manual
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return this.finish(
        {
          status: 'error',
          currentVersion,
          checkedAt: Date.now(),
          error: 'The update manifest is not valid JSON.'
        },
        manual
      );
    }

    const update = parseUpdateManifest(payload, currentVersion);
    if (!update) {
      return this.finish(
        {
          status: 'error',
          currentVersion,
          checkedAt: Date.now(),
          error: 'The update manifest is missing a version or download URL.'
        },
        manual
      );
    }
    if (!isNewerVersion(update.version, currentVersion)) {
      return this.finish({
        status: 'current',
        currentVersion,
        checkedAt: Date.now()
      });
    }

    if (!manual) {
      if (preferences.skippedVersion === update.version) {
        return this.finish({
          status: 'skipped',
          currentVersion,
          checkedAt: Date.now(),
          update
        });
      }
      if (preferences.remindAfter && preferences.remindAfter > Date.now()) {
        return this.finish({
          status: 'reminded',
          currentVersion,
          checkedAt: Date.now(),
          update
        });
      }
    }

    const result: UpdateCheckResult = {
      status: 'available',
      currentVersion,
      checkedAt: Date.now(),
      update
    };
    this.lastResult = result;
    this.publish(result);
    if (!manual) this.notify(update);
    return result;
  }

  private finish(result: UpdateCheckResult, publish = true): UpdateCheckResult {
    if (publish) {
      this.lastResult = result;
      this.publish(result);
    } else {
      // Automatic check failures should not show a red error in Settings; the
      // next manual check will surface the diagnostic.
      this.lastResult = null;
    }
    return result;
  }

  private publish(result: UpdateCheckResult): void {
    this.deps.broadcast(IPC.updateChanged, result);
  }

  private notify(update: UpdateInfo): void {
    if (process.env.SNAPLEAF_E2E === '1') return;
    if (!this.deps.settings.get().general.notifications) return;
    if (!Notification.isSupported()) return;
    if (this.notifiedVersion === update.version) return;
    this.notifiedVersion = update.version;
    try {
      const notification = new Notification({
        title: `Snapleaf ${update.version} is available`,
        body: update.notes.split('\n')[0]?.slice(0, 240) || 'Open Snapleaf to review and download the update.',
        icon: this.deps.iconPath
      });
      notification.on('click', () => {
        this.deps.windows.showHome();
        if (this.lastResult) this.publish(this.lastResult);
      });
      notification.show();
    } catch (error) {
      log.warn('Could not show update notification', { error: String(error) });
    }
  }
}
