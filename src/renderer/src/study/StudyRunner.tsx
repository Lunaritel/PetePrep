import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SnapshotImage } from '../components/SnapshotImage';
import type { QuestionRow, Repository, SessionRow } from '../storage/contract';
import { maybeAutoBackup } from '../storage/backupService';
import { LETTERS, answerQuestion } from '../storage/studyService';
import { Card, Page, PrimaryButton, SecondaryButton } from './ui';

interface Props {
  repo: Repository;
  session: SessionRow;
  /** Every studyable question of the exam; the session's own list decides order and membership. */
  questions: QuestionRow[];
  heading: string;
  /** When set (mixed-exam drills), each question shows a chip with the title of the exam it came from. */
  examTitles?: ReadonlyMap<string, string>;
  /** Leaves without ending the session. Every answer is already saved, so it can be resumed. */
  onExit: () => void;
  /** Called once, after the session is marked complete. */
  onFinished: () => void;
}

interface Feedback {
  chosen: number;
  correct: boolean;
}

const KEY_TO_INDEX: Record<string, number> = { a: 0, b: 1, c: 2, d: 3, '1': 0, '2': 1, '3': 2, '4': 3 };

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable;
}

/** One-question-at-a-time loop shared by practice and master rounds. Option order is never changed. */
export function StudyRunner({ repo, session, questions, heading, examTitles, onExit, onFinished }: Props) {
  const order = useMemo(() => {
    const byId = new Map(questions.map((q) => [q.id, q]));
    return session.questionIds.flatMap((id) => {
      const q = byId.get(id);
      return q ? [q] : [];
    });
  }, [questions, session.questionIds]);

  const [index, setIndex] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [error, setError] = useState<string | null>(null);

  const shownAt = useRef(Date.now());
  const answering = useRef(false);
  const finishing = useRef(false);
  const nextRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const finish = useCallback(async () => {
    if (finishing.current) return;
    finishing.current = true;
    try {
      if (!(await repo.getSession(session.id))?.completedAt) await repo.completeSession(session.id);
      void maybeAutoBackup(repo).catch(() => null);
      onFinished();
    } catch (e) {
      finishing.current = false;
      setError(e instanceof Error ? e.message : 'Could not finish this session.');
    }
  }, [repo, session.id, onFinished]);

  // Resume at the first unanswered question; if everything was already answered, just finish.
  useEffect(() => {
    let cancelled = false;
    void repo.listSessionAnswers(session.id).then((answers) => {
      if (cancelled) return;
      const done = new Set(answers.map((a) => a.questionId));
      const first = order.findIndex((q) => !done.has(q.id));
      if (first === -1) void finish();
      else {
        shownAt.current = Date.now();
        setIndex(first);
      }
    });
    return () => {
      cancelled = true;
    };
    // Only on mount / when the session changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo, session.id]);

  const question = index === null ? undefined : order[index];

  const choose = useCallback(
    async (chosen: number) => {
      if (!question || feedback || answering.current) return;
      answering.current = true;
      setError(null);
      try {
        await answerQuestion(repo, session, question, chosen, Date.now() - shownAt.current);
        setFeedback({ chosen, correct: chosen === question.correctIndex });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save that answer. Try again.');
      } finally {
        answering.current = false;
      }
    },
    [question, feedback, repo, session],
  );

  const next = useCallback(() => {
    if (index === null || !feedback) return;
    if (index + 1 >= order.length) {
      void finish();
      return;
    }
    shownAt.current = Date.now();
    setFeedback(null);
    setIndex(index + 1);
  }, [index, feedback, order.length, finish]);

  useEffect(() => {
    if (feedback) nextRef.current?.focus();
  }, [feedback]);

  useEffect(() => {
    if (index !== null && !feedback) headingRef.current?.focus({ preventScroll: false });
  }, [index, feedback]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target)) return;
      if (!feedback) {
        const chosen = KEY_TO_INDEX[event.key.toLowerCase()];
        if (chosen !== undefined) {
          event.preventDefault();
          void choose(chosen);
        }
      } else if (event.key === 'Enter') {
        // A focused button already handles Enter natively; only act when focus is elsewhere.
        const target = event.target;
        if (target instanceof HTMLElement && (target.tagName === 'BUTTON' || target.tagName === 'A')) return;
        event.preventDefault();
        next();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [choose, next, feedback]);

  if (order.length === 0) {
    return (
      <Page>
        <Card>
          <p>This session has no questions left to study.</p>
          <SecondaryButton className="mt-4" onClick={onExit}>
            Back to library
          </SecondaryButton>
        </Card>
      </Page>
    );
  }
  if (!question || index === null) {
    return (
      <Page>
        <p role="status" className="text-muted">
          Loading…
        </p>
      </Page>
    );
  }

  const correctLetter = LETTERS[question.correctIndex];
  const last = index + 1 >= order.length;

  return (
    <Page>
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-accent-strong">{heading}</span>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted">
            Question {index + 1} of {order.length}
          </span>
          <SecondaryButton onClick={onExit}>Exit</SecondaryButton>
        </div>
      </div>

      <Card>
        {examTitles && examTitles.get(question.examId) && (
          <p className="mb-3">
            <span
              data-testid="exam-chip"
              className="inline-block max-w-full truncate rounded-full border border-line bg-bg px-3 py-0.5 align-middle text-xs font-semibold text-muted"
            >
              {examTitles.get(question.examId)}
            </span>
          </p>
        )}
        <SnapshotImage blob={question.snapshot} alt={`Question ${question.number} as printed in the exam PDF`} className="mb-4 w-full rounded-lg border border-line bg-surface" />
        <h2 ref={headingRef} tabIndex={-1} className={question.snapshot ? 'sr-only' : 'mb-4 text-xl font-semibold leading-snug outline-none'}>
          {question.prompt}
        </h2>

        <div role="group" aria-label="Answer choices" className="grid gap-3">
          {question.options.map((text, i) => {
            const isChosen = feedback?.chosen === i;
            const isAnswer = question.correctIndex === i;
            let state = 'border-line bg-surface hover:border-accent';
            let note = '';
            if (feedback) {
              if (isAnswer) {
                state = 'border-correct bg-correct-bg';
                note = isChosen ? 'Your answer · correct' : 'Correct answer';
              } else if (isChosen) {
                state = 'border-wrong bg-wrong-bg';
                note = 'Your answer · incorrect';
              } else state = 'border-line bg-surface opacity-60';
            }
            return (
              <button
                key={i}
                type="button"
                disabled={feedback !== null}
                onClick={() => void choose(i)}
                aria-label={`${LETTERS[i]}: ${text}${note ? `, ${note}` : ''}`}
                className={`flex min-h-11 w-full items-start gap-3 rounded-xl border-2 px-4 py-3 text-left text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${state}`}
              >
                <span aria-hidden="true" className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md bg-bg text-sm font-bold text-ink">
                  {LETTERS[i]}
                </span>
                <span aria-hidden="true" className="flex-1">
                  {text}
                  {note && <span className="mt-1 block text-sm font-semibold">{note}</span>}
                </span>
              </button>
            );
          })}
        </div>

        <div aria-live="polite" className="mt-5">
          {feedback && (
            <div className={`rounded-xl border-2 p-4 ${feedback.correct ? 'border-correct bg-correct-bg' : 'border-wrong bg-wrong-bg'}`}>
              <p className={`text-lg font-bold ${feedback.correct ? 'text-correct' : 'text-wrong'}`}>
                {feedback.correct ? 'Correct' : `Not quite - the answer is ${correctLetter}`}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-base leading-relaxed" data-testid="explanation">
                {question.explanation}
              </p>
            </div>
          )}
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-lg bg-wrong-bg p-3 text-wrong">
            {error}
          </p>
        )}

        <div className="mt-5 flex items-center justify-between gap-3">
          <span className="text-sm text-muted">{feedback ? 'Press Enter for the next question' : 'Press A to D or 1 to 4 to answer'}</span>
          {feedback && (
            <PrimaryButton ref={nextRef} onClick={next}>
              {last ? 'Finish' : 'Next question'}
            </PrimaryButton>
          )}
        </div>
      </Card>
    </Page>
  );
}
