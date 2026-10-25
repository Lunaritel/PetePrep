import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BANK_RULE, HELP } from '../../app/helpText';
import type { ExamRow, Repository } from '../../storage/contract';
import { createMemoryRepository } from '../../storage/memoryRepository';
import { LibraryScreen } from './LibraryScreen';
import { answer, seedExam } from './testSeed';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

/** A session per call so "separate rounds" is explicit in each test. */
async function round(repo: Repository, exam: ExamRow, kind: 'practice' | 'master' | 'weak' = 'practice') {
  return repo.createSession({ examId: exam.id, kind, questionIds: [] });
}

describe('Weak points button', () => {
  it('is disabled with a reason when nothing has been missed', async () => {
    const repo = createMemoryRepository();
    const exam = await seedExam(repo, { title: 'Fresh Exam' });
    const s = await round(repo, exam);
    await answer(repo, s.id, exam.id, 1, true, '2026-10-01T10:00:00Z');

    render(<LibraryScreen repo={repo} navigate={vi.fn()} />);
    const button = await screen.findByRole('button', { name: 'Weak points for Fresh Exam' });
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent(/^Weak points$/);
    expect(screen.getAllByText('Nothing missed yet.').length).toBeGreaterThan(0);
    expect(document.getElementById(button.getAttribute('aria-describedby') ?? '')).toHaveTextContent('Nothing missed yet.');
    expect(screen.queryByText(/in mistake bank/)).not.toBeInTheDocument();
  });

  it('is enabled with the count after a miss and navigates to the weak drill', async () => {
    const repo = createMemoryRepository();
    const exam = await seedExam(repo, { title: 'Missed Exam' });
    const s = await round(repo, exam);
    await answer(repo, s.id, exam.id, 1, false, '2026-10-01T10:00:00Z');
    await answer(repo, s.id, exam.id, 2, false, '2026-10-01T10:01:00Z');
    await answer(repo, s.id, exam.id, 3, true, '2026-10-01T10:02:00Z');

    const navigate = vi.fn();
    render(<LibraryScreen repo={repo} navigate={navigate} />);
    const button = await screen.findByRole('button', { name: 'Weak points for Missed Exam' });
    expect(button).toBeEnabled();
    expect(button).toHaveTextContent('Weak points (2)');
    expect(button).toHaveAttribute('title', HELP.weak.short);
    expect(screen.getByText('2 in mistake bank')).toBeInTheDocument();

    await userEvent.click(button);
    expect(navigate).toHaveBeenLastCalledWith({ name: 'weak', examId: exam.id });
  });

  it('says all clear once a miss has been answered correctly in two separate rounds', async () => {
    const repo = createMemoryRepository();
    const exam = await seedExam(repo, { title: 'Recovered Exam' });
    const s1 = await round(repo, exam);
    const s2 = await round(repo, exam, 'weak');
    const s3 = await round(repo, exam, 'weak');
    await answer(repo, s1.id, exam.id, 1, false, '2026-10-01T10:00:00Z');
    await answer(repo, s2.id, exam.id, 1, true, '2026-10-02T10:00:00Z');
    await answer(repo, s3.id, exam.id, 1, true, '2026-10-03T10:00:00Z');

    render(<LibraryScreen repo={repo} navigate={vi.fn()} />);
    const button = await screen.findByRole('button', { name: 'Weak points for Recovered Exam' });
    expect(button).toBeDisabled();
    expect(screen.getAllByText('All clear: nothing left to review.').length).toBeGreaterThan(0);
  });

  it('does not clear a miss when both correct answers come from the same round', async () => {
    const repo = createMemoryRepository();
    const exam = await seedExam(repo, { title: 'Same Round Exam' });
    const s1 = await round(repo, exam);
    const s2 = await round(repo, exam, 'weak');
    await answer(repo, s1.id, exam.id, 1, false, '2026-10-01T10:00:00Z');
    await answer(repo, s2.id, exam.id, 1, true, '2026-10-02T10:00:00Z');
    await answer(repo, s2.id, exam.id, 1, true, '2026-10-02T10:01:00Z');

    render(<LibraryScreen repo={repo} navigate={vi.fn()} />);
    expect(await screen.findByRole('button', { name: 'Weak points for Same Round Exam' })).toBeEnabled();
    expect(screen.getByText('1 in mistake bank')).toBeInTheDocument();
  });
});

