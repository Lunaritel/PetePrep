import { contextBridge } from 'electron';

const api = {
  appName: 'DECA Mastery',
  version: '0.1.0',
} as const;

export type DecaApi = typeof api;

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('deca', api);
} else {
  (globalThis as unknown as { deca: DecaApi }).deca = api;
}
