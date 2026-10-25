import type { MasteryStatus } from '../../../../core/domain';
import type { SessionKind, SessionRow } from '../../storage/contract';
import { statusOf, type Study } from '../../storage/studyService';

export interface QuestionStat {
  id: string;
  number: number;
  stem: string;
  attempts: number;
  correct: number;
  /** Whole percent, null while unseen. */
  correctPct: number | null;
  /** Current run of consecutive correct answers. */
  streak: number;
  status: MasteryStatus;
  avgTimeMs: number | null;
}

/** Plain-language name of a round kind, used in the timeline and chart. */
export function sessionKindLabel(kind: SessionKind): string {
  switch (kind) {
    case 'practice':
      return 'Practice';
    case 'master':
      return 'Master exam';
    case 'weak':
      return 'Weak points';
    case 'bank':
      return 'Mistake bank, mixed';
  }
}

export interface SessionStat {
  id: string;
  kind: SessionKind;
  startedAt: string;
  completedAt?: string;
  answered: number;
  correct: number;
  total: number;
  scorePct: number | null;
  durationMs: number | null;
}

export interface OverallStats {
  attempts: number;
  correct: number;
  correctPct: number | null;
  avgTimeMs: number | null;
}

export interface ExamStats {
  overall: OverallStats;
  questions: QuestionStat[];
  sessions: SessionStat[];
}

function mean(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0) / values.length;
}

function pct(part: number, whole: number): number | null {
  return whole === 0 ? null : Math.round((part / whole) * 100);
}

/**
 * Everything on the stats screen comes from here. It replays the same answer list studyService replays
 * (known questions only, skips ignored, answeredAt order), so figures can never drift from mastery.
 */
export function computeExamStats(study: Study, sessions: SessionRow[]): ExamStats {
  const known = new Set(study.questions.map((q) => q.id));
  const replay = study.answers
    .filter((a) => known.has(a.questionId) && a.chosenIndex !== null)
    .sort((a, b) => a.answeredAt.localeCompare(b.answeredAt));

  const perQuestion = new Map<string, { attempts: number; correct: number; streak: number; times: number[] }>();
  for (const a of replay) {
    const entry = perQuestion.get(a.questionId) ?? { attempts: 0, correct: 0, streak: 0, times: [] };
    entry.attempts += 1;
    if (a.correct) {
      entry.correct += 1;
      entry.streak += 1;
    } else {
      entry.streak = 0;
    }
    if (typeof a.durationMs === 'number') entry.times.push(a.durationMs);
    perQuestion.set(a.questionId, entry);
  }

  const questions: QuestionStat[] = study.questions.map((q) => {
    const e = perQuestion.get(q.id);
    return {
      id: q.id,
      number: q.number,
      stem: q.prompt,
      attempts: e?.attempts ?? 0,
      correct: e?.correct ?? 0,
      correctPct: e ? pct(e.correct, e.attempts) : null,
      streak: e?.streak ?? 0,
      status: statusOf(study, q.id),
      avgTimeMs: e ? mean(e.times) : null,
    };
  });

  // Mixed mistake-bank rounds span several exams; only this exam's questions and answers are counted here,
  // and a mixed round that never touched this exam is left out.
  const sessionStats: SessionStat[] = sessions.flatMap((s): SessionStat[] => {
    const mine = replay.filter((a) => a.sessionId === s.id);
    if (s.kind === 'bank' && mine.length === 0) return [];
    const correct = mine.filter((a) => a.correct).length;
    const duration =
      s.completedAt !== undefined ? new Date(s.completedAt).getTime() - new Date(s.startedAt).getTime() : null;
    return [
      {
        id: s.id,
        kind: s.kind,
        startedAt: s.startedAt,
        completedAt: s.completedAt,
        answered: mine.length,
        correct,
        total: s.kind === 'bank' ? s.questionIds.filter((id) => known.has(id)).length : s.questionIds.length,
        scorePct: pct(correct, mine.length),
        // A mixed round has one clock for all exams, so its length is not attributed to a single exam.
        durationMs:
          s.kind !== 'bank' && duration !== null && Number.isFinite(duration) && duration >= 0 ? duration : null,
      },
    ];
  });
  // Rounds that start in the same instant keep their creation order (ids are time-ordered).
  sessionStats.sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id));

  const correctTotal = replay.filter((a) => a.correct).length;
  return {
    overall: {
      attempts: replay.length,
      correct: correctTotal,
      correctPct: pct(correctTotal, replay.length),
      avgTimeMs: mean(replay.flatMap((a) => (typeof a.durationMs === 'number' ? [a.durationMs] : []))),
    },
    questions,
    sessions: sessionStats,
  };
}

export type SortKey = 'weakest' | 'number' | 'attempts' | 'correctPct' | 'streak' | 'status' | 'avgTime';
export type SortDir = 'asc' | 'desc';

const STATUS_ORDER: Record<MasteryStatus, number> = { unseen: 0, learning: 1, mastered: 2 };

function compareNullable(a: number | null, b: number | null, dir: SortDir): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1; // empty values always sink to the bottom
  if (b === null) return -1;
  return dir === 'asc' ? a - b : b - a;
}

/** "weakest" ignores direction: attempted questions by lowest correct % (more attempts first), unseen last. */
export function sortQuestions(rows: QuestionStat[], key: SortKey, dir: SortDir): QuestionStat[] {
  const sign = dir === 'asc' ? 1 : -1;
  const byNumber = (a: QuestionStat, b: QuestionStat): number => a.number - b.number;
  return [...rows].sort((a, b) => {
    let result = 0;
    switch (key) {
      case 'weakest':
        result = compareNullable(a.correctPct, b.correctPct, 'asc') || b.attempts - a.attempts;
        break;
      case 'number':
        result = (a.number - b.number) * sign;
        break;
      case 'attempts':
        result = (a.attempts - b.attempts) * sign;
        break;
      case 'correctPct':
        result = compareNullable(a.correctPct, b.correctPct, dir);
        break;
      case 'streak':
        result = (a.streak - b.streak) * sign;
        break;
      case 'status':
        result = (STATUS_ORDER[a.status] - STATUS_ORDER[b.status]) * sign;
        break;
      case 'avgTime':
        result = compareNullable(a.avgTimeMs, b.avgTimeMs, dir);
        break;
    }
    return result || byNumber(a, b);
  });
}
