import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { BANK_EXAM_ID } from '../storage/contract';
import { createMemoryRepository } from '../storage/memoryRepository';
import { loadMistakeBank } from '../storage/mistakeBank';
import { Harness, seedExam } from './testSupport';

afterEach(cleanup);

type User = ReturnType<typeof userEvent.setup>;

/**
 * Plays one full round through the UI. The key is always A, so a question is answered right with "a"
 * and wrong with "b". Returns the question numbers in the order they were shown.
 */
async function playRound(user: User, total: number, missNumbers: number[] = []): Promise<number[]> {
  const seen: number[] = [];
  for (let n = 1; n <= total; n += 1) {
    await screen.findByText(`Question ${n} of ${total}`);
    const stem = screen.getByRole('heading', { level: 2 }).textContent ?? '';
    const number = Number(/(\d+) stem/.exec(stem)?.[1]);
    seen.push(number);
    await user.keyboard(missNumbers.includes(number) ? 'b' : 'a');
    await user.keyboard('{Enter}');
  }
  return seen;
}

async function startRound(user: User) {
  await user.click(await screen.findByRole('button', { name: /^start( mixed drill)?$/i }));
}

async function practiceUnshuffled(user: User) {
  await user.click(await screen.findByLabelText(/shuffle question order/i));
  await startRound(user);
}

