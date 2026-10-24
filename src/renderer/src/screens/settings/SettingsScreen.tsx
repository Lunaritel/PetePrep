import { useId, useState } from 'react';
import type { ScreenProps } from '../../app/types';
import {
  exportBackupToFile,
  isAutoBackupEnabled,
  restoreBackupFromFile,
  setAutoBackupEnabled,
} from '../../storage/backupService';
import { ConfirmDialog } from '../library/ConfirmDialog';
import { btnDanger, btnPrimary, btnSecondary, card } from '../library/ui';

const BACKUP_FOLDER = 'Documents\\DECA Mastery Backups';
const WIPE_WORD = 'DELETE';

type Notice = { kind: 'success' | 'info' | 'error'; text: string } | null;
type Dialog = 'restore' | 'wipe' | null;

function errorText(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

export function SettingsScreen({ repo, navigate }: ScreenProps) {
  const [notice, setNotice] = useState<Notice>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [auto, setAuto] = useState<boolean>(() => isAutoBackupEnabled());
  const [typed, setTyped] = useState('');
  const typedId = useId();
  const version = window.deca?.version ?? 'dev';

  const run = async (work: () => Promise<Notice>): Promise<void> => {
    setBusy(true);
    setNotice(null);
    try {
      setNotice(await work());
    } catch (e) {
      setNotice({ kind: 'error', text: errorText(e, 'Something went wrong.') });
    } finally {
      setBusy(false);
    }
  };

  const exportNow = (): Promise<void> =>
    run(async () => {
      const path = await exportBackupToFile(repo);
      return path
        ? { kind: 'success', text: `Backup saved to ${path}.` }
        : { kind: 'info', text: 'Export cancelled. Nothing was saved.' };
    });

  const restoreNow = async (): Promise<void> => {
    setDialog(null);
    await run(async () => {
      try {
        const restored = await restoreBackupFromFile(repo);
        return restored
          ? { kind: 'success', text: 'Backup restored. Your library now matches the backup file.' }
          : { kind: 'info', text: 'Restore cancelled. Your data was not changed.' };
      } catch (e) {
        throw new Error(`${errorText(e, 'That file could not be restored.')} Your current data was not changed.`);
      }
    });
  };

  const wipeNow = async (): Promise<void> => {
    setDialog(null);
    setTyped('');
    await run(async () => {
      const exams = await repo.listExams();
      for (const exam of exams) await repo.deleteExam(exam.id);
      return { kind: 'success', text: 'All exams and progress were deleted.' };
    });
  };

  const toggleAuto = (enabled: boolean): void => {
    setAutoBackupEnabled(enabled);
    setAuto(isAutoBackupEnabled());
  };

  return (
    <section aria-labelledby="settings-heading" className="mx-auto max-w-3xl space-y-6 px-5 py-8">
      <h1 id="settings-heading" className="text-2xl font-bold text-ink">
        Settings
      </h1>

      <div aria-live="polite" role="status" className="empty:hidden">
        {notice && notice.kind !== 'error' && (
          <p
            className={`rounded-lg border px-4 py-3 text-sm ${
              notice.kind === 'success'
                ? 'border-correct bg-correct-bg text-correct'
                : 'border-line bg-surface text-ink'
            }`}
          >
            {notice.text}
            {notice.kind === 'success' && notice.text.startsWith('Backup restored') && (
              <>
                {' '}
                <button type="button" className="font-semibold underline" onClick={() => navigate({ name: 'library' })}>
                  Go to library
                </button>
              </>
            )}
          </p>
        )}
      </div>
      {notice?.kind === 'error' && (
        <p role="alert" className="rounded-lg border border-wrong bg-wrong-bg px-4 py-3 text-sm text-wrong">
          {notice.text}
        </p>
      )}

      <div className={card}>
        <h2 className="mb-1 text-lg font-bold text-ink">Backup and restore</h2>
        <p className="mb-4 text-sm text-muted">
          A backup is one file with your exams, pictures and progress. Keep a copy somewhere safe, or move it to another
          computer.
        </p>
        <div className="mb-5 flex flex-wrap gap-2">
          <button type="button" className={btnPrimary} disabled={busy} onClick={() => void exportNow()}>
            Export backup…
          </button>
          <button type="button" className={btnSecondary} disabled={busy} onClick={() => setDialog('restore')}>
            Restore from backup…
          </button>
        </div>
        <label className="flex min-h-11 cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            role="switch"
            checked={auto}
            onChange={(e) => toggleAuto(e.target.checked)}
            className="mt-1 h-5 w-5 accent-accent"
          />
          <span>
            <span className="block font-semibold text-ink">Back up automatically after each session</span>
            <span className="block text-sm text-muted">
              Saves a copy to <code className="rounded bg-bg px-1">{BACKUP_FOLDER}</code> every time you finish a round.
            </span>
          </span>
        </label>
      </div>

      <div className={card}>
        <h2 className="mb-2 text-lg font-bold text-ink">About</h2>
        <p className="text-sm text-ink">
          <strong>DECA Mastery</strong> · version {version}
        </p>
        <p className="mt-2 text-sm text-muted">
          Works fully offline. There are no accounts, no tracking and no telemetry, and no exam content is bundled with the
          app: you import your own DECA exam PDF and it never leaves this computer.
        </p>
        <button type="button" className={`${btnSecondary} mt-4`} disabled>
          Check for updates (coming later)
        </button>
      </div>

      <div className={`${card} border-wrong`}>
        <h2 className="mb-1 text-lg font-bold text-wrong">Reset all data</h2>
        <p className="mb-4 text-sm text-muted">
          Permanently deletes every exam, picture and answer from this computer. Export a backup first if you might want
          anything back.
        </p>
        <button type="button" className={btnDanger} disabled={busy} onClick={() => setDialog('wipe')}>
          Reset all data…
        </button>
      </div>

      {dialog === 'restore' && (
        <ConfirmDialog
          title="Restore from a backup?"
          confirmLabel="Choose backup file…"
          destructive
          onConfirm={() => void restoreNow()}
          onCancel={() => setDialog(null)}
        >
          <p>
            Restoring <strong>replaces all current data</strong> (exams, pictures and progress) with the contents of the
            backup file. Anything not in that file is lost.
          </p>
          <p className="text-muted">The file is checked first; if it is damaged, nothing changes.</p>
        </ConfirmDialog>
      )}

      {dialog === 'wipe' && (
        <ConfirmDialog
          title="Delete everything?"
          confirmLabel="Delete everything"
          destructive
          confirmDisabled={typed !== WIPE_WORD}
          onConfirm={() => void wipeNow()}
          onCancel={() => {
            setDialog(null);
            setTyped('');
          }}
        >
          <p>This removes all exams and progress and cannot be undone.</p>
          <div>
            <label htmlFor={typedId} className="mb-1 block font-semibold">
              Type {WIPE_WORD} to confirm
            </label>
            <input
              id={typedId}
              data-autofocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="min-h-11 w-full rounded-lg border border-line bg-bg px-3 text-ink"
            />
          </div>
        </ConfirmDialog>
      )}
    </section>
  );
}
