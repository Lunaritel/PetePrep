import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Route } from '../../app/types';
import { createMemoryRepository } from '../../storage/memoryRepository';
import { Harness, seedExam } from '../../study/testSupport';

afterEach(cleanup);

const practice = (examId: string): Route => ({ name: 'practice', examId });

async function startUnshuffled(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByLabelText(/shuffle question order/i));
  await user.click(screen.getByRole('button', { name: /^start$/i }));
}

describe('PracticeScreen', () => {
  it('shows the start card with shuffle on by default', async () => {
    const repo = createMemoryRepository();
    const exam = await seedExam(repo, { count: 5 });
    render(<Harness repo={repo} start={practice(exam.id)} />);
    expect(await screen.findByText('Sample Cluster Exam')).toBeTruthy();
    expect(screen.getByText(/5 questions/)).toBeTruthy();
    expect((screen.getByLabelText(/shuffle question order/i) as HTMLInputElement).checked).toBe(true);
  });

  it('grades instantly from the keyboard and shows the verbatim explanation', async () => {
    const user = userEvent.setup({ delay: null });
    const repo = createMemoryRepository();
    const exam = await seedExam(repo);
    render(<Harness repo={repo} start={practice(exam.id)} />);
    await startUnshuffled(user);

    expect(await screen.findByText('Question 1 of 3')).toBeTruthy();
    await user.keyboard('c'); // wrong: key is A
    expect(await screen.findByText('Not quite - the answer is A')).toBeTruthy();
    const explanation = screen.getByTestId('explanation');
    expect(explanation.textContent).toBe('Verbatim rationale 1.\n  Second line, with   odd spacing.');
    expect(explanation.className).toContain('whitespace-pre-wrap');

    const answers = await repo.listAnswers(exam.id);
    expect(answers).toHaveLength(1);
    expect(answers[0]).toMatchObject({ chosenIndex: 2, correct: false });
    expect(answers[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  it('accepts 1-4 and marks a right answer', async () => {
    const user = userEvent.setup({ delay: null });
    const repo = createMemoryRepository();
    const exam = await seedExam(repo);
    render(<Harness repo={repo} start={practice(exam.id)} />);
    await startUnshuffled(user);
    await screen.findByText('Question 1 of 3');
    await user.keyboard('1');
    expect(await screen.findByText('Correct')).toBeTruthy();
    const options = within(screen.getByRole('group', { name: /answer choices/i })).getAllByRole('button');
    expect(options[0].getAttribute('aria-label')).toMatch(/correct/i);
    expect(options.every((o) => (o as HTMLButtonElement).disabled)).toBe(true);
  });

  it('moves focus to Next after answering and advances on Enter without double-advancing', async () => {
    const user = userEvent.setup({ delay: null });
    const repo = createMemoryRepository();
    const exam = await seedExam(repo);
    render(<Harness repo={repo} start={practice(exam.id)} />);
    await startUnshuffled(user);
    await screen.findByText('Question 1 of 3');
    await user.keyboard('a');
    const next = await screen.findByRole('button', { name: /next question/i });
    await waitFor(() => expect(document.activeElement).toBe(next));
    await user.keyboard('{Enter}');
    expect(await screen.findByText('Question 2 of 3')).toBeTruthy();
    // Enter on the new (unanswered) question does nothing.
    await user.keyboard('{Enter}');
    expect(screen.getByText('Question 2 of 3')).toBeTruthy();
  });

  it('ignores a second answer to the same question', async () => {
    const user = userEvent.setup({ delay: null });
    const repo = createMemoryRepository();
    const exam = await seedExam(repo);
    render(<Harness repo={repo} start={practice(exam.id)} />);
    await startUnshuffled(user);
    await screen.findByText('Question 1 of 3');
    await user.keyboard('ab');
    await screen.findByText('Correct');
    expect(await repo.listAnswers(exam.id)).toHaveLength(1);
  });

  it('never reorders the answer choices', async () => {
    const user = userEvent.setup({ delay: null });
    const repo = createMemoryRepository();
    const exam = await seedExam(repo);
    render(<Harness repo={repo} start={practice(exam.id)} />);
    // Shuffle ON (default): question order may change, option order must not.
    await user.click(await screen.findByRole('button', { name: /^start$/i }));
    for (let i = 0; i < 3; i += 1) {
      await screen.findByText(`Question ${i + 1} of 3`);
      const heading = screen.getByRole('heading', { level: 2 }).textContent ?? '';
      const n = /Question (\d+) stem/.exec(heading)![1];
      const labels = within(screen.getByRole('group', { name: /answer choices/i }))
        .getAllByRole('button')
        .map((b) => b.getAttribute('aria-label'));
      expect(labels).toEqual([`A: alpha ${n}`, `B: beta ${n}`, `C: gamma ${n}`, `D: delta ${n}`]);
      await user.keyboard('a');
      await user.click(await screen.findByRole('button', { name: /next question|finish/i }));
    }
  });

  it('shows the stored snapshot above the question text', async () => {
    const create = vi.fn(() => 'blob:fake');
    const revoke = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }));
    const user = userEvent.setup({ delay: null });
    const repo = createMemoryRepository();
    const exam = await seedExam(repo, {
      count: 2,
      override: (n) => (n === 1 ? { snapshot: new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }) } : {}),
    });
    render(<Harness repo={repo} start={practice(exam.id)} />);
    await startUnshuffled(user);
    const img = await screen.findByRole('img', { name: /question 1 as printed/i });
    expect(img.getAttribute('src')).toBe('blob:fake');
    await user.keyboard('a');
    await user.click(await screen.findByRole('button', { name: /next question/i }));
    await screen.findByText('Question 2 of 2');
    expect(screen.queryByRole('img')).toBeNull();
    vi.unstubAllGlobals();
  });

  it('exits to the library with answers saved, and the session can be resumed', async () => {
    const user = userEvent.setup({ delay: null });
    const repo = createMemoryRepository();
    const exam = await seedExam(repo, { count: 4 });
    const routes: Route[] = [];
    const first = render(<Harness repo={repo} start={practice(exam.id)} onRoute={(r) => routes.push(r)} />);
    await startUnshuffled(user);
    await screen.findByText('Question 1 of 4');
    await user.keyboard('a');
    await user.click(await screen.findByRole('button', { name: /next question/i }));
    await screen.findByText('Question 2 of 4');
    await user.keyboard('a');
    await screen.findByText('Correct');
    await user.click(screen.getByRole('button', { name: /^exit$/i }));
    expect(routes.at(-1)).toEqual({ name: 'library' });
    expect(await repo.listAnswers(exam.id)).toHaveLength(2);
    first.unmount();

    // Come back: the start card offers Resume, which lands on the first unanswered question (3).
    render(<Harness repo={repo} start={practice(exam.id)} />);
    expect(await screen.findByText(/unfinished practice session/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^start$/i })).toBeNull();
    await user.click(screen.getByRole('button', { name: /resume/i }));
    expect(await screen.findByText('Question 3 of 4')).toBeTruthy();
  });

  it('"Start new" begins a fresh session from question 1', async () => {
    const user = userEvent.setup({ delay: null });
    const repo = createMemoryRepository();
    const exam = await seedExam(repo, { count: 3 });
    const started = await repo.createSession({ examId: exam.id, kind: 'practice', questionIds: (await repo.getQuestions(exam.id)).map((q) => q.id) });
    render(<Harness repo={repo} start={practice(exam.id)} />);
    await user.click(await screen.findByRole('button', { name: /start new/i }));
    expect(await screen.findByText('Question 1 of 3')).toBeTruthy();
    expect((await repo.listSessions(exam.id)).length).toBe(2);
    expect(started.completedAt).toBeUndefined();
  });

  it('deep-links into a session by id', async () => {
    const repo = createMemoryRepository();
    const exam = await seedExam(repo, { count: 3 });
    const questions = await repo.getQuestions(exam.id);
    const session = await repo.createSession({ examId: exam.id, kind: 'practice', questionIds: questions.map((q) => q.id) });
    await repo.recordAnswer({ sessionId: session.id, examId: exam.id, questionId: questions[0].id, chosenIndex: 0, correct: true });
    render(<Harness repo={repo} start={{ name: 'practice', examId: exam.id, sessionId: session.id }} />);
    expect(await screen.findByText('Question 2 of 3')).toBeTruthy();
  });

  it('a full 100-question run records exactly 100 answers and opens results', async () => {
    const user = userEvent.setup({ delay: null });
    const repo = createMemoryRepository();
    const exam = await seedExam(repo, { count: 100 });
    const routes: Route[] = [];
    render(<Harness repo={repo} start={practice(exam.id)} onRoute={(r) => routes.push(r)} />);
    await startUnshuffled(user);
    for (let i = 1; i <= 100; i += 1) {
      await screen.findByText(`Question ${i} of 100`);
      await user.keyboard('a');
      await user.keyboard('{Enter}');
    }
    await waitFor(() => expect(routes.at(-1)?.name).toBe('results'));
    expect(await repo.listAnswers(exam.id)).toHaveLength(100);
    const [session] = await repo.listSessions(exam.id);
    expect(session.completedAt).toBeTruthy();
    expect(await screen.findByText(/100 \/ 100/)).toBeTruthy();
  }, 60000);

  it('finishing a session whose answers were all recorded (exited on the last Next) goes straight to results', async () => {
    const repo = createMemoryRepository();
    const exam = await seedExam(repo, { count: 2 });
    const questions = await repo.getQuestions(exam.id);
    const session = await repo.createSession({ examId: exam.id, kind: 'practice', questionIds: questions.map((q) => q.id) });
    for (const q of questions) await repo.recordAnswer({ sessionId: session.id, examId: exam.id, questionId: q.id, chosenIndex: 0, correct: true });
    const routes: Route[] = [];
    render(<Harness repo={repo} start={{ name: 'practice', examId: exam.id, sessionId: session.id }} onRoute={(r) => routes.push(r)} />);
    await waitFor(() => expect(routes.at(-1)).toEqual({ name: 'results', examId: exam.id, sessionId: session.id }));
    expect((await repo.getSession(session.id))?.completedAt).toBeTruthy();
  });

  it('shows a clear error for a missing session', async () => {
    const repo = createMemoryRepository();
    const exam = await seedExam(repo);
    render(<Harness repo={repo} start={{ name: 'practice', examId: exam.id, sessionId: 'nope' }} />);
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not be found/i);
  });
});
