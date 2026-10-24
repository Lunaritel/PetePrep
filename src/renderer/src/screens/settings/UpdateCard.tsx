import { useEffect, useState } from 'react';
import type { UpdateState } from '../../../../preload/updateTypes';
import { isAutoUpdateEnabled, setAutoUpdateEnabled } from '../../app/updatePrefs';
import { btnPrimary, btnSecondary, card } from '../library/ui';

const NO_BRIDGE: UpdateState = { state: 'unavailable', reason: 'Updates only work in the installed app.' };

/** What the status line says for each state. Kept apart from the buttons so it can sit in one live region. */
function statusText(update: UpdateState, version: string): string {
  switch (update.state) {
    case 'unavailable':
      return update.reason;
    case 'idle':
      return 'DECAPete only looks for updates when you ask, or if you turn on automatic checks below.';
    case 'checking':
      return 'Checking for updates…';
    case 'not-available':
      return `You are up to date (version ${update.version || version}).`;
    case 'available':
      return `Version ${update.version} is available.`;
    case 'downloading':
      return `Downloading the update… ${update.percent}%`;
    case 'downloaded':
      return `Version ${update.version} is ready. Restart DECAPete to finish installing it.`;
    case 'error':
      return update.message;
  }
}

export function UpdateCard() {
  const deca = window.deca;
  const version = deca?.version ?? 'dev';
  const [update, setUpdate] = useState<UpdateState>(deca ? { state: 'idle' } : NO_BRIDGE);
  const [auto, setAuto] = useState<boolean>(() => isAutoUpdateEnabled());

  useEffect(() => {
    if (!deca) return;
    let alive = true;
    void deca.getUpdateState().then((s) => alive && setUpdate(s)).catch(() => undefined);
    const stop = deca.onUpdateState((s) => alive && setUpdate(s));
    return () => {
      alive = false;
      stop();
    };
  }, [deca]);

  const run = (action: () => Promise<UpdateState | void>): void => {
    void action().then((s) => s && setUpdate(s)).catch(() => setUpdate({ state: 'error', message: 'Something went wrong. Try again later.' }));
  };

  const busy = update.state === 'checking' || update.state === 'downloading';
  const unavailable = update.state === 'unavailable';
  // Primary only when checking is the real next step; otherwise another button (or a wait) takes the lead.
  const checkIsPrimary = update.state === 'idle' || update.state === 'not-available' || update.state === 'error';

  return (
    <div className={card}>
      <h2 className="mb-1 text-lg font-bold text-ink">Updates</h2>
      <p className="mb-4 text-sm text-ink">
        <strong>DECAPete</strong> · version {version}
      </p>

      <div className="mb-4 min-h-6" role="status" aria-live="polite">
        <p className={`text-sm ${update.state === 'error' ? 'text-wrong' : 'text-muted'}`}>{statusText(update, version)}</p>
        {update.state === 'downloading' && (
          <div
            role="progressbar"
            aria-label="Update download"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={update.percent}
            className="mt-2 h-2 overflow-hidden rounded-full bg-sunken"
          >
            <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${update.percent}%` }} />
          </div>
        )}
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {update.state === 'available' ? (
          <button type="button" className={btnPrimary} onClick={() => run(() => deca!.downloadUpdate())}>
            Download version {update.version}
          </button>
        ) : update.state === 'downloaded' ? (
          <button type="button" className={btnPrimary} onClick={() => run(() => deca!.installUpdate())}>
            Restart and install
          </button>
        ) : null}
        <button
          type="button"
          className={checkIsPrimary ? btnPrimary : btnSecondary}
          disabled={!deca || unavailable || busy || update.state === 'downloaded'}
          onClick={() => run(() => deca!.checkForUpdates())}
        >
          Check for updates
        </button>
      </div>

      <label className="flex min-h-11 cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          role="switch"
          checked={auto}
          disabled={!deca || unavailable}
          onChange={(e) => {
            setAuto(e.target.checked);
            setAutoUpdateEnabled(e.target.checked);
          }}
          className="mt-1 h-5 w-5 accent-accent"
        />
        <span>
          <span className="block font-semibold text-ink">Check for updates automatically</span>
          <span className="block text-sm text-muted">
            Looks once when the app starts. Nothing downloads or installs until you say so.
          </span>
        </span>
      </label>

      <p className="mt-4 text-xs text-muted">
        Checking for updates is the only time DECAPete uses the internet. It asks GitHub whether a newer version exists and sends
        nothing about you or your exams.
      </p>
    </div>
  );
}
