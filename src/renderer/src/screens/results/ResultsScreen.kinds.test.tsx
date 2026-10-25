import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { HELP } from '../../app/helpText';
import type { Route } from '../../app/types';
import { BANK_EXAM_ID } from '../../storage/contract';
import { createMemoryRepository } from '../../storage/memoryRepository';
import { Harness, recordRound, seedExam } from '../../study/testSupport';

afterEach(cleanup);

describe('ResultsScreen by session kind', () => {
  it('after practice, quietly shows how many questions are in the mistake bank and links to weak points', async () => {
    const user = userEvent.setup({ delay: null });
    const repo = createMemoryRepository();
    const exam = await seedExam(repo, { count: 4 });
    const sessionId = await recordRound(repo, exam, { miss: [1, 3] });
    const routes: Route[] = [];
    render(<Harness repo={repo} start={{ name: 'results', examId: exam.id, sessionId }} onRoute={(r) => routes.push(r)} />);

    expect(await screen.findByText(/Practice complete/i)).toBeTruthy();
    expect(screen.getByText(/2 \/ 4/)).toBeTruthy();
    expect(screen.getByTestId('bank-line').textContent).toBe('2 questions are in your mistake bank.');
    await user.click(screen.getByRole('button', { name: /^drill weak points$/i }));
    expect(routes.at(-1)).toEqual({ name: 'weak', examId: exam.id });
  });

  it('after a clean practice run there is no bank line or weak points button', async () => {
    const repo = createMemoryRepository();
    const exam = await seedExam(repo, { count: 3 });
    const sessionId = await recordRound(repo, exam);
    render(<Harness repo={repo} start={{ name: 'results', examId: exam.id, sessionId }} />);
    expect(await screen.findByText(/3 \/ 3/)).toBeTruthy();
    expect(screen.queryByTestId('bank-line')).toBeNull();
    expect(screen.queryByRole('button', { name: /weak points/i })).toBeNull();
  });

  it('after a weak points round with questions left, offers another round', async () => {
    const user = userEvent.setup({ delay: null });
    const repo = createMemoryRepository();
    const exam = await seedExam(repo, { count: 4 });
    await recordRound(repo, exam, { miss: [1, 2] });
    const sessionId = await recordRound(repo, exam, { kind: 'weak', numbers: [1, 2], miss: [2] });
    const routes: Route[] = [];
    render(<Harness repo={repo} start={{ name: 'results', examId: exam.id, sessionId }} onRoute={(r) => routes.push(r)} />);

    expect(await screen.findByText(/Weak points round complete/i)).toBeTruthy();
    expect(screen.getByText(/1 \/ 2/)).toBeTruthy();
    expect(screen.getByTestId('bank-line').textContent).toMatch(/2 questions are in your mistake bank/);
    expect(screen.queryByTestId('all-clear')).toBeNull();
    await user.click(screen.getByRole('button', { name: /drill weak points again/i }));
    expect(routes.at(-1)).toEqual({ name: 'weak', examId: exam.id });
  });

  it('after a weak points round that empties the bank, says all clear and offers no more drills', async () => {
    const repo = createMemoryRepository();
    const exam = await seedExam(repo, { count: 3 });
    await recordRound(repo, exam, { miss: [2] });
    await recordRound(repo, exam, { kind: 'weak', numbers: [2] });
    const sessionId = await recordRound(repo, exam, { kind: 'weak', numbers: [2] });
    render(<Harness repo={repo} start={{ name: 'results', examId: exam.id, sessionId }} />);

    expect((await screen.findByTestId('all-clear')).textContent).toBe("All clear: nothing left in this exam's mistake bank.");
    expect(screen.queryByRole('button', { name: /drill weak points/i })).toBeNull();
  });

  it('shows a mixed bank session with exam chips and the bank size across all exams', async () => {
    const user = userEvent.setup({ delay: null });
    const repo = createMemoryRepository();
    const alpha = await seedExam(repo, { count: 3, title: 'Alpha Exam', fileHash: 'a' });
    const beta = await seedExam(repo, { count: 3, title: 'Beta Exam', fileHash: 'b', override: (n) => ({ prompt: `Beta ${n} stem` }) });
    await recordRound(repo, alpha, { miss: [1] });
    await recordRound(repo, beta, { miss: [2] });
    const session = await repo.createSession({
      examId: BANK_EXAM_ID,
      kind: 'bank',
      questionIds: [`${alpha.id}:1`, `${beta.id}:2`],
    });
    await repo.recordAnswer({ sessionId: session.id, examId: alpha.id, questionId: `${alpha.id}:1`, chosenIndex: 0, correct: true });
    await repo.recordAnswer({ sessionId: session.id, examId: beta.id, questionId: `${beta.id}:2`, chosenIndex: 1, correct: false });
    await repo.completeSession(session.id);

    const routes: Route[] = [];
    render(<Harness repo={repo} start={{ name: 'results', examId: BANK_EXAM_ID, sessionId: session.id }} onRoute={(r) => routes.push(r)} />);
    expect(await screen.findByText(/Mistake bank drill complete/i)).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('All your exams');
    expect(screen.getByText(/1 \/ 2/)).toBeTruthy();
    expect(screen.getAllByTestId('exam-chip').map((c) => c.textContent)).toEqual(['Alpha Exam', 'Beta Exam']);
    expect(screen.getByTestId('bank-line').textContent).toBe('2 questions are in your mistake bank across all exams.');
    expect(screen.queryByRole('button', { name: /stats/i })).toBeNull();
    await user.click(screen.getByRole('button', { name: /drill the mistake bank again/i }));
    expect(routes.at(-1)).toEqual({ name: 'bank' });
  });

  it('reports a missing session instead of crashing', async () => {
    render(<Harness repo={createMemoryRepository()} start={{ name: 'results', examId: BANK_EXAM_ID, sessionId: 'nope' }} />);
    expect((await screen.findByRole('alert')).textContent).toBe('That study session could not be found.');
  });
});

describe('start card explanations', () => {
  it('practice explains what it does', async () => {
    const repo = createMemoryRepository();
    const exam = await seedExam(repo, { count: 3 });
    render(<Harness repo={repo} start={{ name: 'practice', examId: exam.id }} />);
    expect(await screen.findByText(HELP.practice.long)).toBeTruthy();
  });

  it('master explains itself and only links to weak points when there are missed questions', async () => {
    const user = userEvent.setup({ delay: null });
    const repo = createMemoryRepository();
    const exam = await seedExam(repo, { count: 4 });
    const first = render(<Harness repo={repo} start={{ name: 'master', examId: exam.id }} />);
    expect(await screen.findByText(HELP.master.long)).toBeTruthy();
    expect(screen.getByText(/Only want the questions you missed\? Use Weak points instead/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^weak points/i })).toBeNull();
    first.unmount();

    await recordRound(repo, exam, { miss: [1, 2] });
    const routes: Route[] = [];
    render(<Harness repo={repo} start={{ name: 'master', examId: exam.id }} onRoute={(r) => routes.push(r)} />);
    await user.click(await screen.findByRole('button', { name: 'Weak points (2)' }));
    expect(routes.at(-1)).toEqual({ name: 'weak', examId: exam.id });
  });
});
