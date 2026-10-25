import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BANK_EXAM_ID, type ExamRow, type Repository, type SessionRow } from '../../storage/contract';
import { createMemoryRepository } from '../../storage/memoryRepository';
import { loadStudy } from '../../storage/studyService';
import { answer, seedExam } from '../library/testSeed';
import { computeExamStats, sessionKindLabel } from './computeStats';
import { StatsScreen } from './StatsScreen';

afterEach(cleanup);

/**
 * Two exams (A, B) and a third (C) that never meets the bank:
 *   t1  practice A   q1 right | q2 wrong | q3 wrong
 *   t2  practice B   q1 wrong | q2 right
 *   t3  bank (mixed) A:q2 right, B:q1 right, A:q3 wrong     -> counts for A (2 answers) and B (1 answer)
 *   t4  weak A       q3 right, q2 right
 */
async function scripted(repo: Repository): Promise<{ a: ExamRow; b: ExamRow; c: ExamRow; bank: SessionRow }> {
  const a = await seedExam(repo, { title: 'Exam A', count: 4 });
  const b = await seedExam(repo, { title: 'Exam B', count: 4 });
  const c = await seedExam(repo, { title: 'Exam C', count: 4 });
  const ida = (n: number): string => `${a.id}:${n}`;
  const idb = (n: number): string => `${b.id}:${n}`;

  // Space the sessions out so their start times are distinct, as real rounds always are.
  const pause = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 3));
  const t1 = await repo.createSession({ examId: a.id, kind: 'practice', questionIds: [ida(1), ida(2), ida(3)] });
  await pause();
  const t2 = await repo.createSession({ examId: b.id, kind: 'practice', questionIds: [idb(1), idb(2)] });
  await pause();
  const t3 = await repo.createSession({ examId: BANK_EXAM_ID, kind: 'bank', questionIds: [ida(2), idb(1), ida(3)] });
  await pause();
  const t4 = await repo.createSession({ examId: a.id, kind: 'weak', questionIds: [ida(3), ida(2)] });

  await answer(repo, t1.id, a.id, 1, true, '2026-10-01T10:00:00Z', 3000);
  await answer(repo, t1.id, a.id, 2, false, '2026-10-01T10:01:00Z', 5000);
  await answer(repo, t1.id, a.id, 3, false, '2026-10-01T10:02:00Z', 7000);
  await answer(repo, t2.id, b.id, 1, false, '2026-10-01T11:00:00Z', 4000);
  await answer(repo, t2.id, b.id, 2, true, '2026-10-01T11:01:00Z', 2000);
  await answer(repo, t3.id, a.id, 2, true, '2026-10-02T09:00:00Z', 6000);
  await answer(repo, t3.id, b.id, 1, true, '2026-10-02T09:01:00Z', 8000);
  await answer(repo, t3.id, a.id, 3, false, '2026-10-02T09:02:00Z', 9000);
  await answer(repo, t4.id, a.id, 3, true, '2026-10-03T09:00:00Z', 1000);
  await answer(repo, t4.id, a.id, 2, true, '2026-10-03T09:01:00Z', 3000);
  await repo.completeSession(t1.id);
  await repo.completeSession(t3.id);
  await repo.completeSession(t4.id);
  const bank = (await repo.listSessions(BANK_EXAM_ID))[0];
  return { a, b, c, bank };
}

async function sessionsFor(repo: Repository, examId: string): Promise<SessionRow[]> {
  return [...(await repo.listSessions(examId)), ...(await repo.listSessions(BANK_EXAM_ID))];
}

describe('sessionKindLabel', () => {
  it('names every kind in plain language', () => {
    expect(sessionKindLabel('practice')).toBe('Practice');
    expect(sessionKindLabel('master')).toBe('Master exam');
    expect(sessionKindLabel('weak')).toBe('Weak points');
    expect(sessionKindLabel('bank')).toBe('Mistake bank, mixed');
  });
});

