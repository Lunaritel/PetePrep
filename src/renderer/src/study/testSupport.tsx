import { useState } from 'react';
import type { Route } from '../app/types';
import { MasterScreen } from '../screens/master';
import { PracticeScreen } from '../screens/practice';
import { ResultsScreen } from '../screens/results';
import type { ExamRow, NewQuestion, Repository } from '../storage/contract';

export interface SeedOptions {
  count?: number;
  /** Per-number overrides, e.g. a snapshot blob or a different key. */
  override?: (number: number) => Partial<NewQuestion>;
  fileHash?: string;
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
    { title: 'Sample Cluster Exam', fileHash: options.fileHash ?? 'hash-1', fileName: 'sample.pdf' },
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
    case 'results':
      return <ResultsScreen key={visit} repo={repo} navigate={navigate} examId={route.examId} sessionId={route.sessionId} />;
    default:
      return <p>Route: {route.name}</p>;
  }
}
