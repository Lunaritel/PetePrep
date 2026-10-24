import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { createMemoryRepository } from '../storage/memoryRepository';
import { loadStudy } from '../storage/studyService';
import { Harness, seedExam } from './testSupport';

afterEach(cleanup);

describe('mastery cycle through the UI', () => {
  it('miss -> drill -> drill reaches 100% and stops offering rounds', async () => {
    const user = userEvent.setup({ delay: null });
    const repo = createMemoryRepository();
    const exam = await seedExam(repo, { count: 3 });
    render(<Harness repo={repo} start={{ name: 'practice', examId: exam.id }} />);

    // Round 1 (practice, printed order): miss question 2 only. Key is always A.
    await user.click(await screen.findByLabelText(/shuffle question order/i));
    await user.click(screen.getByRole('button', { name: /^start$/i }));
    for (let n = 1; n <= 3; n += 1) {
      await screen.findByText(`Question ${n} of 3`);
      await user.keyboard(n === 2 ? 'b' : 'a');
      await user.keyboard('{Enter}');
    }
    expect(await screen.findByText(/2 \/ 3/)).toBeTruthy();
    expect(screen.getByText(/0 of 3 mastered/)).toBeTruthy();

    // Round 2 (master): nothing mastered yet so all three; answer all correctly.
    await user.click(screen.getByRole('button', { name: /start next master round/i }));
    expect(await screen.findByText(/3/, { selector: 'strong' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /^start$/i }));
    for (let n = 1; n <= 3; n += 1) {
      await screen.findByText(`Question ${n} of 3`);
      await user.keyboard('a');
      await user.keyboard('{Enter}');
    }
    expect(await screen.findByText(/3 \/ 3/)).toBeTruthy();
    // Questions 1 and 3 are mastered; 2 has only one correct since its miss.
    expect(screen.getByText(/2 of 3 mastered/)).toBeTruthy();
    expect((await loadStudy(repo, exam.id)).complete).toBe(false);

    // Round 3 (master): only question 2 remains.
    await user.click(screen.getByRole('button', { name: /start next master round/i }));
    expect(await screen.findByText(/1/, { selector: 'strong' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /^start$/i }));
    await screen.findByText('Question 1 of 1');
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Question 2 stem');
    await user.keyboard('a');
    await user.click(await screen.findByRole('button', { name: /finish/i }));

    expect(await screen.findByText(/mastery complete/i)).toBeTruthy();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('100');
    expect(screen.queryByRole('button', { name: /next master round/i })).toBeNull();
    await waitFor(async () => expect((await loadStudy(repo, exam.id)).complete).toBe(true));

    // The master screen now has nothing to drill.
    const sessions = await repo.listSessions(exam.id);
    expect(sessions.map((s) => s.kind)).toEqual(['practice', 'master', 'master']);
    expect(sessions.every((s) => s.completedAt)).toBe(true);
  });
});
