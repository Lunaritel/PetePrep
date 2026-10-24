import { useCallback, useEffect, useState } from 'react';
import type { ScreenProps } from '../../app/types';
import { loadStudy, type Study } from '../../storage/studyService';
import { ConfirmDialog } from './ConfirmDialog';
import { formatDate, formatRelative } from './format';
import { btnPrimary, btnSecondary, card } from './ui';

interface ExamCard {
  study: Study;
  /** Latest answer time across the exam, if it has ever been studied. */
  lastStudiedAt?: string;
}

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

  const load = useCallback(async () => {
    try {
      const exams = await repo.listExams();
      const studies = await Promise.all(exams.map((exam) => loadStudy(repo, exam.id)));
      setCards(sortCards(studies.map((study) => ({ study, lastStudiedAt: lastAnswerTime(study) }))));
      setError(null);
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
    <section aria-labelledby="library-heading" className="mx-auto max-w-4xl px-5 py-8">
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
  const total = Math.max(1, progress.total);
  const reasonId = `reason-${exam.id}`;
  const reasons = [practiceReason, masterReason].filter((r, i, all): r is string => r !== null && all.indexOf(r) === i);

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
      </p>
      <p className="mb-4 text-xs text-muted">
        {item.lastStudiedAt ? `Last studied ${formatRelative(item.lastStudiedAt)}` : 'Not studied yet'} · Imported{' '}
        {formatDate(exam.importedAt)}
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={btnPrimary}
          disabled={practiceReason !== null}
          aria-describedby={practiceReason ? reasonId : undefined}
          aria-label={`Practice ${exam.title}`}
          onClick={() => navigate({ name: 'practice', examId: exam.id })}
        >
          Practice
        </button>
        <button
          type="button"
          className={btnSecondary}
          disabled={masterReason !== null}
          aria-describedby={masterReason ? reasonId : undefined}
          aria-label={`Master exam for ${exam.title}`}
          onClick={() => navigate({ name: 'master', examId: exam.id })}
        >
          Master exam
        </button>
        <button
          type="button"
          className={btnSecondary}
          aria-label={`Stats for ${exam.title}`}
          onClick={() => navigate({ name: 'stats', examId: exam.id })}
        >
          Stats
        </button>
        <button type="button" className={btnSecondary} aria-label={`Reset progress for ${exam.title}`} onClick={onReset}>
          Reset progress
        </button>
        <button type="button" className={btnSecondary} aria-label={`Delete ${exam.title}`} onClick={onDelete}>
          Delete
        </button>
      </div>
      {reasons.length > 0 && (
        <p id={reasonId} className="mt-3 text-sm text-muted">
          {reasons.join(' ')}
        </p>
      )}
    </li>
  );
}
