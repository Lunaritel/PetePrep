import { contextBridge, ipcRenderer } from 'electron';

export interface PickedFile {
  name: string;
  data: Uint8Array;
}

export interface PickedText {
  name: string;
  text: string;
}

const api = {
  appName: 'DECAPete',
  version: '0.1.0',
  /** Native "open" dialog filtered to PDFs. Resolves null if the user cancels. */
  openPdf: (): Promise<PickedFile | null> => ipcRenderer.invoke('file:open-pdf'),
  /** Native "save as" dialog; resolves the chosen path, or null if cancelled. */
  saveTextFile: (suggestedName: string, text: string): Promise<string | null> =>
    ipcRenderer.invoke('file:save-text', suggestedName, text),
  /** Native "open" dialog for a .json backup. Resolves null if cancelled. */
  openTextFile: (): Promise<PickedText | null> => ipcRenderer.invoke('file:open-text'),
  /** Writes into Documents/DECAPete Backups without a dialog; resolves the full path. */
  writeAutoBackup: (fileName: string, text: string): Promise<string> =>
    ipcRenderer.invoke('file:auto-backup', fileName, text),
} as const;

export type DecaApi = typeof api;

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('deca', api);
} else {
  (globalThis as unknown as { deca: DecaApi }).deca = api;
}
