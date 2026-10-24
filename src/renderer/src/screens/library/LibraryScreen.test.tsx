import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryRepository } from '../../storage/memoryRepository';
import { LibraryScreen } from './LibraryScreen';
import { answer, seedExam } from './testSeed';
import { formatDuration, formatRelative } from './format';

afterEach(cleanup);

describe('LibraryScreen', () => {
  it('shows a friendly empty state and routes to import', async () => {
    const navigate = vi.fn();
    render(<LibraryScreen repo={createMemoryRepository()} navigate={navigate} />);
    expect(await screen.findByText('No exams yet')).toBeInTheDocument();
    expect(screen.getByText(/answer key and explanations/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Import your first exam' }));
    expect(navigate).toHaveBeenCalledWith({ name: 'import' });
  });

  it('lists an exam with counts, mastery bar and actions that navigate', async () => {
    const repo = createMemoryRepository();
    const exam = await seedExam(repo, { title: 'Hospitality Sample', testCode: '1206', count: 4 });
    const session = await repo.createSession({ examId: exam.id, kind: 'practice', questionIds: [`${exam.id}:1`] });
    await answer(repo, session.id, exam.id, 1, true, '2026-10-01T10:00:00Z');
    await answer(repo, session.id, exam.id, 1, true, '2026-10-01T10:01:00Z');
    await answer(repo, session.id, exam.id, 2, false, '2026-10-01T10:02:00Z');

    const navigate = vi.fn();
    render(<LibraryScreen repo={repo} navigate={navigate} />);

    expect(await screen.findByRole('heading', { name: 'Hospitality Sample' })).toBeInTheDocument();
    expect(screen.getByText(/Test 1206 · 4 questions/)).toBeInTheDocument();
    expect(screen.getByText('1 mastered')).toBeInTheDocument();
    expect(screen.getByText('1 learning')).toBeInTheDocument();
    expect(screen.getByText('2 unseen')).toBeInTheDocument();
    const bar = screen.getByRole('progressbar', { name: 'Mastery of Hospitality Sample' });
    expect(bar).toHaveAttribute('aria-valuenow', '25');
    expect(screen.getByText(/Last studied/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Practice Hospitality Sample' }));
    expect(navigate).toHaveBeenLastCalledWith({ name: 'practice', examId: exam.id });
    await userEvent.click(screen.getByRole('button', { name: 'Master exam for Hospitality Sample' }));
    expect(navigate).toHaveBeenLastCalledWith({ name: 'master', examId: exam.id });
    await userEvent.click(screen.getByRole('button', { name: 'Stats for Hospitality Sample' }));
    expect(navigate).toHaveBeenLastCalledWith({ name: 'stats', examId: exam.id });
  });

  it('says "Not studied yet" for a fresh exam', async () => {
    const repo = createMemoryRepository();
    await seedExam(repo);
    render(<LibraryScreen repo={repo} navigate={vi.fn()} />);
    expect(await screen.findByText(/Not studied yet/)).toBeInTheDocument();
  });

  it('disables Master exam with a reason once every question is mastered', async () => {
    const repo = createMemoryRepository();
    const exam = await seedExam(repo, { count: 1 });
    const session = await repo.createSession({ examId: exam.id, kind: 'practice', questionIds: [`${exam.id}:1`] });
    await answer(repo, session.id, exam.id, 1, true, '2026-10-01T10:00:00Z');
    await answer(repo, session.id, exam.id, 1, true, '2026-10-01T10:01:00Z');

    render(<LibraryScreen repo={repo} navigate={vi.fn()} />);
    const master = await screen.findByRole('button', { name: /Master exam for/ });
    expect(master).toBeDisabled();
    expect(screen.getByText(/nothing left to drill/i)).toBeInTheDocument();
    expect(master).toHaveAccessibleDescription(/nothing left to drill/i);
    expect(screen.getByRole('button', { name: /^Practice/ })).toBeEnabled();
  });

  it('sorts the most recently studied exam first', async () => {
    const repo = createMemoryRepository();
    const older = await seedExam(repo, { title: 'Older' });
    const newer = await seedExam(repo, { title: 'Newer' });
    await seedExam(repo, { title: 'Never' });
    const s1 = await repo.createSession({ examId: older.id, kind: 'practice', questionIds: [] });
    const s2 = await repo.createSession({ examId: newer.id, kind: 'practice', questionIds: [] });
    await answer(repo, s1.id, older.id, 1, true, '2026-09-01T00:00:00Z');
    await answer(repo, s2.id, newer.id, 1, true, '2026-10-01T00:00:00Z');

    render(<LibraryScreen repo={repo} navigate={vi.fn()} />);
    await screen.findByRole('heading', { name: 'Newer' });
    const titles = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(titles).toEqual(['Newer', 'Older', 'Never']);
  });

  it('asks before deleting, names the exam, and can be cancelled', async () => {
    const repo = createMemoryRepository();
    await seedExam(repo, { title: 'Doomed Exam' });
    render(<LibraryScreen repo={repo} navigate={vi.fn()} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Delete Doomed Exam' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete this exam?' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getByText(/permanently/i)).toBeInTheDocument();
    expect(within(dialog).getByText('Doomed Exam')).toBeInTheDocument();
    // Safe default focus: Cancel, never the destructive button.
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await repo.listExams()).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Delete Doomed Exam' })).toHaveFocus();
  });

  it('deletes after confirmation and returns to the empty state', async () => {
    const repo = createMemoryRepository();
    await seedExam(repo, { title: 'Doomed Exam' });
    render(<LibraryScreen repo={repo} navigate={vi.fn()} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Delete Doomed Exam' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete exam' }));
    expect(await screen.findByText('No exams yet')).toBeInTheDocument();
    expect(await repo.listExams()).toHaveLength(0);
  });

  it('resets progress after confirmation but keeps the exam', async () => {
    const repo = createMemoryRepository();
    const exam = await seedExam(repo, { title: 'Keep Me', count: 2 });
    const session = await repo.createSession({ examId: exam.id, kind: 'practice', questionIds: [] });
    await answer(repo, session.id, exam.id, 1, true, '2026-10-01T10:00:00Z');
    render(<LibraryScreen repo={repo} navigate={vi.fn()} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Reset progress for Keep Me' }));
    const dialog = screen.getByRole('dialog', { name: 'Reset progress?' });
    expect(within(dialog).getByText(/go back to unseen/i)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reset progress' }));

    await waitFor(() => expect(screen.getByText('2 unseen')).toBeInTheDocument());
    expect(screen.getByText(/Not studied yet/)).toBeInTheDocument();
    expect(await repo.listAnswers(exam.id)).toHaveLength(0);
    expect(await repo.listExams()).toHaveLength(1);
  });

  it('keeps focus inside the dialog when tabbing', async () => {
    const repo = createMemoryRepository();
    await seedExam(repo, { title: 'Trap' });
    render(<LibraryScreen repo={repo} navigate={vi.fn()} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Delete Trap' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.tab();
    expect(within(dialog).getByRole('button', { name: 'Delete exam' })).toHaveFocus();
    await userEvent.tab();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(within(dialog).getByRole('button', { name: 'Delete exam' })).toHaveFocus();
  });

  it('reports a load failure instead of hanging', async () => {
    const repo = createMemoryRepository();
    repo.listExams = () => Promise.reject(new Error('disk on fire'));
    render(<LibraryScreen repo={repo} navigate={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('disk on fire');
  });
});

describe('format helpers', () => {
  const now = new Date('2026-10-10T12:00:00Z');
  it('formats relative times', () => {
    expect(formatRelative('2026-10-10T11:59:40Z', now)).toBe('just now');
    expect(formatRelative('2026-10-10T11:55:00Z', now)).toBe('5 minutes ago');
    expect(formatRelative('2026-10-10T11:00:00Z', now)).toBe('1 hour ago');
    expect(formatRelative('2026-10-09T11:00:00Z', now)).toBe('yesterday');
    expect(formatRelative('2026-10-07T12:00:00Z', now)).toBe('3 days ago');
    expect(formatRelative('2026-09-01T12:00:00Z', now)).toBe('Sep 1, 2026');
    expect(formatRelative('garbage', now)).toBe('unknown');
  });
  it('formats durations', () => {
    expect(formatDuration(12_300)).toBe('12.3 s');
    expect(formatDuration(125_000)).toBe('2 min 05 s');
    expect(formatDuration(119_800)).toBe('2 min 00 s');
  });
});