describe('mistake bank lifecycle through the UI', () => {
  it('a missed question enters the bank and leaves only after two correct answers in two separate rounds', async () => {
    const user = userEvent.setup({ delay: null });
    const repo = createMemoryRepository();
    const exam = await seedExam(repo, { count: 4 });
    render(<Harness repo={repo} start={{ name: 'practice', examId: exam.id }} />);

    // Practice: miss questions 2 and 4.
    await practiceUnshuffled(user);
    await playRound(user, 4, [2, 4]);
    await screen.findByText(/2 \/ 4/);
    expect((await loadMistakeBank(repo)).map((e) => e.question.number).sort()).toEqual([2, 4]);
    expect(screen.getByTestId('bank-line').textContent).toMatch(/2 questions are in your mistake bank/);

    // Weak points round 1: only those two, each exactly once. Both right -> still in the bank (one correct round).
    await user.click(screen.getByRole('button', { name: /drill weak points/i }));
    expect(await screen.findByText(/2 questions/)).toBeTruthy();
    await startRound(user);
    const first = await playRound(user, 2);
    expect([...first].sort()).toEqual([2, 4]);
    expect(new Set(first).size).toBe(first.length);
    await screen.findByText(/2 \/ 2/);
    expect((await loadMistakeBank(repo)).map((e) => e.correctRounds)).toEqual([1, 1]);
    expect(screen.getByTestId('bank-line').textContent).toMatch(/2 questions are in your mistake bank/);

    // Weak points round 2: both right again, in a separate round -> the bank is empty.
    await user.click(screen.getByRole('button', { name: /drill weak points again/i }));
    await startRound(user);
    await playRound(user, 2);
    expect(await screen.findByTestId('all-clear')).toBeTruthy();
    expect(screen.getByTestId('all-clear').textContent).toMatch(/nothing left in this exam's mistake bank/i);
    expect(await loadMistakeBank(repo)).toEqual([]);
    expect(screen.queryByRole('button', { name: /drill weak points again/i })).toBeNull();

    // Missing it again (here in a fresh practice run) puts it straight back in.
    cleanup();
    render(<Harness repo={repo} start={{ name: 'practice', examId: exam.id }} />);
    await practiceUnshuffled(user);
    await playRound(user, 4, [2]);
    await waitFor(async () => expect((await loadMistakeBank(repo)).map((e) => e.question.number)).toEqual([2]));
    expect((await loadMistakeBank(repo))[0]).toMatchObject({ timesMissed: 2, correctRounds: 0 });
  });

  it('a wrong answer in a weak points round keeps the question in the bank and resets its progress', async () => {
    const user = userEvent.setup({ delay: null });
    const repo = createMemoryRepository();
    const exam = await seedExam(repo, { count: 3 });
    render(<Harness repo={repo} start={{ name: 'practice', examId: exam.id }} />);
    await practiceUnshuffled(user);
    await playRound(user, 3, [1]);
    await user.click(await screen.findByRole('button', { name: /drill weak points/i }));
    await startRound(user);
    await playRound(user, 1); // right: one correct round
    await screen.findByText(/1 \/ 1/);
    expect((await loadMistakeBank(repo))[0].correctRounds).toBe(1);

    await user.click(screen.getByRole('button', { name: /drill weak points again/i }));
    await startRound(user);
    await playRound(user, 1, [1]); // wrong: back to zero
    await screen.findByText(/0 \/ 1/);
    const [entry] = await loadMistakeBank(repo);
    expect(entry).toMatchObject({ timesMissed: 2, correctRounds: 0 });
  });

  it('never shows the same question twice in one round and keeps option order printed', async () => {
    const user = userEvent.setup({ delay: null });
    const repo = createMemoryRepository();
    const exam = await seedExam(repo, { count: 12 });
    render(<Harness repo={repo} start={{ name: 'practice', examId: exam.id }} />);
    await startRound(user); // shuffled
    const shown = await playRound(user, 12, [1, 2, 3, 4, 5, 6, 7, 8]);
    expect(new Set(shown).size).toBe(12);

    await user.click(await screen.findByRole('button', { name: /drill weak points/i }));
    await startRound(user);
    await screen.findByText('Question 1 of 8');
    const group = screen.getByRole('group', { name: /answer choices/i });
    const labels = Array.from(group.querySelectorAll('button')).map((b) => b.getAttribute('aria-label') ?? '');
    expect(labels.map((l) => l.charAt(0))).toEqual(['A', 'B', 'C', 'D']);
    const sessions = (await repo.listSessions(exam.id)).filter((s) => s.kind === 'weak');
    expect(sessions).toHaveLength(1);
    expect(new Set(sessions[0].questionIds).size).toBe(8);
  });

  it('mixes exams in one drill, labels each question with its exam, and records answers against the right exam', async () => {
    const user = userEvent.setup({ delay: null });
    const repo = createMemoryRepository();
    const alpha = await seedExam(repo, { count: 3, title: 'Alpha Exam', fileHash: 'a' });
    const beta = await seedExam(repo, { count: 3, title: 'Beta Exam', fileHash: 'b', override: (n) => ({ prompt: `Beta ${n} stem` }) });
    const { recordRound } = await import('./testSupport');
    await recordRound(repo, alpha, { miss: [1, 2] });
    await recordRound(repo, beta, { miss: [3] });

    render(<Harness repo={repo} start={{ name: 'bank' }} />);
    expect(await screen.findByText(/3/, { selector: 'strong' })).toBeTruthy();
    await startRound(user);

    const chips: string[] = [];
    for (let n = 1; n <= 3; n += 1) {
      await screen.findByText(`Question ${n} of 3`);
      chips.push(screen.getByTestId('exam-chip').textContent ?? '');
      await user.keyboard('a');
      await user.keyboard('{Enter}');
    }
    expect(chips.sort()).toEqual(['Alpha Exam', 'Alpha Exam', 'Beta Exam']);

    const sessions = await repo.listSessions(BANK_EXAM_ID);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ kind: 'bank', examId: BANK_EXAM_ID });
    expect(new Set(sessions[0].questionIds).size).toBe(3);
    const answers = await repo.listSessionAnswers(sessions[0].id);
    expect(answers.map((a) => a.examId).sort()).toEqual([alpha.id, alpha.id, beta.id].sort());
    expect(answers.every((a) => a.correct)).toBe(true);

    // Results for the mixed session: score, exam chips, still in the bank (one correct round each).
    expect(await screen.findByText(/3 \/ 3/)).toBeTruthy();
    expect(screen.getAllByTestId('exam-chip').map((c) => c.textContent).sort()).toEqual(['Alpha Exam', 'Alpha Exam', 'Beta Exam']);
    expect(screen.getByTestId('bank-line').textContent).toMatch(/3 questions are in your mistake bank across all exams/);
    expect(screen.getByRole('button', { name: /drill the mistake bank again/i })).toBeTruthy();

    // A second mixed round clears everything.
    await user.click(screen.getByRole('button', { name: /drill the mistake bank again/i }));
    await startRound(user);
    for (let n = 1; n <= 3; n += 1) {
      await screen.findByText(`Question ${n} of 3`);
      await user.keyboard('a');
      await user.keyboard('{Enter}');
    }
    expect(await screen.findByTestId('all-clear')).toBeTruthy();
    expect(screen.getByTestId('all-clear').textContent).toMatch(/nothing left in your mistake bank/i);
    expect(screen.queryByRole('button', { name: /drill the mistake bank again/i })).toBeNull();
    expect(await loadMistakeBank(repo)).toEqual([]);
  });
});
