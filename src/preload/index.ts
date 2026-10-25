import { contextBridge, ipcRenderer } from 'electron';
import type { UpdateState } from './updateTypes';

/** Injected at build time from package.json (see electron.vite.config.ts). */
declare const __APP_VERSION__: string;

export interface PickedFile {
  name: string;
  data: Uint8Array;
}

export interface PickedText {
  name: string;
  text: string;
}

const api = {
  appName: 'PetePrep',
  version: __APP_VERSION__,
  /** Native "open" dialog filtered to PDFs. Resolves null if the user cancels. */
  openPdf: (): Promise<PickedFile | null> => ipcRenderer.invoke('file:open-pdf'),
  /** Native "save as" dialog; resolves the chosen path, or null if cancelled. */
  saveTextFile: (suggestedName: string, text: string): Promise<string | null> =>
    ipcRenderer.invoke('file:save-text', suggestedName, text),
  /** Native "open" dialog for a .json backup. Resolves null if cancelled. */
  openTextFile: (): Promise<PickedText | null> => ipcRenderer.invoke('file:open-text'),
  /** Writes into Documents/PetePrep Backups without a dialog; resolves the full path. */
  writeAutoBackup: (fileName: string, text: string): Promise<string> =>
    ipcRenderer.invoke('file:auto-backup', fileName, text),
  /** Asks the update server whether a newer version exists. The only network request the app can make. */
  checkForUpdates: (): Promise<UpdateState> => ipcRenderer.invoke('update:check'),
  /** Downloads the update found by checkForUpdates. Does nothing in any other state. */
  downloadUpdate: (): Promise<UpdateState> => ipcRenderer.invoke('update:download'),
  /** Restarts into the installer once the update has downloaded. Does nothing in any other state. */
  installUpdate: (): Promise<void> => ipcRenderer.invoke('update:install'),
  getUpdateState: (): Promise<UpdateState> => ipcRenderer.invoke('update:get-state'),
  /** Subscribes to update progress; returns an unsubscribe function. The event object is never exposed. */
  onUpdateState: (callback: (state: UpdateState) => void): (() => void) => {
    const listener = (_event: unknown, state: UpdateState): void => callback(state);
    ipcRenderer.on('update:state', listener);
    return () => {
      ipcRenderer.removeListener('update:state', listener);
    };
  },
} as const;

export type DecaApi = typeof api;

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('deca', api);
} else {
  (globalThis as unknown as { deca: DecaApi }).deca = api;
}