describe('Mistake bank strip', () => {
  it('totals the bank across exams and opens the bank from both controls', async () => {
    const repo = createMemoryRepository();
    const a = await seedExam(repo, { title: 'Exam A' });
    const b = await seedExam(repo, { title: 'Exam B' });
    const sa = await round(repo, a);
    const sb = await round(repo, b);
    await answer(repo, sa.id, a.id, 1, false, '2026-10-01T10:00:00Z');
    await answer(repo, sa.id, a.id, 2, false, '2026-10-01T10:01:00Z');
    await answer(repo, sb.id, b.id, 4, false, '2026-10-01T11:00:00Z');
    await answer(repo, sb.id, b.id, 1, true, '2026-10-01T11:01:00Z');

    const navigate = vi.fn();
    render(<LibraryScreen repo={repo} navigate={navigate} />);
    const strip = await screen.findByRole('region', { name: 'Mistake bank' });
    expect(within(strip).getByText('3 questions from 2 exams to review.')).toBeInTheDocument();
    expect(screen.getByText('2 in mistake bank')).toBeInTheDocument();
    expect(screen.getByText('1 in mistake bank')).toBeInTheDocument();

    await userEvent.click(within(strip).getByRole('button', { name: 'Drill all mistakes' }));
    expect(navigate).toHaveBeenLastCalledWith({ name: 'bank' });
    await userEvent.click(within(strip).getByRole('button', { name: 'Open mistake bank' }));
    expect(navigate).toHaveBeenLastCalledWith({ name: 'bank' });
  });

  it('uses the singular for one question from one exam', async () => {
    const repo = createMemoryRepository();
    const a = await seedExam(repo, { title: 'Solo' });
    const s = await round(repo, a);
    await answer(repo, s.id, a.id, 1, false, '2026-10-01T10:00:00Z');
    render(<LibraryScreen repo={repo} navigate={vi.fn()} />);
    expect(await screen.findByText('1 question from 1 exam to review.')).toBeInTheDocument();
  });

  it('disables the drill with a reason while the bank is empty but still lets you open it', async () => {
    const repo = createMemoryRepository();
    await seedExam(repo, { title: 'Quiet Exam' });
    const navigate = vi.fn();
    render(<LibraryScreen repo={repo} navigate={navigate} />);
    const strip = await screen.findByRole('region', { name: 'Mistake bank' });
    const drill = within(strip).getByRole('button', { name: 'Drill all mistakes' });
    expect(drill).toBeDisabled();
    expect(document.getElementById(drill.getAttribute('aria-describedby') ?? '')).toHaveTextContent('Nothing missed yet.');
    await userEvent.click(within(strip).getByRole('button', { name: 'Open mistake bank' }));
    expect(navigate).toHaveBeenLastCalledWith({ name: 'bank' });
  });

  it('is not shown before any exam exists', async () => {
    render(<LibraryScreen repo={createMemoryRepository()} navigate={vi.fn()} />);
    await screen.findByText('No exams yet');
    expect(screen.queryByRole('region', { name: 'Mistake bank' })).not.toBeInTheDocument();
  });
});

describe('Help panel', () => {
  function panel(): HTMLDetailsElement {
    const summary = screen.getByText('What does each button do?');
    const details = summary.closest('details');
    if (!details) throw new Error('help panel is not a <details>');
    return details;
  }

  it('lists every button with the shared wording and the bank rule', async () => {
    const repo = createMemoryRepository();
    await seedExam(repo);
    render(<LibraryScreen repo={repo} navigate={vi.fn()} />);
    await screen.findByRole('heading', { name: 'Hospitality Sample' });
    const details = panel();
    for (const entry of [HELP.practice, HELP.master, HELP.weak, HELP.bank, HELP.stats, HELP.reset, HELP.delete]) {
      expect(within(details).getByText(entry.label, { selector: 'dt' })).toBeInTheDocument();
      expect(within(details).getByText(entry.long)).toBeInTheDocument();
    }
    expect(within(details).getByText(BANK_RULE)).toBeInTheDocument();
  });

  it('opens by itself the first time a new user has exams but no answers, then stays closed', async () => {
    const repo = createMemoryRepository();
    await seedExam(repo);
    const first = render(<LibraryScreen repo={repo} navigate={vi.fn()} />);
    await screen.findByRole('heading', { name: 'Hospitality Sample' });
    expect(panel().open).toBe(true);
    expect(window.localStorage.getItem('deca.helpSeen')).toBe('1');

    first.unmount();
    render(<LibraryScreen repo={repo} navigate={vi.fn()} />);
    await screen.findByRole('heading', { name: 'Hospitality Sample' });
    expect(panel().open).toBe(false);
  });

  it('stays closed for someone who has already answered questions, and opens on click', async () => {
    const repo = createMemoryRepository();
    const exam = await seedExam(repo);
    const s = await round(repo, exam);
    await answer(repo, s.id, exam.id, 1, true, '2026-10-01T10:00:00Z');
    render(<LibraryScreen repo={repo} navigate={vi.fn()} />);
    await screen.findByRole('heading', { name: 'Hospitality Sample' });
    expect(panel().open).toBe(false);
    await userEvent.click(screen.getByText('What does each button do?'));
    expect(panel().open).toBe(true);
  });

  it('remembers dismissal even if storage is blocked', async () => {
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('blocked');
      },
    });
    try {
      const repo = createMemoryRepository();
      await seedExam(repo);
      render(<LibraryScreen repo={repo} navigate={vi.fn()} />);
      await screen.findByRole('heading', { name: 'Hospitality Sample' });
      expect(panel().open).toBe(true);
      await userEvent.click(screen.getByText('What does each button do?'));
      expect(panel().open).toBe(false);
    } finally {
      if (original) Object.defineProperty(window, 'localStorage', original);
    }
  });
});
