import type { UpdateState } from '../preload/updateTypes';

/** The slice of electron-updater's AppUpdater this service needs, so tests can inject a fake. */
export interface AutoUpdaterLike {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  allowPrerelease: boolean;
  logger: unknown;
  checkForUpdates(): Promise<unknown>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
  on(event: string, listener: (...args: any[]) => void): unknown; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export interface UpdateServiceOptions {
  updater: AutoUpdaterLike;
  /** Version of the running app, used for the "up to date" message. */
  currentVersion: string;
  /** Plain-language reason updating is impossible here, or null when it is possible. */
  unavailableReason: string | null;
  /** Called on every state change (the main process forwards it to renderer windows). */
  onState: (state: UpdateState) => void;
  logger?: Pick<Console, 'warn'>;
  /** How long a check may take before it is reported as unreachable. Default 30 seconds. */
  checkTimeoutMs?: number;
}

export const DEFAULT_CHECK_TIMEOUT_MS = 30_000;

export const NOT_INSTALLED_REASON = 'Updates only work in the installed app.';
export const PORTABLE_REASON =
  'This portable copy cannot update itself. Download the newest version from the releases page.';
export const OFFLINE_MESSAGE = 'Could not reach the update server. Check your internet connection.';
export const NO_RELEASE_MESSAGE = 'No update information has been published yet. Try again later.';
export const GENERIC_ERROR_MESSAGE = 'Something went wrong while checking for updates. Try again later.';

const OFFLINE_CODES = /ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENETUNREACH|EAI_AGAIN|ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|ERR_NETWORK_CHANGED|ERR_CONNECTION|ERR_TIMED_OUT|net::/i;
const NOT_FOUND = /\b404\b|Cannot find latest|HttpError: 404|No published versions/i;

/** Turns any updater failure into a short sentence a student can act on; the raw error stays in the log. */
export function friendlyUpdateError(error: unknown): string {
  const text = error instanceof Error ? `${error.name} ${error.message} ${(error as NodeJS.ErrnoException).code ?? ''}` : String(error);
  if (OFFLINE_CODES.test(text)) return OFFLINE_MESSAGE;
  if (NOT_FOUND.test(text)) return NO_RELEASE_MESSAGE;
  return GENERIC_ERROR_MESSAGE;
}

/**
 * Owns the update lifecycle. Auto-update is never automatic here: nothing happens until the renderer asks
 * (check, then download, then install), so the app makes no network request on its own.
 */
export class UpdateService {
  private state: UpdateState;
  private readonly updater: AutoUpdaterLike;
  private readonly options: UpdateServiceOptions;

  constructor(options: UpdateServiceOptions) {
    this.options = options;
    this.updater = options.updater;
    this.state = options.unavailableReason ? { state: 'unavailable', reason: options.unavailableReason } : { state: 'idle' };

    const u = this.updater;
    u.autoDownload = false;
    u.autoInstallOnAppQuit = false;
    u.allowPrerelease = false;
    u.logger = console;

    u.on('checking-for-update', () => this.set({ state: 'checking' }));
    u.on('update-available', (info: { version: string }) => this.set({ state: 'available', version: String(info?.version ?? '') }));
    u.on('update-not-available', () => this.set({ state: 'not-available', version: options.currentVersion }));
    u.on('download-progress', (progress: { percent?: number }) =>
      this.set({ state: 'downloading', percent: clampPercent(progress?.percent) }),
    );
    u.on('update-downloaded', (info: { version: string }) => this.set({ state: 'downloaded', version: String(info?.version ?? '') }));
    u.on('error', (error: unknown) => this.fail(error));
  }

  getState(): UpdateState {
    return this.state;
  }

  async check(): Promise<UpdateState> {
    if (this.state.state === 'unavailable' || this.state.state === 'checking' || this.state.state === 'downloading') {
      return this.state;
    }
    if (this.state.state === 'downloaded') return this.state;
    this.set({ state: 'checking' });
    const timeoutMs = this.options.checkTimeoutMs ?? DEFAULT_CHECK_TIMEOUT_MS;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), timeoutMs);
    });
    // The underlying request can stall without ever failing (captive portals, proxy lookups), so a check
    // that outlives the timeout is reported as unreachable instead of spinning forever.
    const request = this.updater.checkForUpdates().then(() => 'done' as const);
    request.catch(() => undefined); // a late failure after the timeout must not become an unhandled rejection
    try {
      const outcome = await Promise.race([request, timedOut]);
      if (outcome === 'timeout') {
        if (this.getState().state === 'checking') this.fail(new Error('ETIMEDOUT: the update check took too long'));
      } else if (this.getState().state === 'checking') {
        // Some feeds resolve without emitting an event; never leave the UI spinning.
        this.set({ state: 'not-available', version: this.options.currentVersion });
      }
    } catch (error) {
      this.fail(error);
    } finally {
      clearTimeout(timer);
    }
    return this.state;
  }

  async download(): Promise<UpdateState> {
    if (this.state.state !== 'available') return this.state;
    this.set({ state: 'downloading', percent: 0 });
    try {
      await this.updater.downloadUpdate();
    } catch (error) {
      this.fail(error);
    }
    return this.state;
  }

  /** Restarts into the installer. Only valid once the update has finished downloading. */
  install(): void {
    if (this.state.state !== 'downloaded') return;
    this.updater.quitAndInstall(true, true);
  }

  private set(next: UpdateState): void {
    if (this.state.state === 'unavailable') return;
    this.state = next;
    this.options.onState(next);
  }

  private fail(error: unknown): void {
    (this.options.logger ?? console).warn('Update error:', error);
    // An error mid-download should let the user retry the check, so it returns to a retryable state.
    this.set({ state: 'error', message: friendlyUpdateError(error) });
  }
}

function clampPercent(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}
