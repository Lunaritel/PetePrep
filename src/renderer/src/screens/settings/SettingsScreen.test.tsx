import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackupFormatError } from '../../storage/contract';
import { createMemoryRepository } from '../../storage/memoryRepository';
import { seedExam } from '../library/testSeed';
import { SettingsScreen } from './SettingsScreen';

const backup = vi.hoisted(() => ({
  exportBackupToFile: vi.fn(),
  restoreBackupFromFile: vi.fn(),
  isAutoBackupEnabled: vi.fn(() => true),
  setAutoBackupEnabled: vi.fn(),
  maybeAutoBackup: vi.fn(),
}));
vi.mock('../../storage/backupService', () => backup);

beforeEach(() => {
  backup.exportBackupToFile.mockReset();
  backup.restoreBackupFromFile.mockReset();
  backup.setAutoBackupEnabled.mockReset();
  backup.isAutoBackupEnabled.mockReset().mockReturnValue(true);
});
afterEach(cleanup);

describe('SettingsScreen', () => {
  it('exports a backup and reports where it went', async () => {
    backup.exportBackupToFile.mockResolvedValue('C:\\Users\\me\\deca.json');
    const repo = createMemoryRepository();
    render(<SettingsScreen repo={repo} navigate={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /Export backup/ }));
    expect(await screen.findByRole('status')).toHaveTextContent('Backup saved to C:\\Users\\me\\deca.json.');
    expect(backup.exportBackupToFile).toHaveBeenCalledWith(repo);
  });

  it('treats a cancelled export as neutral, not an error', async () => {
    backup.exportBackupToFile.mockResolvedValue(null);
    render(<SettingsScreen repo={createMemoryRepository()} navigate={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /Export backup/ }));
    expect(await screen.findByText(/Export cancelled/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows an export failure as an alert', async () => {
    backup.exportBackupToFile.mockRejectedValue(new Error('disk full'));
    render(<SettingsScreen repo={createMemoryRepository()} navigate={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /Export backup/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('disk full');
  });

  it('warns that restore REPLACES data and does nothing until confirmed', async () => {
    render(<SettingsScreen repo={createMemoryRepository()} navigate={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /Restore from backup/ }));
    const dialog = screen.getByRole('dialog', { name: 'Restore from a backup?' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getByText(/replaces all current data/i)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(backup.restoreBackupFromFile).not.toHaveBeenCalled();
  });

  it('restores after confirmation and offers a way to the library', async () => {
    backup.restoreBackupFromFile.mockResolvedValue(true);
    const navigate = vi.fn();
    const repo = createMemoryRepository();
    render(<SettingsScreen repo={repo} navigate={navigate} />);
    await userEvent.click(screen.getByRole('button', { name: /Restore from backup/ }));
    await userEvent.click(screen.getByRole('button', { name: /Choose backup file/ }));
    expect(await screen.findByText(/Backup restored/)).toBeInTheDocument();
    expect(backup.restoreBackupFromFile).toHaveBeenCalledWith(repo);
    await userEvent.click(screen.getByRole('button', { name: 'Go to library' }));
    expect(navigate).toHaveBeenCalledWith({ name: 'library' });
  });

  it('says nothing changed when the restore picker is cancelled', async () => {
    backup.restoreBackupFromFile.mockResolvedValue(false);
    render(<SettingsScreen repo={createMemoryRepository()} navigate={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /Restore from backup/ }));
    await userEvent.click(screen.getByRole('button', { name: /Choose backup file/ }));
    expect(await screen.findByText(/Restore cancelled. Your data was not changed/)).toBeInTheDocument();
  });

  it('shows the plain-language reason when a backup file is bad', async () => {
    backup.restoreBackupFromFile.mockRejectedValue(new BackupFormatError('This file is not a DECAPete backup.'));
    render(<SettingsScreen repo={createMemoryRepository()} navigate={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /Restore from backup/ }));
    await userEvent.click(screen.getByRole('button', { name: /Choose backup file/ }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('This file is not a DECAPete backup.');
    expect(alert).toHaveTextContent('Your current data was not changed.');
  });

  it('toggles auto-backup and names the folder', async () => {
    render(<SettingsScreen repo={createMemoryRepository()} navigate={vi.fn()} />);
    const toggle = screen.getByRole('switch', { name: /Back up automatically/ });
    expect(toggle).toBeChecked();
    expect(screen.getByText('Documents\\DECAPete Backups')).toBeInTheDocument();
    backup.isAutoBackupEnabled.mockReturnValue(false);
    await userEvent.click(toggle);
    expect(backup.setAutoBackupEnabled).toHaveBeenCalledWith(false);
    expect(toggle).not.toBeChecked();
  });

  it('shows about info, the privacy promise and a disabled update check', () => {
    render(<SettingsScreen repo={createMemoryRepository()} navigate={vi.fn()} />);
    expect(screen.getByText(/version dev/)).toBeInTheDocument();
    expect(screen.getByText(/no accounts, no tracking and no telemetry/i)).toBeInTheDocument();
    expect(screen.getByText(/no exam content is bundled/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check for updates (coming later)' })).toBeDisabled();
  });

  it('reset-all needs the exact word DELETE, then removes every exam', async () => {
    const repo = createMemoryRepository();
    await seedExam(repo, { title: 'One' });
    await seedExam(repo, { title: 'Two' });
    render(<SettingsScreen repo={repo} navigate={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /Reset all data/ }));
    const dialog = screen.getByRole('dialog', { name: 'Delete everything?' });
    const input = within(dialog).getByLabelText(/Type DELETE to confirm/);
    expect(input).toHaveFocus();
    const confirm = within(dialog).getByRole('button', { name: 'Delete everything' });
    expect(confirm).toBeDisabled();
    await userEvent.type(input, 'delete');
    expect(confirm).toBeDisabled();
    await userEvent.clear(input);
    await userEvent.type(input, 'DELETE');
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);

    expect(await screen.findByText('All exams and progress were deleted.')).toBeInTheDocument();
    expect(await repo.listExams()).toHaveLength(0);
  });

  it('cancelling reset-all keeps everything and clears the typed text', async () => {
    const repo = createMemoryRepository();
    await seedExam(repo);
    render(<SettingsScreen repo={repo} navigate={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /Reset all data/ }));
    await userEvent.type(screen.getByLabelText(/Type DELETE/), 'DELETE');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await repo.listExams()).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: /Reset all data/ }));
    expect(screen.getByLabelText(/Type DELETE/)).toHaveValue('');
  });
});
