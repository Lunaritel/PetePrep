import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExamRow, Repository, SessionRow } from '../../storage/contract';
import { createMemoryRepository } from '../../storage/memoryRepository';
import { loadStudy } from '../../storage/studyService';
import { answer, seedExam } from '../library/testSeed';
import { computeExamStats, sortQuestions, type QuestionStat } from './computeStats';
import { StatsScreen } from './StatsScreen';

afterEach(cleanup);

/**
 * Scripted history (4 questions, 3 rounds):
 *   round 1 practice 10:00-10:10   q1 right 4s | q2 wrong 6s | q3 right 8s | q4 skipped
 *   round 2 master   11:00-11:05   q1 right 2s | q2 right 4s | q3 wrong 10s
 *   round 3 practice 12:00 (open)  q2 right 6s
 */
async function scriptedHistory(repo: Repository): Promise<{ exam: ExamRow; sessions: SessionRow[] }> {
  const exam = await seedExam(repo, { title: 'Scripted Exam', count: 4 });
  const id = (n: number): string => `${exam.id}:${n}`;
  const mk = async (kind: 'practice' | 'master', ids: number[]): Promise<SessionRow> =>
    repo.createSession({ examId: exam.id, kind, questionIds: ids.map(id) });
  const s1 = await mk('practice', [1, 2, 3, 4]);
  const s2 = await mk('master', [1, 2, 3, 4]);
  const s3 = await mk('practice', [2]);
  await answer(repo, s1.id, exam.id, 1, true, '2026-10-01T10:01:00Z', 4000);
  await answer(repo, s1.id, exam.id, 2, false, '2026-10-01T10:02:00Z', 6000);
  await answer(repo, s1.id, exam.id, 3, true, '2026-10-01T10:03:00Z', 8000);
  await repo.recordAnswer({ sessionId: s1.id, examId: exam.id, questionId: id(4), chosenIndex: null, correct: false, answeredAt: '2026-10-01T10:04:00Z' });
  await answer(repo, s2.id, exam.id, 1, true, '2026-10-01T11:01:00Z', 2000);
  await answer(repo, s2.id, exam.id, 2, true, '2026-10-01T11:02:00Z', 4000);
  await answer(repo, s2.id, exam.id, 3, false, '2026-10-01T11:03:00Z', 10000);
  await answer(repo, s3.id, exam.id, 2, true, '2026-10-01T12:01:00Z', 6000);
  await repo.completeSession(s1.id);
  await repo.completeSession(s2.id);
  return { exam, sessions: await repo.listSessions(exam.id) };
}

function rowCells(stem: RegExp): string[] {
  const row = screen.getByText(stem).closest('tr');
  if (!row) throw new Error('row not found');
  return within(row).getAllByRole('cell').map((c) => c.textContent ?? '');
}

