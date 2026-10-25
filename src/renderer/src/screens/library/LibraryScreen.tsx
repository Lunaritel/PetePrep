import { useCallback, useEffect, useState } from 'react';
import { HelpPanel } from '../../app/HelpPanel';
import { BANK_RULE, HELP } from '../../app/helpText';
import type { ScreenProps } from '../../app/types';
import { isInMistakeBank } from '../../storage/mistakeBank';
import { loadStudy, type Study } from '../../storage/studyService';
import { ConfirmDialog } from './ConfirmDialog';
import { formatDate, formatRelative } from './format';
import { hasSeenHelp, markHelpSeen } from './helpSeen';
import { btnPrimary, btnQuiet, btnSecondary, card } from './ui';

interface ExamCard {
  study: Study;
  /** Latest answer time across the exam, if it has ever been studied. */
  lastStudiedAt?: string;
  /** Questions of this exam currently in the mistake bank. */
  weakCount: number;
  /** Whether any question of this exam was ever missed (even if it has since left the bank). */
  everMissed: boolean;
}

/** Mistake-bank figures come straight from the replay already done by loadStudy. */
export function reviewFigures(study: Study): Pick<ExamCard, 'weakCount' | 'everMissed'> {
  let weakCount = 0;
  let everMissed = false;
  for (const q of study.questions) {
    const info = study.review.get(q.id);
    if (info && info.timesMissed > 0) everMissed = true;
    if (isInMistakeBank(info)) weakCount += 1;
  }
  return { weakCount, everMissed };
}

const HELP_ENTRIES = [HELP.practice, HELP.master, HELP.weak, HELP.bank, HELP.stats, HELP.reset, HELP.delete];

type Pending = { kind: 'delete' | 'reset'; card: ExamCard };

function lastAnswerTime(study: Study): string | undefined {
  let latest: string | undefined;
  for (const answer of study.answers) if (!latest || answer.answeredAt > latest) latest = answer.answeredAt;
  return latest;
}

/** Most recently studied first; never-studied exams follow, newest import first. */
export function sortCards(cards: ExamCard[]): ExamCard[] {
  return [...cards].sort((a, b) => {
    if (a.lastStudiedAt && b.lastStudiedAt) return b.lastStudiedAt.localeCompare(a.lastStudiedAt);
    if (a.lastStudiedAt) return -1;
    if (b.lastStudiedAt) return 1;
    return b.study.exam.importedAt.localeCompare(a.study.exam.importedAt);
  });
}

function noQuestionsReason(study: Study): string | null {
  return study.questions.length === 0 ? 'This exam has no questions to study.' : null;
}

function weakDisabledReason(item: ExamCard): string | null {
  const none = noQuestionsReason(item.study);
  if (none) return none;
  if (item.weakCount > 0) return null;
  return item.everMissed ? 'All clear: nothing left to review.' : 'Nothing missed yet.';
}

function masterDisabledReason(study: Study): string | null {
  const none = noQuestionsReason(study);
  if (none) return none;
  return study.complete ? 'Every question is mastered, so there is nothing left to drill.' : null;
}

