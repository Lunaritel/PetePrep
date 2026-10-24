import { useEffect, useState } from 'react';
import type { ScreenProps } from '../../app/types';
import type { AnswerRow, SessionRow } from '../../storage/contract';
import { LETTERS, loadStudy } from '../../storage/studyService';
import type { Study } from '../../storage/studyService';
import { Card, MasteryBar, Page, PrimaryButton, SecondaryButton } from '../../study/ui';

type Props = ScreenProps & { examId: string; sessionId: string };

interface Loaded {
  study: Study;
  session: SessionRow;
  answers: AnswerRow[];
}

function firstWords(text: string, max = 90): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max).replace(/\s+\S*$/, '')}…`;
}

export function ResultsScreen({ repo, navigate, examId, sessionId }: Props) {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [study, session, answers] = await Promise.all([
          loadStudy(repo, examId),
          repo.getSession(sessionId),
          repo.listSessionAnswers(sessionId),
        ]);
        if (cancelled) return;
        if (!session) setError('That study session could not be found.');
        else setData({ study, session, answers });
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

  const { study, session, answers } = data;
  const byQuestion = new Map(study.questions.map((q) => [q.id, q]));
  // If a question was answered more than once in a session, the last answer is its outcome.
  const latest = new Map<string, AnswerRow>();
  for (const a of answers) latest.set(a.questionId, a);
  const rows = session.questionIds.flatMap((id) => {
    const question = byQuestion.get(id);
    const answer = latest.get(id);
    return question && answer ? [{ question, answer }] : [];
  });
  const correct = rows.filter((r) => r.answer.correct).length;
  const percent = rows.length === 0 ? 0 : Math.round((correct / rows.length) * 100);
  const kindLabel = session.kind === 'master' ? 'Master round' : 'Practice';

  return (
    <Page>
      <Card>
        <p className="text-sm font-semibold uppercase tracking-wide text-accent-strong">{kindLabel} complete</p>
        <h1 className="mt-1 text-2xl font-bold">{study.exam.title}</h1>
        <p className="mt-4 text-4xl font-bold" aria-label={`Score: ${correct} of ${rows.length}, ${percent} percent`}>
          {correct} / {rows.length}
          <span className="ml-3 text-xl font-semibold text-muted">{percent}%</span>
        </p>

        <div className="my-6">
          <MasteryBar progress={study.progress} />
        </div>

        {study.complete ? (
          <p role="status" className="mb-5 rounded-xl border-2 border-correct bg-correct-bg p-4 font-semibold text-correct">
            Mastery complete. Every question has been answered correctly twice in a row.
          </p>
        ) : (
          <p className="mb-5 text-muted">
            {study.progress.total - study.progress.mastered} questions still to master. A master round drills exactly those.
          </p>
        )}

        <div className="flex flex-wrap gap-3">
          {!study.complete && <PrimaryButton onClick={() => navigate({ name: 'master', examId })}>Start next master round</PrimaryButton>}
          <SecondaryButton onClick={() => navigate({ name: 'library' })}>Back to library</SecondaryButton>
          <SecondaryButton onClick={() => navigate({ name: 'stats', examId })}>Stats</SecondaryButton>
        </div>
      </Card>

      <h2 className="mb-3 mt-8 text-lg font-semibold">Question by question</h2>
      <ul className="grid gap-2">
        {rows.map(({ question, answer }) => (
          <li key={question.id}>
            <details className="rounded-xl border border-line bg-surface">
              <summary className="flex min-h-11 cursor-pointer items-center gap-3 px-4 py-2 focus-visible:outline-2 focus-visible:outline-accent">
                <span className={`font-bold ${answer.correct ? 'text-correct' : 'text-wrong'}`}>{answer.correct ? '✓ Right' : '✗ Wrong'}</span>
                <span className="text-muted">#{question.number}</span>
                <span className="flex-1">{firstWords(question.prompt)}</span>
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