describe('computeExamStats', () => {
  it('matches a hand replay of the scripted history', async () => {
    const repo = createMemoryRepository();
    const { exam, sessions } = await scriptedHistory(repo);
    const study = await loadStudy(repo, exam.id);
    const stats = computeExamStats(study, sessions);

    const byNumber = Object.fromEntries(stats.questions.map((q) => [q.number, q]));
    expect(byNumber[1]).toMatchObject({ attempts: 2, correct: 2, correctPct: 100, streak: 2, status: 'mastered', avgTimeMs: 3000 });
    expect(byNumber[2]).toMatchObject({ attempts: 3, correct: 2, correctPct: 67, streak: 2, status: 'mastered' });
    expect(byNumber[2].avgTimeMs).toBeCloseTo(16000 / 3, 5);
    expect(byNumber[3]).toMatchObject({ attempts: 2, correct: 1, correctPct: 50, streak: 0, status: 'learning', avgTimeMs: 9000 });
    expect(byNumber[4]).toMatchObject({ attempts: 0, correctPct: null, streak: 0, status: 'unseen', avgTimeMs: null });

    expect(stats.overall).toMatchObject({ attempts: 7, correct: 5, correctPct: 71 });
    expect(stats.overall.avgTimeMs).toBeCloseTo(40000 / 7, 5);
    expect(study.progress).toMatchObject({ mastered: 2, learning: 1, unseen: 1, percentMastered: 50 });

    expect(stats.sessions.map((s) => [s.kind, s.answered, s.correct, s.scorePct, s.total])).toEqual([
      ['practice', 3, 2, 67, 4],
      ['master', 3, 2, 67, 4],
      ['practice', 1, 1, 100, 1],
    ]);
    expect(stats.sessions[2].durationMs).toBeNull();
  });

  it('agrees with the mastery engine for every question (status vs streak)', async () => {
    const repo = createMemoryRepository();
    const { exam, sessions } = await scriptedHistory(repo);
    const study = await loadStudy(repo, exam.id);
    for (const q of computeExamStats(study, sessions).questions) {
      if (q.status === 'mastered') expect(q.streak).toBeGreaterThanOrEqual(2);
      if (q.status === 'learning') expect(q.streak).toBeLessThan(2);
      if (q.status === 'unseen') expect(q.attempts).toBe(0);
    }
  });

  it('ignores answers for questions that were excluded', async () => {
    const repo = createMemoryRepository();
    const exam = await repo.saveExam({ title: 'Ex', fileHash: 'ex', fileName: 'ex.pdf' }, [
      { number: 1, prompt: 'p1 long enough', options: ['a', 'b', 'c', 'd'], correctIndex: 0, explanation: 'e', sourcePage: 1, parseConfidence: 1, rawText: '', hasLetterRefs: false, excluded: false },
      { number: 2, prompt: 'p2 long enough', options: ['a', 'b', 'c', 'd'], correctIndex: 0, explanation: 'e', sourcePage: 1, parseConfidence: 1, rawText: '', hasLetterRefs: false, excluded: true },
    ]);
    const session = await repo.createSession({ examId: exam.id, kind: 'practice', questionIds: [] });
    await answer(repo, session.id, exam.id, 1, true, '2026-10-01T10:00:00Z');
    await answer(repo, session.id, exam.id, 2, true, '2026-10-01T10:01:00Z');
    const stats = computeExamStats(await loadStudy(repo, exam.id), [session]);
    expect(stats.questions).toHaveLength(1);
    expect(stats.overall.attempts).toBe(1);
  });
});

describe('sortQuestions', () => {
  const row = (number: number, correctPct: number | null, attempts: number): QuestionStat => ({
    id: `q${number}`,
    number,
    stem: `s${number}`,
    attempts,
    correct: 0,
    correctPct,
    streak: 0,
    status: attempts === 0 ? 'unseen' : 'learning',
    avgTimeMs: attempts === 0 ? null : attempts * 1000,
  });
  const rows = [row(1, 100, 2), row(2, null, 0), row(3, 50, 2), row(4, 50, 5), row(5, 0, 1)];

  it('weakest first: lowest %, more attempts first on ties, unseen last', () => {
    expect(sortQuestions(rows, 'weakest', 'asc').map((r) => r.number)).toEqual([5, 4, 3, 1, 2]);
    expect(sortQuestions(rows, 'weakest', 'desc').map((r) => r.number)).toEqual([5, 4, 3, 1, 2]);
  });
  it('sorts columns both ways with empty values always last', () => {
    expect(sortQuestions(rows, 'correctPct', 'asc').map((r) => r.number)).toEqual([5, 3, 4, 1, 2]);
    expect(sortQuestions(rows, 'correctPct', 'desc').map((r) => r.number)).toEqual([1, 3, 4, 5, 2]);
    expect(sortQuestions(rows, 'avgTime', 'desc').map((r) => r.number)).toEqual([4, 1, 3, 5, 2]);
    expect(sortQuestions(rows, 'number', 'desc').map((r) => r.number)).toEqual([5, 4, 3, 2, 1]);
  });
});

