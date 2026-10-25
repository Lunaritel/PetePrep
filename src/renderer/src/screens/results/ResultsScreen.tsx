import { useEffect, useState } from 'react';
import type { ScreenProps } from '../../app/types';
import { BANK_EXAM_ID } from '../../storage/contract';
import type { AnswerRow, QuestionRow, SessionKind, SessionRow } from '../../storage/contract';
import { loadMistakeBank } from '../../storage/mistakeBank';
import { LETTERS, loadStudy, weakQuestions } from '../../storage/studyService';
import type { Study } from '../../storage/studyService';
import { loadAllQuestions } from '../../study/allQuestions';
import { Card, MasteryBar, Page, PrimaryButton, SecondaryButton } from '../../study/ui';

type Props = ScreenProps & { examId: string; sessionId: string };

interface Row {
  question: QuestionRow;
  answer: AnswerRow;
  /** Exam title, only for mixed-exam sessions. */
  examTitle?: string;
}

interface Loaded {
  session: SessionRow;
  rows: Row[];
  /** Single-exam sessions only. */
  study?: Study;
  /** Questions still in the mistake bank: this exam's for single-exam sessions, all exams' for the mixed drill. */
  bankLeft: number;
}

const KIND_LABEL: Record<SessionKind, string> = {
  practice: 'Practice',
  master: 'Master round',
  weak: 'Weak points round',
  bank: 'Mistake bank drill',
};

