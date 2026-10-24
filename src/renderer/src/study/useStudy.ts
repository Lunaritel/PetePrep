import { useCallback, useEffect, useState } from 'react';
import type { SessionKind, SessionRow } from '../storage/contract';
import type { Repository } from '../storage/contract';
import { loadStudy, nextUnanswered } from '../storage/studyService';
import type { Study } from '../storage/studyService';

export interface StudyState {
  study: Study | null;
  /** Latest unfinished session of the requested kind that still has unanswered questions. */
  unfinished: SessionRow | null;
  error: string | null;
  reload: () => Promise<void>;
}

export function useStudy(repo: Repository, examId: string, kind: SessionKind): StudyState {
  const [study, setStudy] = useState<Study | null>(null);
  const [unfinished, setUnfinished] = useState<SessionRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const loaded = await loadStudy(repo, examId);
      const sessions = (await repo.listSessions(examId)).filter((s) => s.kind === kind && !s.completedAt).reverse();
      const known = new Set(loaded.questions.map((q) => q.id));
      let open: SessionRow | null = null;
      for (const session of sessions) {
        const answers = await repo.listSessionAnswers(session.id);
        const next = nextUnanswered({ ...session, questionIds: session.questionIds.filter((id) => known.has(id)) }, answers);
        if (next) {
          open = session;
          break;
        }
      }
      setStudy(loaded);
      setUnfinished(open);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong loading this exam.');
    }
  }, [repo, examId, kind]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { study, unfinished, error, reload };
}
