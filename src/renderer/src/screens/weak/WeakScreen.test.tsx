import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { HELP } from '../../app/helpText';
import type { Route } from '../../app/types';
import { createMemoryRepository } from '../../storage/memoryRepository';
import { Harness, recordRound, seedExam } from '../../study/testSupport';

afterEach(cleanup);

describe('WeakScreen', () => {
  it('shows a friendly empty state when the exam has no missed questions', async () => {
    const user = userEvent.setup({ delay: null });
    const repo = createMemoryRepository();
    const exam = await seedExam(repo, { count: 3 });
    await recordRound(repo, exam); // all right: nothing in the bank
    const routes: Route[] = [];
    render(<Harness repo={repo} start={{ name: 'weak', examId: exam.id }} onRoute={(r) => routes.push(r)} />);

    expect(await screen.findByRole('heading', { name: 'Nothing to review here' })).toBeTruthy();
    expect(screen.getByText(/questions you get wrong will show up here/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^start/i })).toBeNull();
    await user.click(screen.getByRole('button', { name: /back to library/i }));
    expect(routes.at(-1)).toEqual({ name: 'library' });
  });

  it('explains itself and shows how many questions it will ask', async () => {
    const repo = createMemoryRepository();
    const exam = await seedExam(repo, { count: 5 });
    await recordRound(repo, exam, { miss: [2, 5] });
    render(<Harness repo={repo} start={{ name: 'weak', examId: exam.id }} />);

    expect(await screen.findByText(/Weak points · 2 questions/)).toBeTruthy();
    expect(screen.getByText(HELP.weak.long)).toBeTruthy();
    // The exit rule is part of the screen's own explanation (stated once, not repeated).
    expect(screen.getAllByText(/two separate rounds/i)).toHaveLength(1);
    expect(screen.getByRole('button', { name: /^start$/i })).toBeTruthy();
  });

  it('asks only this exam\'s missed questions', async () => {
    const user = userEvent.setup({ delay: null });
    const repo = createMemoryRepository();
    const mine = await seedExam(repo, { count: 4, title: 'Mine', fileHash: 'm' });
    const other = await seedExam(repo, { count: 4, title: 'Other', fileHash: 'o', override: (n) => ({ prompt: `Other ${n} stem` }) });
    await recordRound(repo, mine, { miss: [3] });
    await recordRound(repo, other, { miss: [1, 2] });
    render(<Harness repo={repo} start={{ name: 'weak', examId: mine.id }} />);

    await user.click(await screen.findByRole('button', { name: /^start$/i }));
    await screen.findByText('Question 1 of 1');
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Question 3 stem');
    const [session] = (await repo.listSessions(mine.id)).filter((s) => s.kind === 'weak');
    expect(session.questionIds).toEqual([`${mine.id}:3`]);
    expect(within(screen.getByRole('group', { name: /answer choices/i })).getAllByRole('button')).toHaveLength(4);
  });

  it('offers to resume an unfinished weak points round', async () => {
    const user = userEvent.setup({ delay: null });
    const repo = createMemoryRepository();
    const exam = await seedExam(repo, { count: 4 });
    await recordRound(repo, exam, { miss: [1, 2, 3] });
    const first = render(<Harness repo={repo} start={{ name: 'weak', examId: exam.id }} />);
    await user.click(await screen.findByRole('button', { name: /^start$/i }));
    await screen.findByText('Question 1 of 3');
    await user.keyboard('a');
    first.unmount();

    render(<Harness repo={repo} start={{ name: 'weak', examId: exam.id }} />);
    expect(await screen.findByText(/unfinished weak points round/i)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /^resume$/i }));
    expect(await screen.findByText('Question 2 of 3')).toBeTruthy();
  });
});