function firstWords(text: string, max = 90): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max).replace(/\s+\S*$/, '')}…`;
}

/** If a question was answered more than once in a session, the last answer is its outcome. */
function outcomes(session: SessionRow, answers: AnswerRow[], byQuestion: Map<string, QuestionRow>, titles?: Map<string, string>): Row[] {
  const latest = new Map<string, AnswerRow>();
  for (const a of answers) latest.set(a.questionId, a);
  return session.questionIds.flatMap((id) => {
    const question = byQuestion.get(id);
    const answer = latest.get(id);
    return question && answer ? [{ question, answer, examTitle: titles?.get(question.examId) }] : [];
  });
}

export function ResultsScreen({ repo, navigate, examId, sessionId }: Props) {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [session, answers] = await Promise.all([repo.getSession(sessionId), repo.listSessionAnswers(sessionId)]);
        if (!session) {
          if (!cancelled) setError('That study session could not be found.');
          return;
        }
        if (session.examId === BANK_EXAM_ID || examId === BANK_EXAM_ID) {
          const [all, bank] = await Promise.all([loadAllQuestions(repo), loadMistakeBank(repo)]);
          const rows = outcomes(session, answers, new Map(all.questions.map((q) => [q.id, q])), all.titles);
          if (!cancelled) setData({ session, rows, bankLeft: bank.length });
          return;
        }
        const study = await loadStudy(repo, examId);
        const rows = outcomes(session, answers, new Map(study.questions.map((q) => [q.id, q])));
        if (!cancelled) setData({ session, rows, study, bankLeft: weakQuestions(study).length });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load the results.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [repo, examId, sessionId]);

  if (error) {
    return (
      <Page>
        <Card>
          <p role="alert" className="text-wrong">
            {error}
          </p>
          <SecondaryButton className="mt-4" onClick={() => navigate({ name: 'library' })}>
            Back to library
          </SecondaryButton>
        </Card>
      </Page>
    );
  }
  if (!data) {
    return (
      <Page>
        <p role="status" className="text-muted">
          Loading…
        </p>
      </Page>
    );
  }

  const { session, rows, study, bankLeft } = data;
  const mixed = !study;
  const correct = rows.filter((r) => r.answer.correct).length;
  const percent = rows.length === 0 ? 0 : Math.round((correct / rows.length) * 100);
  const title = study ? study.exam.title : 'All your exams';

  return (
    <Page>
      <Card>
        <p className="text-sm font-semibold uppercase tracking-wide text-accent-strong">{KIND_LABEL[session.kind]} complete</p>
        <h1 className="mt-1 text-2xl font-bold">{title}</h1>
        <p className="mt-4 text-4xl font-bold" aria-label={`Score: ${correct} of ${rows.length}, ${percent} percent`}>
          {correct} / {rows.length}
          <span className="ml-3 text-xl font-semibold text-muted">{percent}%</span>
        </p>

        {study && (
          <div className="my-6">
            <MasteryBar progress={study.progress} />
          </div>
        )}

        {study && session.kind !== 'weak' && (
          <>
            {study.complete ? (
              <p role="status" className="mb-5 rounded-xl border-2 border-correct bg-correct-bg p-4 font-semibold text-correct">
                Mastery complete. Every question has been answered correctly twice in a row.
              </p>
            ) : (
              <p className="mb-5 text-muted">
                {study.progress.total - study.progress.mastered} questions still to master. A master round drills exactly those.
              </p>
            )}
          </>
        )}

        {study && session.kind === 'weak' && study.complete && (
          <p role="status" className="mb-5 rounded-xl border-2 border-correct bg-correct-bg p-4 font-semibold text-correct">
            Mastery complete. Every question has been answered correctly twice in a row.
          </p>
        )}

        {/* Mistake bank status: quiet line, or a clear all-clear message after a drill. */}
        {bankLeft > 0 ? (
          <p className="mb-5 text-sm text-muted" data-testid="bank-line">
            {bankLeft} {bankLeft === 1 ? 'question is' : 'questions are'} in your mistake bank
            {mixed ? ' across all exams' : ''}.
          </p>
        ) : (
          (session.kind === 'weak' || session.kind === 'bank') && (
            <p role="status" className="mb-5 rounded-xl border-2 border-correct bg-correct-bg p-4 font-semibold text-correct" data-testid="all-clear">
              {mixed ? 'All clear: nothing left in your mistake bank.' : "All clear: nothing left in this exam's mistake bank."}
            </p>
          )
        )}

        <div className="flex flex-wrap gap-3">
          {session.kind === 'bank' && bankLeft > 0 && (
            <PrimaryButton onClick={() => navigate({ name: 'bank' })}>Drill the mistake bank again</PrimaryButton>
          )}
          {study && session.kind === 'weak' && bankLeft > 0 && (
            <PrimaryButton onClick={() => navigate({ name: 'weak', examId })}>Drill weak points again</PrimaryButton>
          )}
          {study && session.kind !== 'weak' && !study.complete && (
            <PrimaryButton onClick={() => navigate({ name: 'master', examId })}>Start next master round</PrimaryButton>
          )}
          {study && session.kind !== 'weak' && bankLeft > 0 && (
            <SecondaryButton onClick={() => navigate({ name: 'weak', examId })}>Drill weak points</SecondaryButton>
          )}
          {study && session.kind === 'weak' && !study.complete && (
            <SecondaryButton onClick={() => navigate({ name: 'master', examId })}>Start next master round</SecondaryButton>
          )}
          <SecondaryButton onClick={() => navigate({ name: 'library' })}>Back to library</SecondaryButton>
          {study && <SecondaryButton onClick={() => navigate({ name: 'stats', examId })}>Stats</SecondaryButton>}
        </div>
      </Card>

      <h2 className="mb-3 mt-8 text-lg font-semibold">Question by question</h2>
      <ul className="grid gap-2">
        {rows.map(({ question, answer, examTitle }) => (
          <li key={question.id}>
            <details className="rounded-xl border border-line bg-surface">
              <summary className="flex min-h-11 cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 focus-visible:outline-2 focus-visible:outline-accent">
                <span className={`font-bold ${answer.correct ? 'text-correct' : 'text-wrong'}`}>{answer.correct ? '✓ Right' : '✗ Wrong'}</span>
                <span className="text-muted">#{question.number}</span>
                {examTitle && (
                  <span data-testid="exam-chip" className="max-w-56 truncate rounded-full border border-line bg-bg px-2.5 py-0.5 text-xs font-semibold text-muted">
                    {examTitle}
                  </span>
                )}
                <span className="min-w-40 flex-1">{firstWords(question.prompt)}</span>
              </summary>
              <div className="border-t border-line px-4 py-3">
                <p className="text-sm text-muted">
                  {answer.chosenIndex === null ? 'No answer' : `You chose ${LETTERS[answer.chosenIndex]}: ${question.options[answer.chosenIndex]}`}
                  {' · '}Correct: {LETTERS[question.correctIndex]}: {question.options[question.correctIndex]}
                </p>
                <p className="mt-2 whitespace-pre-wrap">{question.explanation}</p>
              </div>
            </details>
          </li>
        ))}
      </ul>
    </Page>
  );
}
