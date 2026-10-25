import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { HELP } from '../../app/helpText';
import type { Route } from '../../app/types';
import { BANK_EXAM_ID } from '../../storage/contract';
import { createMemoryRepository } from '../../storage/memoryRepository';
import { startSession } from '../../storage/studyService';
import { Harness, recordRound, seedExam } from '../../study/testSupport';

afterEach(cleanup);

async function twoExams() {
  const repo = createMemoryRepository();
  const alpha = await seedExam(repo, { count: 4, title: 'Alpha Exam', fileHash: 'a' });
  const beta = await seedExam(repo, { count: 4, title: 'Beta Exam', fileHash: 'b', override: (n) => ({ prompt: `Beta ${n} stem` }) });
  return { repo, alpha, beta };
}

describe('BankScreen overview', () => {
  it('counts the bank across exams with a per-exam breakdown and explains the rules', async () => {
    const { repo, alpha, beta } = await twoExams();
    await recordRound(repo, alpha, { miss: [1, 2, 3] });
    await recordRound(repo, beta, { miss: [4] });
    // Alpha 3 answered right once in a second round: still in the bank, one correct round from leaving.
    await recordRound(repo, alpha, { numbers: [3] });
    render(<Harness repo={repo} start={{ name: 'bank' }} />);

    expect(await screen.findByRole('heading', { name: HELP.bank.label })).toBeTruthy();
    expect(screen.getByText(/from 2 exams/)).toBeTruthy();
    expect(screen.getByText('4', { selector: 'strong' })).toBeTruthy();
    expect(screen.getByText(HELP.bank.long)).toBeTruthy();
    // The exit rule is part of the screen's own explanation (stated once, not repeated).
    expect(screen.getAllByText(/two separate rounds/i)).toHaveLength(1);

    const list = screen.getByRole('list', { name: /mistake bank by exam/i });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toMatch(/Alpha Exam/);
    expect(rows[0].textContent).toMatch(/3 questions · 1 one correct round from leaving/);
    expect(rows[1].textContent).toMatch(/Beta Exam/);
    expect(rows[1].textContent).toMatch(/1 question(?! ·)/);
  });

  it("'Drill only this exam' goes to that exam's weak points", async () => {
    const user = userEvent.setup({ delay: null });
    const { repo, alpha, beta } = await twoExams();
    await recordRound(repo, alpha, { miss: [1] });
    await recordRound(repo, beta, { miss: [2] });
    const routes: Route[] = [];
    render(<Harness repo={repo} start={{ name: 'bank' }} onRoute={(r) => routes.push(r)} />);

    const row = (await screen.findByText('Beta Exam')).closest('li') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: /drill only this exam/i }));
    expect(routes.at(-1)).toEqual({ name: 'weak', examId: beta.id });
  });

  it('shows the empty state when nothing has been missed', async () => {
    const { repo, alpha } = await twoExams();
    await recordRound(repo, alpha); // all right
    render(<Harness repo={repo} start={{ name: 'bank' }} />);
    expect(await screen.findByText('Your mistake bank is empty. Questions you get wrong will show up here.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /start/i })).toBeNull();
  });

  it('shows the empty state with no exams at all', async () => {
    render(<Harness repo={createMemoryRepository()} start={{ name: 'bank' }} />);
    expect(await screen.findByText(/your mistake bank is empty/i)).toBeTruthy();
  });
});

describe('BankScreen mixed drill', () => {
  it('starts a bank session across exams, one question each, and resumes it', async () => {
    const user = userEvent.setup({ delay: null });
    const { repo, alpha, beta } = await twoExams();
    await recordRound(repo, alpha, { miss: [1, 2] });
    await recordRound(repo, beta, { miss: [1, 2] });
    const first = render(<Harness repo={repo} start={{ name: 'bank' }} />);

    await user.click(await screen.findByRole('button', { name: /^start mixed drill$/i }));
    await screen.findByText('Question 1 of 4');
    const [session] = await repo.listSessions(BANK_EXAM_ID);
    expect(session.kind).toBe('bank');
    expect(session.questionIds).toHaveLength(4);
    expect(new Set(session.questionIds).size).toBe(4);
    expect(session.questionIds.filter((id) => id.startsWith(alpha.id))).toHaveLength(2);
    expect(session.questionIds.filter((id) => id.startsWith(beta.id))).toHaveLength(2);

    await user.keyboard('a');
    first.unmount();
    render(<Harness repo={repo} start={{ name: 'bank' }} />);
    expect(await screen.findByText(/unfinished mixed drill/i)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /^resume$/i }));
    expect(await screen.findByText('Question 2 of 4')).toBeTruthy();
  });

  it('opens an existing bank session from a deep link', async () => {
    const { repo, alpha, beta } = await twoExams();
    await recordRound(repo, alpha, { miss: [1] });
    await recordRound(repo, beta, { miss: [1] });
    const questions = [...(await repo.getQuestions(alpha.id)), ...(await repo.getQuestions(beta.id))].filter((q) => q.number === 1);
    const session = await startSession(repo, BANK_EXAM_ID, 'bank', questions);
    render(<Harness repo={repo} start={{ name: 'bank', sessionId: session.id }} />);
    expect(await screen.findByText('Question 1 of 2')).toBeTruthy();
    expect(screen.getByTestId('exam-chip')).toBeTruthy();
  });

  it('reports a session that does not exist', async () => {
    render(<Harness repo={createMemoryRepository()} start={{ name: 'bank', sessionId: 'nope' }} />);
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'That study session could not be found.');
  });
});
