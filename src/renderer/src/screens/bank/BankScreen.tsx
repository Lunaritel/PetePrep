import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ScreenProps } from '../../app/types';
import { BANK_RULE, HELP } from '../../app/helpText';
import { BANK_EXAM_ID } from '../../storage/contract';
import type { QuestionRow, SessionRow } from '../../storage/contract';
import { buildMistakePool, loadMistakeBank } from '../../storage/mistakeBank';
import type { BankEntry } from '../../storage/mistakeBank';
import { nextUnanswered, startSession } from '../../storage/studyService';
import { loadAllQuestions } from '../../study/allQuestions';
import { StudyRunner } from '../../study/StudyRunner';
import { Card, Page, PrimaryButton, SecondaryButton } from '../../study/ui';

type Props = ScreenProps & { sessionId?: string };

interface Loaded {
  entries: BankEntry[];
  questions: QuestionRow[];
  titles: Map<string, string>;
  unfinished: SessionRow | null;
}

interface ExamRowInfo {
  examId: string;
  title: string;
  count: number;
  almostOut: number;
}

function summarise(entries: BankEntry[]): ExamRowInfo[] {
  const byExam = new Map<string, ExamRowInfo>();
  for (const e of entries) {
    const row = byExam.get(e.exam.id) ?? { examId: e.exam.id, title: e.exam.title, count: 0, almostOut: 0 };
    row.count += 1;
    if (e.correctRounds >= 1) row.almostOut += 1;
    byExam.set(e.exam.id, row);
  }
  return [...byExam.values()].sort((a, b) => b.count - a.count || a.title.localeCompare(b.title));
}

/** Mistake bank: overview of every missed question across exams, and the mixed-exam drill. */
export function BankScreen({ repo, navigate, sessionId }: Props) {
  const [data, setData] = useState<Loaded | null>(null);
  const [session, setSession] = useState<SessionRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [entries, all] = await Promise.all([loadMistakeBank(repo), loadAllQuestions(repo)]);
        const known = new Set(all.questions.map((q) => q.id));
        const open = (await repo.listSessions(BANK_EXAM_ID)).filter((s) => s.kind === 'bank' && !s.completedAt).reverse();
        let unfinished: SessionRow | null = null;
        for (const s of open) {
          const answers = await repo.listSessionAnswers(s.id);
          if (nextUnanswered({ ...s, questionIds: s.questionIds.filter((id) => known.has(id)) }, answers)) {
            unfinished = s;
            break;
          }
        }
        if (sessionId) {
          const found = await repo.getSession(sessionId);
          if (cancelled) return;
          if (found && found.kind === 'bank') setSession(found);
          else setProblem('That study session could not be found.');
        }
        if (!cancelled) setData({ entries, questions: all.questions, titles: all.titles, unfinished });
      } catch (e) {
        if (!cancelled) setProblem(e instanceof Error ? e.message : 'Something went wrong loading the mistake bank.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [repo, sessionId]);

  const toLibrary = useCallback(() => navigate({ name: 'library' }), [navigate]);
  const rows = useMemo(() => (data ? summarise(data.entries) : []), [data]);

  const begin = useCallback(async () => {
    if (!data) return;
    const pool = buildMistakePool(data.entries);
    if (pool.length === 0) return;
    setBusy(true);
    setProblem(null);
    try {
      setSession(await startSession(repo, BANK_EXAM_ID, 'bank', pool));
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'Could not start the drill.');
    } finally {
      setBusy(false);
    }
  }, [data, repo]);

  if (problem) {
    return (
      <Page>
        <Card>
          <p role="alert" className="text-wrong">
            {problem}
          </p>
          <SecondaryButton className="mt-4" onClick={toLibrary}>
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
  if (session) {
    return (
      <StudyRunner
        key={session.id}
        repo={repo}
        session={session}
        questions={data.questions}
        examTitles={data.titles}
        heading="Mistake bank"
        onExit={toLibrary}
        onFinished={() => navigate({ name: 'results', examId: BANK_EXAM_ID, sessionId: session.id })}
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

  const total = data.entries.length;
  if (total === 0 && !data.unfinished) {
    return (
      <Page>
        <Card className="text-center">
          <h1 className="text-2xl font-bold">Mistake bank</h1>
          <p className="mt-3 text-lg">Your mistake bank is empty. Questions you get wrong will show up here.</p>
          <p className="mx-auto mt-3 max-w-prose text-sm text-muted">{BANK_RULE}</p>
          <div className="mt-5 flex justify-center">
            <PrimaryButton onClick={toLibrary}>Back to library</PrimaryButton>
          </div>
        </Card>
      </Page>
    );
  }

  return (
    <Page>
      <Card>
        <h1 className="text-2xl font-bold">{HELP.bank.label}</h1>
        <p className="mt-1 text-lg">
          <strong>{total}</strong> {total === 1 ? 'question' : 'questions'} from {rows.length} {rows.length === 1 ? 'exam' : 'exams'}
        </p>
        <p className="mt-3 text-sm text-muted">{HELP.bank.long}</p>

        {rows.length > 0 && (
          <ul className="mt-5 grid gap-2" aria-label="Mistake bank by exam">
            {rows.map((row) => (
              <li key={row.examId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-bg p-4">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{row.title}</p>
                  <p className="text-sm text-muted">
                    {row.count} {row.count === 1 ? 'question' : 'questions'}
                    {row.almostOut > 0 ? ` · ${row.almostOut} one correct round from leaving` : ''}
                  </p>
                </div>
                <SecondaryButton onClick={() => navigate({ name: 'weak', examId: row.examId })}>Drill only this exam</SecondaryButton>
              </li>
            ))}
          </ul>
        )}

        {data.unfinished && (
          <div className="mt-5 rounded-xl border border-line bg-bg p-4">
            <p className="font-semibold">You have an unfinished mixed drill.</p>
            <p className="mt-1 text-sm text-muted">Pick up exactly where you stopped, or begin a new drill.</p>
            <div className="mt-3">
              <PrimaryButton onClick={() => setSession(data.unfinished)} disabled={busy}>
                Resume
              </PrimaryButton>
            </div>
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          {data.unfinished ? (
            <SecondaryButton onClick={() => void begin()} disabled={busy || total === 0}>
              Start new mixed drill
            </SecondaryButton>
          ) : (
            <PrimaryButton onClick={() => void begin()} disabled={busy}>
              Start mixed drill
            </PrimaryButton>
          )}
          <SecondaryButton onClick={toLibrary}>Back to library</SecondaryButton>
        </div>
      </Card>
    </Page>
  );
}
