import { platform } from '../platform';
import { BackupFormatError } from './contract';
import type { Repository } from './contract';

const AUTO_BACKUP_KEY = 'deca.autoBackup';

function bridge() {
  return typeof window === 'undefined' ? undefined : window.deca;
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0');
}

function dateStamp(now: Date): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function timeStamp(now: Date): string {
  return `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

/** Auto-backup after each session is on unless the user switched it off. */
export function isAutoBackupEnabled(): boolean {
  try {
    return localStorage.getItem(AUTO_BACKUP_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function setAutoBackupEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(AUTO_BACKUP_KEY, String(enabled));
  } catch {
    // Storage can be blocked; the setting simply won't persist.
  }
}

/** Writes a timestamped backup to Documents/PetePrep Backups when enabled. Never throws; resolves the path or null. */
export async function maybeAutoBackup(repo: Repository): Promise<string | null> {
  try {
    const deca = bridge();
    if (!deca || !isAutoBackupEnabled()) return null;
    const now = new Date();
    const backup = await repo.exportAll();
    return await deca.writeAutoBackup(`auto-${dateStamp(now)}-${timeStamp(now)}.json`, JSON.stringify(backup));
  } catch {
    return null;
  }
}

/** Exports a backup through a native save dialog or a browser download. */
export async function exportBackupToFile(repo: Repository): Promise<string | null> {
  const backup = await repo.exportAll();
  return platform.downloadFile(`peteprep-backup-${dateStamp(new Date())}.json`, JSON.stringify(backup));
}

/** Restores a backup from a native dialog or a browser file picker. */
export async function restoreBackupFromFile(repo: Repository): Promise<boolean> {
  const picked = await platform.pickTextFile();
  if (!picked) return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(picked.text);
  } catch {
    throw new BackupFormatError('This file is not a PetePrep backup (it is not valid JSON).');
  }
  await repo.importAll(parsed);
  return true;
}