describe('StatsScreen', () => {
  it('displays exactly the replayed figures', async () => {
    const repo = createMemoryRepository();
    const { exam } = await scriptedHistory(repo);
    render(<StatsScreen repo={repo} navigate={vi.fn()} examId={exam.id} />);

    expect(await screen.findByRole('heading', { name: 'Scripted Exam' })).toBeInTheDocument();
    expect(screen.getByTestId('overall-percent')).toHaveTextContent('50% mastered');
    const list = document.querySelector('dl') as HTMLElement;
    const figures = (label: string): string => within(list).getByText(label).parentElement?.querySelector('dd')?.textContent ?? '';
    expect(figures('Mastered')).toBe('2');
    expect(figures('Learning')).toBe('1');
    expect(figures('Unseen')).toBe('1');
    expect(figures('Answers given')).toBe('7');
    expect(figures('Overall correct')).toBe('71%');
    expect(figures('Average time per question')).toBe('5.7 s');

    // [#, stem, attempts, correct, streak, status, avg time]
    expect(rowCells(/Stem for question 1 /)).toEqual(['1', expect.stringContaining('Stem for question 1'), '2', '100%', '2', 'mastered', '3.0 s']);
    expect(rowCells(/Stem for question 2 /)).toEqual(['2', expect.stringContaining('Stem for question 2'), '3', '67%', '2', 'mastered', '5.3 s']);
    expect(rowCells(/Stem for question 3 /)).toEqual(['3', expect.stringContaining('Stem for question 3'), '2', '50%', '0', 'learning', '9.0 s']);
    expect(rowCells(/Stem for question 4 /)).toEqual(['4', expect.stringContaining('Stem for question 4'), '0', '-', '0', 'unseen', '-']);
  });

  it('defaults to weakest first and re-sorts when a header is clicked', async () => {
    const repo = createMemoryRepository();
    const { exam } = await scriptedHistory(repo);
    render(<StatsScreen repo={repo} navigate={vi.fn()} examId={exam.id} />);
    await screen.findByRole('heading', { name: 'Scripted Exam' });

    const order = (): string[] => screen.getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[0].textContent ?? '');
    expect(order()).toEqual(['3', '2', '1', '4']);
    expect(screen.getByRole('button', { name: 'Weakest first' })).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(screen.getByRole('button', { name: /^#/ }));
    expect(order()).toEqual(['1', '2', '3', '4']);
    expect(screen.getByRole('columnheader', { name: /^#/ })).toHaveAttribute('aria-sort', 'ascending');
    await userEvent.click(screen.getByRole('button', { name: /^#/ }));
    expect(order()).toEqual(['4', '3', '2', '1']);
    expect(screen.getByRole('columnheader', { name: /^#/ })).toHaveAttribute('aria-sort', 'descending');

    await userEvent.click(screen.getByRole('button', { name: 'Weakest first' }));
    expect(order()).toEqual(['3', '2', '1', '4']);
  });

  it('filters by status and explains an empty filter', async () => {
    const repo = createMemoryRepository();
    const { exam } = await scriptedHistory(repo);
    render(<StatsScreen repo={repo} navigate={vi.fn()} examId={exam.id} />);
    await screen.findByRole('heading', { name: 'Scripted Exam' });

    await userEvent.click(screen.getByRole('button', { name: 'Learning' }));
    expect(screen.getAllByRole('row')).toHaveLength(2);
    expect(screen.getByText(/Stem for question 3 /)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Unseen' }));
    expect(screen.getByText(/Stem for question 4 /)).toBeInTheDocument();
    expect(screen.queryByText(/Stem for question 3 /)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getAllByRole('row')).toHaveLength(5);
  });

  it('shows the round timeline with a text alternative for the chart', async () => {
    const repo = createMemoryRepository();
    const { exam } = await scriptedHistory(repo);
    render(<StatsScreen repo={repo} navigate={vi.fn()} examId={exam.id} />);
    await screen.findByRole('heading', { name: 'Scripted Exam' });

    expect(screen.getByRole('img', { name: 'Score per round, oldest to newest: 67%, 67%, 100%' })).toBeInTheDocument();
    const rounds = within(screen.getByRole('list', { name: 'Rounds, oldest first' })).getAllByRole('listitem');
    expect(rounds).toHaveLength(3);
    expect(rounds[0]).toHaveTextContent('Practice');
    expect(rounds[0]).toHaveTextContent('2 of 3 correct (67%)');
    expect(rounds[1]).toHaveTextContent('Master exam');
    expect(rounds[2]).toHaveTextContent('1 of 1 correct (100%)');
    expect(rounds[2]).toHaveTextContent('In progress');
    expect(rounds[0]).not.toHaveTextContent('In progress');
  });

  it('handles an exam with no answers yet', async () => {
    const repo = createMemoryRepository();
    const exam = await seedExam(repo, { title: 'Fresh' });
    render(<StatsScreen repo={repo} navigate={vi.fn()} examId={exam.id} />);
    expect(await screen.findByText(/No rounds yet/)).toBeInTheDocument();
    expect(screen.getByTestId('overall-percent')).toHaveTextContent('0% mastered');
    expect(screen.getByText('Overall correct').parentElement).toHaveTextContent('-');
  });

  it('shows an error and a way back when the exam is gone', async () => {
    const navigate = vi.fn();
    render(<StatsScreen repo={createMemoryRepository()} navigate={navigate} examId="missing" />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/no longer exists/);
    await userEvent.click(screen.getByRole('button', { name: /Back to library/ }));
    expect(navigate).toHaveBeenCalledWith({ name: 'library' });
  });
});