export function LibraryScreen({ repo, navigate }: ScreenProps) {
  const [cards, setCards] = useState<ExamCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const exams = await repo.listExams();
      const studies = await Promise.all(exams.map((exam) => loadStudy(repo, exam.id)));
      const loaded = sortCards(
        studies.map((study) => ({ study, lastStudiedAt: lastAnswerTime(study), ...reviewFigures(study) })),
      );
      setCards(loaded);
      setError(null);
      // A brand-new user (exams imported, nothing answered yet) sees the help panel open exactly once.
      if (loaded.length > 0 && loaded.every((c) => c.study.answers.length === 0) && !hasSeenHelp()) {
        setHelpOpen(true);
        markHelpSeen();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The library could not be loaded.');
    }
  }, [repo]);

  useEffect(() => {
    void load();
  }, [load]);

  const confirm = async (): Promise<void> => {
    if (!pending) return;
    setBusy(true);
    try {
      if (pending.kind === 'delete') await repo.deleteExam(pending.card.study.exam.id);
      else await repo.resetProgress(pending.card.study.exam.id);
      setPending(null);
      await load();
    } catch (e) {
      setPending(null);
      setError(e instanceof Error ? e.message : 'That action failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="library-heading" className="mx-auto max-w-4xl px-4 py-6 sm:px-5 sm:py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 id="library-heading" className="text-2xl font-bold text-ink">
            Your exams
          </h1>
          <p className="text-sm text-muted">Pick an exam to practice, or import a new one.</p>
        </div>
        <button type="button" className={btnPrimary} onClick={() => navigate({ name: 'import' })}>
          Import exam PDF
        </button>
      </div>

      {error && (
        <p role="alert" className="mb-4 rounded-lg border border-wrong bg-wrong-bg px-4 py-3 text-sm text-wrong">
          {error}
        </p>
      )}

      {cards === null && !error && <p className="text-muted">Loading your exams…</p>}

      {cards !== null && cards.length === 0 && (
        <div className={`${card} text-center`}>
          <h2 className="mb-2 text-lg font-bold text-ink">No exams yet</h2>
          <p className="mx-auto mb-4 max-w-md text-sm text-muted">
            Import your DECA exam PDF (the one that includes the answer key and explanations). The app reads the
            questions, lets you check them, and then builds your practice and mastery rounds. Everything stays on this
            computer.
          </p>
          <button type="button" className={btnPrimary} onClick={() => navigate({ name: 'import' })}>
            Import your first exam
          </button>
        </div>
      )}

      {cards !== null && cards.length > 0 && (
        <div className="mb-6 space-y-3">
          <BankStrip cards={cards} navigate={navigate} />
          <HelpPanel
            entries={HELP_ENTRIES}
            footer={BANK_RULE}
            open={helpOpen}
            onToggle={(open) => {
              setHelpOpen(open);
              if (!open) markHelpSeen();
            }}
          />
        </div>
      )}

      {cards !== null && cards.length > 0 && (
        <ul className="space-y-4">
          {cards.map((item) => (
            <ExamCardView
              key={item.study.exam.id}
              item={item}
              navigate={navigate}
              onDelete={() => setPending({ kind: 'delete', card: item })}
              onReset={() => setPending({ kind: 'reset', card: item })}
            />
          ))}
        </ul>
      )}

      {pending?.kind === 'delete' && (
        <ConfirmDialog
          title="Delete this exam?"
          confirmLabel={busy ? 'Deleting…' : 'Delete exam'}
          destructive
          confirmDisabled={busy}
          onConfirm={() => void confirm()}
          onCancel={() => setPending(null)}
        >
          <p>
            <strong>{pending.card.study.exam.title}</strong> and all of your progress on it will be permanently
            deleted. You would need to import the PDF again to study it.
          </p>
        </ConfirmDialog>
      )}

      {pending?.kind === 'reset' && (
        <ConfirmDialog
          title="Reset progress?"
          confirmLabel={busy ? 'Resetting…' : 'Reset progress'}
          destructive
          confirmDisabled={busy}
          onConfirm={() => void confirm()}
          onCancel={() => setPending(null)}
        >
          <p>
            Every answer and round for <strong>{pending.card.study.exam.title}</strong> will be erased and all
            questions go back to unseen. The exam itself stays in your library.
          </p>
        </ConfirmDialog>
      )}
    </section>
  );
}

interface CardProps {
  item: ExamCard;
  navigate: ScreenProps['navigate'];
  onDelete: () => void;
  onReset: () => void;
}

function ExamCardView({ item, navigate, onDelete, onReset }: CardProps) {
  const { study } = item;
  const { exam, progress } = study;
  const practiceReason = noQuestionsReason(study);
  const masterReason = masterDisabledReason(study);
  const weakReason = weakDisabledReason(item);
  const total = Math.max(1, progress.total);
  const reasonId = `reason-${exam.id}`;
  const reasons = [practiceReason, masterReason, weakReason].filter((r, i, all): r is string => r !== null && all.indexOf(r) === i);

  return (
    <li className={card}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-ink">{exam.title}</h2>
          <p className="text-sm text-muted">
            {exam.testCode ? `Test ${exam.testCode} · ` : ''}
            {progress.total} {progress.total === 1 ? 'question' : 'questions'}
          </p>
        </div>
        <p className="text-2xl font-bold text-ink" aria-hidden="true">
          {progress.percentMastered}%
        </p>
      </div>

      <div
        role="progressbar"
        aria-label={`Mastery of ${exam.title}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.percentMastered}
        aria-valuetext={`${progress.percentMastered}% mastered`}
        className="mb-2 flex h-3 overflow-hidden rounded-full bg-line"
      >
        <div className="bg-correct" style={{ width: `${(progress.mastered / total) * 100}%` }} />
        <div className="bg-accent" style={{ width: `${(progress.learning / total) * 100}%` }} />
      </div>
      <p className="mb-1 text-sm text-ink">
        <span className="font-semibold text-correct">{progress.mastered} mastered</span> ·{' '}
        <span className="font-semibold text-accent">{progress.learning} learning</span> ·{' '}
        <span className="font-semibold text-muted">{progress.unseen} unseen</span>
        {item.weakCount > 0 && (
          <>
            {' '}
            · <span className="font-semibold text-warn">{item.weakCount} in mistake bank</span>
          </>
        )}
      </p>
      <p className="mb-4 text-xs text-muted">
        {item.lastStudiedAt ? `Last studied ${formatRelative(item.lastStudiedAt)}` : 'Not studied yet'} · Imported{' '}
        {formatDate(exam.importedAt)}
      </p>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
          <button
            type="button"
            className={btnPrimary}
            disabled={practiceReason !== null}
            aria-describedby={practiceReason ? reasonId : undefined}
            aria-label={`Practice ${exam.title}`}
            title={HELP.practice.short}
            onClick={() => navigate({ name: 'practice', examId: exam.id })}
          >
            {HELP.practice.label}
          </button>
          <button
            type="button"
            className={btnSecondary}
            disabled={masterReason !== null}
            aria-describedby={masterReason ? reasonId : undefined}
            aria-label={`Master exam for ${exam.title}`}
            title={HELP.master.short}
            onClick={() => navigate({ name: 'master', examId: exam.id })}
          >
            {HELP.master.label}
          </button>
          <button
            type="button"
            className={btnSecondary}
            disabled={weakReason !== null}
            aria-describedby={weakReason ? reasonId : undefined}
            aria-label={`Weak points for ${exam.title}`}
            title={HELP.weak.short}
            onClick={() => navigate({ name: 'weak', examId: exam.id })}
          >
            {HELP.weak.label}
            {item.weakCount > 0 ? ` (${item.weakCount})` : ''}
          </button>
          <button
            type="button"
            className={btnSecondary}
            aria-label={`Stats for ${exam.title}`}
            title={HELP.stats.short}
            onClick={() => navigate({ name: 'stats', examId: exam.id })}
          >
            {HELP.stats.label}
          </button>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
          <button
            type="button"
            className={btnQuiet}
            aria-label={`Reset progress for ${exam.title}`}
            title={HELP.reset.short}
            onClick={onReset}
          >
            {HELP.reset.label}
          </button>
          <button
            type="button"
            className={btnQuiet}
            aria-label={`Delete ${exam.title}`}
            title={HELP.delete.short}
            onClick={onDelete}
          >
            {HELP.delete.label}
          </button>
        </div>
      </div>
      {reasons.length > 0 && (
        <p id={reasonId} className="mt-3 text-sm text-muted">
          {reasons.join(' ')}
        </p>
      )}
    </li>
  );
}

function BankStrip({ cards, navigate }: { cards: ExamCard[]; navigate: ScreenProps['navigate'] }) {
  const total = cards.reduce((sum, c) => sum + c.weakCount, 0);
  const exams = cards.filter((c) => c.weakCount > 0).length;
  const everMissed = cards.some((c) => c.everMissed);
  const reasonId = 'bank-strip-reason';
  const reason = total > 0 ? null : everMissed ? 'All clear: nothing left to review.' : 'Nothing missed yet.';

  return (
    <section aria-labelledby="bank-strip-heading" className={`${card} flex flex-wrap items-center justify-between gap-3`}>
      <div>
        <h2 id="bank-strip-heading" className="text-base font-bold text-ink">
          {HELP.bank.label}
        </h2>
        <p className="text-sm text-muted">
          {total > 0
            ? `${total} ${total === 1 ? 'question' : 'questions'} from ${exams} ${exams === 1 ? 'exam' : 'exams'} to review.`
            : 'Questions you miss will collect here, from every exam.'}
        </p>
        {reason && (
          <p id={reasonId} className="text-xs text-muted">
            {reason}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={btnSecondary}
          disabled={total === 0}
          aria-describedby={reason ? reasonId : undefined}
          title={HELP.bank.short}
          onClick={() => navigate({ name: 'bank' })}
        >
          Drill all mistakes
        </button>
        <button
          type="button"
          className="min-h-11 rounded-lg px-2 text-sm font-semibold text-accent-strong underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          onClick={() => navigate({ name: 'bank' })}
        >
          Open mistake bank
        </button>
      </div>
    </section>
  );
}
