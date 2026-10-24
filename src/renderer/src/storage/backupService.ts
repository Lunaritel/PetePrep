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

/** Writes a timestamped backup to Documents/DECAPete Backups when enabled. Never throws; resolves the path or null. */
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

/** Native save dialog -> backup JSON. Resolves the saved path, or null if cancelled. */
export async function exportBackupToFile(repo: Repository): Promise<string | null> {
  const deca = bridge();
  if (!deca) throw new Error('Saving a backup is only available in the desktop app.');
  const backup = await repo.exportAll();
  return deca.saveTextFile(`decapete-backup-${dateStamp(new Date())}.json`, JSON.stringify(backup));
}

/** Native open dialog -> validate -> replace database. Resolves true if restored, false if cancelled. Throws BackupFormatError on a bad file. */
export async function restoreBackupFromFile(repo: Repository): Promise<boolean> {
  const deca = bridge();
  if (!deca) throw new Error('Restoring a backup is only available in the desktop app.');
  const picked = await deca.openTextFile();
  if (!picked) return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(picked.text);
  } catch {
    throw new BackupFormatError('This file is not a DECAPete backup (it is not valid JSON).');
  }
  await repo.importAll(parsed);
  return true;
}
