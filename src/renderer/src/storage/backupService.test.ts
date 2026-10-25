import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  exportBackupToFile,
  isAutoBackupEnabled,
  maybeAutoBackup,
  restoreBackupFromFile,
  setAutoBackupEnabled,
} from './backupService';
import { BackupFormatError } from './contract';
import { createMemoryRepository } from './memoryRepository';
import { makeQuestion } from './repositoryContract';

type Bridge = NonNullable<Window['deca']>;

function installBridge(overrides: Partial<Bridge> = {}) {
  const bridge = {
    appName: 'PetePrep',
    version: 'test',
    openPdf: vi.fn(),
    saveTextFile: vi.fn(async () => 'C:/saved.json'),
    openTextFile: vi.fn(async () => null),
    writeAutoBackup: vi.fn(async (name: string) => `C:/Docs/${name}`),
    ...overrides,
  } as unknown as Bridge;
  window.deca = bridge;
  return bridge;
}

async function seededRepo() {
  const repo = createMemoryRepository();
  const exam = await repo.saveExam({ title: 'Sample', fileHash: 'h', fileName: 's.pdf' }, [makeQuestion(1), makeQuestion(2)]);
  return { repo, exam };
}

beforeEach(() => {
  localStorage.clear();
  window.deca = undefined;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.deca = undefined;
});

describe('auto-backup setting', () => {
  it('defaults to on', () => {
    expect(isAutoBackupEnabled()).toBe(true);
  });

  it('can be switched off and on again, and persists', () => {
    setAutoBackupEnabled(false);
    expect(isAutoBackupEnabled()).toBe(false);
    expect(localStorage.getItem('deca.autoBackup')).toBe('false');
    setAutoBackupEnabled(true);
    expect(isAutoBackupEnabled()).toBe(true);
  });

  it('survives blocked storage (reads default to on, writes do not throw)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(isAutoBackupEnabled()).toBe(true);
    expect(() => setAutoBackupEnabled(false)).not.toThrow();
  });
});

describe('maybeAutoBackup', () => {
  it('writes a timestamped JSON backup of the whole database', async () => {
    const bridge = installBridge();
    const { repo } = await seededRepo();
    const path = await maybeAutoBackup(repo);
    expect(bridge.writeAutoBackup).toHaveBeenCalledTimes(1);
    const [name, text] = (bridge.writeAutoBackup as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string];
    expect(name).toMatch(/^auto-\d{4}-\d{2}-\d{2}-\d{6}\.json$/);
    expect(path).toBe(`C:/Docs/${name}`);
    const backup = JSON.parse(text);
    expect(backup.format).toBe('peteprep-backup');
    expect(backup.questions).toHaveLength(2);
  });

  it('does nothing when switched off', async () => {
    const bridge = installBridge();
    setAutoBackupEnabled(false);
    const { repo } = await seededRepo();
    expect(await maybeAutoBackup(repo)).toBeNull();
    expect(bridge.writeAutoBackup).not.toHaveBeenCalled();
  });

  it('returns null without throwing when there is no native bridge', async () => {
    const { repo } = await seededRepo();
    await expect(maybeAutoBackup(repo)).resolves.toBeNull();
  });

  it('returns null without throwing when the write fails', async () => {
    installBridge({
      writeAutoBackup: vi.fn(async () => {
        throw new Error('disk full');
      }),
    });
    const { repo } = await seededRepo();
    await expect(maybeAutoBackup(repo)).resolves.toBeNull();
  });

  it('returns null without throwing when the database cannot be read', async () => {
    installBridge();
    const repo = createMemoryRepository();
    repo.exportAll = async () => {
      throw new Error('db closed');
    };
    await expect(maybeAutoBackup(repo)).resolves.toBeNull();
  });
});

describe('exportBackupToFile', () => {
  it('asks for a dated file name and saves the backup JSON', async () => {
    const bridge = installBridge();
    const { repo } = await seededRepo();
    const path = await exportBackupToFile(repo);
    expect(path).toBe('C:/saved.json');
    const [name, text] = (bridge.saveTextFile as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string];
    expect(name).toMatch(/^peteprep-backup-\d{4}-\d{2}-\d{2}\.json$/);
    expect(JSON.parse(text).exams).toHaveLength(1);
  });

  it('resolves null when the user cancels the dialog', async () => {
    installBridge({ saveTextFile: vi.fn(async () => null) });
    const { repo } = await seededRepo();
    expect(await exportBackupToFile(repo)).toBeNull();
  });

  it('downloads a backup in the browser when no native bridge exists', async () => {
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:test'), revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const { repo } = await seededRepo();
    const name = await exportBackupToFile(repo);
    expect(name).toMatch(/^peteprep-backup-\d{4}-\d{2}-\d{2}\.json$/);
    expect(click).toHaveBeenCalledOnce();
  });
});

describe('restoreBackupFromFile', () => {
  it('round-trips: export, wipe, restore through the file bridge', async () => {
    const { repo, exam } = await seededRepo();
    let saved = '';
    installBridge({
      saveTextFile: vi.fn(async (_name: string, text: string) => {
        saved = text;
        return 'C:/saved.json';
      }),
      openTextFile: vi.fn(async () => ({ name: 'saved.json', text: saved })),
    });
    await exportBackupToFile(repo);
    await repo.deleteExam(exam.id);
    expect(await repo.listExams()).toEqual([]);
    expect(await restoreBackupFromFile(repo)).toBe(true);
    expect((await repo.listExams()).map((e) => e.id)).toEqual([exam.id]);
    expect(await repo.getQuestions(exam.id)).toHaveLength(2);
  });

  it('resolves false and changes nothing when the user cancels', async () => {
    installBridge();
    const { repo, exam } = await seededRepo();
    expect(await restoreBackupFromFile(repo)).toBe(false);
    expect((await repo.listExams()).map((e) => e.id)).toEqual([exam.id]);
  });

  it('gives a friendly BackupFormatError for a file that is not JSON, and keeps existing data', async () => {
    installBridge({ openTextFile: vi.fn(async () => ({ name: 'x.json', text: '{ this is not json' })) });
    const { repo, exam } = await seededRepo();
    const error = await restoreBackupFromFile(repo).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BackupFormatError);
    expect((error as Error).message).toMatch(/not valid JSON/);
    expect((await repo.listExams()).map((e) => e.id)).toEqual([exam.id]);
  });

  it('rejects JSON that is not a backup, and keeps existing data', async () => {
    installBridge({ openTextFile: vi.fn(async () => ({ name: 'x.json', text: JSON.stringify({ hello: 'world' }) })) });
    const { repo, exam } = await seededRepo();
    await expect(restoreBackupFromFile(repo)).rejects.toBeInstanceOf(BackupFormatError);
    expect((await repo.listExams()).map((e) => e.id)).toEqual([exam.id]);
  });

  it('resolves false when the browser file picker is cancelled', async () => {
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (this: HTMLInputElement) {
      this.dispatchEvent(new Event('cancel'));
    });
    const { repo } = await seededRepo();
    await expect(restoreBackupFromFile(repo)).resolves.toBe(false);
  });
});
