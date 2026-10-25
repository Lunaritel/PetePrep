import { useState } from 'react';
import type { Route } from '../app/types';
import { BankScreen } from '../screens/bank';
import { MasterScreen } from '../screens/master';
import { PracticeScreen } from '../screens/practice';
import { ResultsScreen } from '../screens/results';
import { WeakScreen } from '../screens/weak';
import type { ExamRow, NewQuestion, Repository, SessionKind } from '../storage/contract';

export interface SeedOptions {
  count?: number;
  /** Per-number overrides, e.g. a snapshot blob or a different key. */
  override?: (number: number) => Partial<NewQuestion>;
  fileHash?: string;
  title?: string;
}

export function makeQuestion(number: number, extra: Partial<NewQuestion> = {}): NewQuestion {
  return {
    number,
    prompt: `Question ${number} stem`,
    options: [`alpha ${number}`, `beta ${number}`, `gamma ${number}`, `delta ${number}`],
    correctIndex: 0,
    explanation: `Verbatim rationale ${number}.\n  Second line, with   odd spacing.`,
    sourcePage: 1,
    parseConfidence: 1,
    rawText: '',
    hasLetterRefs: false,
    excluded: false,
    ...extra,
  };
}

export async function seedExam(repo: Repository, options: SeedOptions = {}): Promise<ExamRow> {
  const count = options.count ?? 3;
  return repo.saveExam(
    { title: options.title ?? 'Sample Cluster Exam', fileHash: options.fileHash ?? 'hash-1', fileName: 'sample.pdf' },
    Array.from({ length: count }, (_, i) => makeQuestion(i + 1, options.override?.(i + 1))),
  );
}

/** Minimal router so tests can click through practice -> results -> master like the real shell. */
export function Harness({ repo, start, onRoute }: { repo: Repository; start: Route; onRoute?: (r: Route) => void }) {
  const [route, setRoute] = useState<Route>(start);
  const [visit, setVisit] = useState(0);
  const navigate = (next: Route) => {
    onRoute?.(next);
    setVisit((n) => n + 1);
    setRoute(next);
  };
  switch (route.name) {
    case 'practice':
      return <PracticeScreen key={visit} repo={repo} navigate={navigate} examId={route.examId} sessionId={route.sessionId} />;
    case 'master':
      return <MasterScreen key={visit} repo={repo} navigate={navigate} examId={route.examId} sessionId={route.sessionId} />;
    case 'weak':
      return <WeakScreen key={visit} repo={repo} navigate={navigate} examId={route.examId} sessionId={route.sessionId} />;
    case 'bank':
      return <BankScreen key={visit} repo={repo} navigate={navigate} sessionId={route.sessionId} />;
    case 'results':
      return <ResultsScreen key={visit} repo={repo} navigate={navigate} examId={route.examId} sessionId={route.sessionId} />;
    default:
      return <p>Route: {route.name}</p>;
  }
}

let clock = Date.UTC(2026, 0, 1);

/**
 * Seeds one completed round with explicit, strictly increasing timestamps (so replay order is exact).
 * Questions whose number is in `miss` are answered wrong (B); the rest right (A, the key).
 */
export async function recordRound(
  repo: Repository,
  exam: ExamRow,
  options: { kind?: SessionKind; miss?: number[]; numbers?: number[] } = {},
): Promise<string> {
  const questions = await repo.getQuestions(exam.id);
  const chosen = options.numbers ? questions.filter((q) => options.numbers!.includes(q.number)) : questions;
  const session = await repo.createSession({ examId: exam.id, kind: options.kind ?? 'practice', questionIds: chosen.map((q) => q.id) });
  for (const q of chosen) {
    const wrong = options.miss?.includes(q.number) ?? false;
    clock += 1000;
    await repo.recordAnswer({
      sessionId: session.id,
      examId: exam.id,
      questionId: q.id,
      chosenIndex: wrong ? 1 : q.correctIndex,
      correct: !wrong,
      answeredAt: new Date(clock).toISOString(),
    });
  }
  await repo.completeSession(session.id);
  return session.id;
}
