import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { ScreenProps } from '../app/types';
import type { QuestionRow, SessionKind, SessionRow } from '../storage/contract';
import { startSession } from '../storage/studyService';
import type { Study } from '../storage/studyService';
import { StudyRunner } from './StudyRunner';
import { Card, Page, SecondaryButton } from './ui';
import { useStudy } from './useStudy';

export interface StartContext {
  study: Study;
  /** Unfinished session of this kind that still has questions to answer, if any. */
  unfinished: SessionRow | null;
  /** Creates a session over exactly these questions (in this order) and starts the loop. */
  begin: (questions: QuestionRow[]) => Promise<void>;
  /** Continues the unfinished session where it stopped. */
  resume: () => void;
  busy: boolean;
}

interface Props extends ScreenProps {
  kind: SessionKind;
  examId: string;
  /** Deep link into an existing session. */
  sessionId?: string;
  heading: string;
  renderStart: (ctx: StartContext) => ReactNode;
}

/** Loads the exam, shows a start card, then runs the question loop and hands off to results. */
export function StudyFlow({ repo, navigate, kind, examId, sessionId, heading, renderStart }: Props) {
  const { study, unfinished, error } = useStudy(repo, examId, kind);
  const [session, setSession] = useState<SessionRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    void repo.getSession(sessionId).then((found) => {
      if (cancelled) return;
      if (found && found.examId === examId) setSession(found);
      else setProblem('That study session could not be found.');
    });
    return () => {
      cancelled = true;
    };
  }, [repo, sessionId, examId]);

  const begin = useCallback(
    async (questions: QuestionRow[]) => {
      setBusy(true);
      setProblem(null);
      try {
        setSession(await startSession(repo, examId, kind, questions));
      } catch (e) {
        setProblem(e instanceof Error ? e.message : 'Could not start the session.');
      } finally {
        setBusy(false);
      }
    },
    [repo, examId, kind],
  );

  const toLibrary = useCallback(() => navigate({ name: 'library' }), [navigate]);
  const onFinished = useCallback(
    () => (session ? navigate({ name: 'results', examId, sessionId: session.id }) : undefined),
    [navigate, examId, session],
  );

  const failure = error ?? problem;
  if (failure) {
    return (
      <Page>
        <Card>
          <p role="alert" className="text-wrong">
            {failure}
          </p>
          <SecondaryButton className="mt-4" onClick={toLibrary}>
            Back to library
          </SecondaryButton>
        </Card>
      </Page>
    );
  }
  if (!study) {
    return (
      <Page>
        <p role="status" className="text-muted">
          Loading…
        </p>
      </Page>
    );
  }
  if (session) {
    return (
      <StudyRunner
        key={session.id}
        repo={repo}
        session={session}
        questions={study.questions}
        heading={heading}
        onExit={toLibrary}
        onFinished={onFinished}
      />
    );
  }
  if (sessionId) {
    return (
      <Page>
        <p role="status" className="text-muted">
          Loading…
        </p>
      </Page>
    );
  }
  return <>{renderStart({ study, unfinished, begin, resume: () => unfinished && setSession(unfinished), busy })}</>;
}
