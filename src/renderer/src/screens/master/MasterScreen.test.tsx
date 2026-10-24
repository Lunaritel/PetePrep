import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { Route } from '../../app/types';
import type { Repository } from '../../storage/contract';
import { createMemoryRepository } from '../../storage/memoryRepository';
import { answerQuestion, loadStudy, startSession } from '../../storage/studyService';
import { Harness, seedExam } from '../../study/testSupport';

afterEach(cleanup);

const master = (examId: string): Route => ({ name: 'master', examId });

/** Answers the listed question numbers correctly twice, so they are mastered. */
async function masterQuestions(repo: Repository, examId: string, numbers: number[]) {
  const study = await loadStudy(repo, examId);
  const chosen = study.questions.filter((q) => numbers.includes(q.number));
  const session = await startSession(repo, examId, 'practice', chosen);
  for (const q of chosen) {
    await answerQuestion(repo, session, q, q.correctIndex);
    await answerQuestion(repo, session, q, q.correctIndex);
  }
  await repo.completeSession(session.id);
}

describe('MasterScreen', () => {
  it('pool is exactly the unmastered questions', async () => {
    const repo = createMemoryRepository();
    const exam = await seedExam(repo, { count: 5 });
    await masterQuestions(repo, exam.id, [1, 2]);
    render(<Harness repo={repo} start={master(exam.id)} />);
    expect(await screen.findByText(/still to master/i)).toBeTruthy();
    expect(screen.getByText('3').tagName).toBe('STRONG');
  });

  it('only questions not yet mastered are asked in the round', async () => {
    const user = userEvent.setup({ delay: null });
    const repo = createMemoryRepository();
    const exam = await seedExam(repo, { count: 4 });
    await masterQuestions(repo, exam.id, [1, 2]);
    render(<Harness repo={repo} start={master(exam.id)} />);
    await user.click(await screen.findByRole('button', { name: /^start$/i }));
    expect(await screen.findByText(/Question 1 of 2/)).toBeTruthy();
    const [session] = (await repo.listSessions(exam.id)).filter((s) => s.kind === 'master');
    expect(session.questionIds.sort()).toEqual([`${exam.id}:3`, `${exam.id}:4`]);
  });

  it('hides the review slider until something is mastered', async () => {
    const repo = createMemoryRepository();
    const exam = await seedExam(repo, { count: 3 });
    render(<Harness repo={repo} start={master(exam.id)} />);
    await screen.findByText(/still to master/i);
    expect(screen.queryByRole('slider')).toBeNull();
  });

  it('the slider adds already-mastered questions to the round (default 0%)', async () => {
    const user = userEvent.setup({ delay: null });
    const repo = createMemoryRepository();
    const exam = await seedExam(repo, { count: 6 });
    await masterQuestions(repo, exam.id, [1, 2, 3, 4]); // 2 left, 4 mastered
    render(<Harness repo={repo} start={master(exam.id)} />);
    const slider = (await screen.findByRole('slider')) as HTMLInputElement;
    expect(slider.value).toBe('0');
    expect(screen.getByText(/Include 0% of mastered/i)).toBeTruthy();

    fireEvent.change(slider, { target: { value: '100' } });
    expect(screen.getByText(/Include 100% of mastered/i)).toBeTruthy();
    expect(screen.getByText(/\+2 for review/)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /^start$/i }));
    expect(await screen.findByText(/Question 1 of 4/)).toBeTruthy();
  });

  it('celebrates instead of offering Start when everything is mastered', async () => {
    const repo = createMemoryRepository();
    const exam = await seedExam(repo, { count: 2 });
    await masterQuestions(repo, exam.id, [1, 2]);
    render(<Harness repo={repo} start={master(exam.id)} />);
    expect(await screen.findByRole('heading', { name: /everything mastered/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^start$/i })).toBeNull();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('100');
  });

  it('offers Resume for an unfinished master round', async () => {
    const user = userEvent.setup({ delay: null });
    const repo = createMemoryRepository();
    const exam = await seedExam(repo, { count: 3 });
    const study = await loadStudy(repo, exam.id);
    const session = await startSession(repo, exam.id, 'master', study.questions);
    await answerQuestion(repo, session, study.questions[0], 0);
    render(<Harness repo={repo} start={master(exam.id)} />);
    await user.click(await screen.findByRole('button', { name: /resume/i }));
    expect(await screen.findByText('Question 2 of 3')).toBeTruthy();
  });
});