describe('computeExamStats with mixed mistake-bank rounds', () => {
  it('counts only the exam’s own share of a mixed round, and keeps every figure equal to the full replay', async () => {
    const repo = createMemoryRepository();
    const { a } = await scripted(repo);
    const study = await loadStudy(repo, a.id);
    const stats = computeExamStats(study, await sessionsFor(repo, a.id));

    // Exam A's answers: t1 (3) + bank (2) + weak (2) = 7, of which right: q1, q2(bank), q3(weak), q2(weak) = 4.
    expect(stats.overall).toMatchObject({ attempts: 7, correct: 4, correctPct: 57 });
    const byNumber = Object.fromEntries(stats.questions.map((q) => [q.number, q]));
    expect(byNumber[1]).toMatchObject({ attempts: 1, correct: 1, streak: 1 });
    // q2: wrong, right (bank), right (weak) -> 3 attempts, 2 right, streak 2 -> mastered.
    expect(byNumber[2]).toMatchObject({ attempts: 3, correct: 2, streak: 2, status: 'mastered' });
    // q3: wrong, wrong (bank), right (weak) -> 3 attempts, 1 right, streak 1.
    expect(byNumber[3]).toMatchObject({ attempts: 3, correct: 1, streak: 1, status: 'learning' });
    expect(byNumber[2].avgTimeMs).toBeCloseTo((5000 + 6000 + 3000) / 3, 5);

    expect(stats.sessions.map((s) => s.kind)).toEqual(['practice', 'bank', 'weak']);
    const bank = stats.sessions[1];
    // Mixed round: 2 of its 3 questions belong to A, and both of A's answers are counted (1 right, 1 wrong).
    expect(bank).toMatchObject({ answered: 2, correct: 1, total: 2, scorePct: 50, durationMs: null });
    expect(stats.sessions[2]).toMatchObject({ kind: 'weak', answered: 2, correct: 2, scorePct: 100 });
  });

  it('gives the other exam only its own share, and leaves an exam the round never touched without a bank entry', async () => {
    const repo = createMemoryRepository();
    const { b, c } = await scripted(repo);

    const statsB = computeExamStats(await loadStudy(repo, b.id), await sessionsFor(repo, b.id));
    expect(statsB.sessions.map((s) => s.kind)).toEqual(['practice', 'bank']);
    expect(statsB.sessions[1]).toMatchObject({ answered: 1, correct: 1, total: 1, scorePct: 100 });
    expect(statsB.overall).toMatchObject({ attempts: 3, correct: 2 });

    const statsC = computeExamStats(await loadStudy(repo, c.id), await sessionsFor(repo, c.id));
    expect(statsC.sessions).toEqual([]);
    expect(statsC.overall.attempts).toBe(0);
  });

  it('lists rounds oldest first even though the mixed round is stored under a different exam id', async () => {
    const repo = createMemoryRepository();
    const { a } = await scripted(repo);
    const stats = computeExamStats(await loadStudy(repo, a.id), await sessionsFor(repo, a.id));
    const starts = stats.sessions.map((s) => s.startedAt);
    expect([...starts].sort()).toEqual(starts);
  });
});

describe('StatsScreen with weak-point and mixed rounds', () => {
  it('shows each round with its own label and marks mixed rounds', async () => {
    const repo = createMemoryRepository();
    const { a, b } = await scripted(repo);
    render(<StatsScreen repo={repo} navigate={vi.fn()} examId={a.id} />);

    const timeline = await screen.findByRole('list', { name: 'Rounds, oldest first' });
    const items = within(timeline).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('Practice');
    expect(items[0]).toHaveTextContent('1 of 3 correct (33%)');
    expect(items[1]).toHaveTextContent('Mistake bank, mixed');
    expect(items[1]).toHaveTextContent('1 of 2 correct (50%)');
    expect(items[1]).toHaveTextContent('Mixed round');
    expect(items[1]).not.toHaveTextContent('In progress');
    expect(items[2]).toHaveTextContent('Weak points');
    expect(items[2]).toHaveTextContent('2 of 2 correct (100%)');

    // The chart's text alternative lists the same rounds in order, and its legend names every kind present.
    expect(screen.getByRole('img', { name: 'Score per round, oldest to newest: 33%, 50%, 100%' })).toBeInTheDocument();
    for (const label of ['Practice', 'Weak points', 'Mistake bank, mixed']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(screen.queryByText('Master exam', { selector: 'span.inline-flex' })).not.toBeInTheDocument();

    cleanup();
    render(<StatsScreen repo={repo} navigate={vi.fn()} examId={b.id} />);
    const timelineB = await screen.findByRole('list', { name: 'Rounds, oldest first' });
    expect(within(timelineB).getAllByRole('listitem')).toHaveLength(2);
    expect(within(timelineB).getAllByRole('listitem')[1]).toHaveTextContent('1 of 1 correct (100%)');
  });

  it('does not invent a round on an exam the mixed drill never touched', async () => {
    const repo = createMemoryRepository();
    const { c } = await scripted(repo);
    render(<StatsScreen repo={repo} navigate={vi.fn()} examId={c.id} />);
    expect(await screen.findByText(/No rounds yet/)).toBeInTheDocument();
  });
});
