import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { Route } from '../../app/types';
import { createMemoryRepository } from '../../storage/memoryRepository';
import { answerQuestion, loadStudy, startSession } from '../../storage/studyService';
import { Harness, seedExam } from '../../study/testSupport';

afterEach(cleanup);

async function setup(wrong: number[], count = 4) {
  const repo = createMemoryRepository();
  const exam = await seedExam(repo, { count });
  const study = await loadStudy(repo, exam.id);
  const session = await startSession(repo, exam.id, 'practice', study.questions);
  for (const q of study.questions) await answerQuestion(repo, session, q, wrong.includes(q.number) ? 1 : 0);
  await repo.completeSession(session.id);
  return { repo, exam, session };
}

describe('ResultsScreen', () => {
  it('shows the session score and mastery progress', async () => {
    const { repo, exam, session } = await setup([2]);
    render(<Harness repo={repo} start={{ name: 'results', examId: exam.id, sessionId: session.id }} />);
    expect(await screen.findByText(/3 \/ 4/)).toBeTruthy();
    expect(screen.getByText('75%')).toBeTruthy();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('0');
    expect(screen.getByText(/0 of 4 mastered/)).toBeTruthy();
  });

  it('lists each question with its outcome and an expandable verbatim explanation', async () => {
    const { repo, exam, session } = await setup([2]);
    render(<Harness repo={repo} start={{ name: 'results', examId: exam.id, sessionId: session.id }} />);
    await screen.findByText(/3 \/ 4/);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(4);
    expect(within(items[0]).getByText(/Right/)).toBeTruthy();
    expect(within(items[1]).getByText(/Wrong/)).toBeTruthy();
    expect(within(items[1]).getByText(/You chose B: beta 2/)).toBeTruthy();
    expect(within(items[1]).getByText(/Correct: A: alpha 2/)).toBeTruthy();
    const explanation = within(items[1]).getByText(/Verbatim rationale 2/);
    expect(explanation.textContent).toBe('Verbatim rationale 2.\n  Second line, with   odd spacing.');
  });

  it('offers the next master round, plus library and stats, when not complete', async () => {
    const user = userEvent.setup({ delay: null });
    const { repo, exam, session } = await setup([2]);
    const routes: Route[] = [];
    render(<Harness repo={repo} start={{ name: 'results', examId: exam.id, sessionId: session.id }} onRoute={(r) => routes.push(r)} />);
    await user.click(await screen.findByRole('button', { name: /start next master round/i }));
    expect(routes.at(-1)).toEqual({ name: 'master', examId: exam.id });
  });

  it('library and stats buttons navigate', async () => {
    const user = userEvent.setup({ delay: null });
    const { repo, exam, session } = await setup([]);
    const routes: Route[] = [];
    render(<Harness repo={repo} start={{ name: 'results', examId: exam.id, sessionId: session.id }} onRoute={(r) => routes.push(r)} />);
    await user.click(await screen.findByRole('button', { name: /^stats$/i }));
    expect(routes.at(-1)).toEqual({ name: 'stats', examId: exam.id });
  });

  it('shows completion and no next-round button once everything is mastered', async () => {
    const { repo, exam } = await setup([], 2);
    const study = await loadStudy(repo, exam.id);
    const again = await startSession(repo, exam.id, 'master', study.questions);
    for (const q of study.questions) await answerQuestion(repo, again, q, 0);
    await repo.completeSession(again.id);
    render(<Harness repo={repo} start={{ name: 'results', examId: exam.id, sessionId: again.id }} />);
    expect(await screen.findByText(/mastery complete/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /next master round/i })).toBeNull();
  });

  it('reports a missing session', async () => {
    const repo = createMemoryRepository();
    const exam = await seedExam(repo);
    render(<Harness repo={repo} start={{ name: 'results', examId: exam.id, sessionId: 'nope' }} />);
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not be found/i);
  });
});
