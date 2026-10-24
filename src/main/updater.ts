import { app, BrowserWindow, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { NOT_INSTALLED_REASON, PORTABLE_REASON, UpdateService } from './updateService';
import type { AutoUpdaterLike } from './updateService';

/** The NSIS installer drops an uninstaller next to the exe; the portable zip does not. */
function installedByInstaller(): boolean {
  return existsSync(join(dirname(process.execPath), 'Uninstall PetePrep.exe'));
}

/**
 * Wires electron-updater to the renderer. Nothing here talks to the network until the renderer asks
 * (update:check), so a fresh install makes no request at startup.
 */
export function registerUpdater(): UpdateService {
  // Test hook for local feeds. It is read only from an unpackaged run, never from the shipped app.
  const testFeed = !app.isPackaged ? process.env.PETEPREP_TEST_FEED : undefined;
  if (testFeed) {
    autoUpdater.setFeedURL({ provider: 'generic', url: testFeed });
    autoUpdater.forceDevUpdateConfig = true;
  }

  let unavailableReason: string | null = null;
  if (!testFeed) {
    if (!app.isPackaged) unavailableReason = NOT_INSTALLED_REASON;
    else if (!installedByInstaller()) unavailableReason = PORTABLE_REASON;
  }

  const service = new UpdateService({
    updater: autoUpdater as unknown as AutoUpdaterLike,
    currentVersion: app.getVersion(),
    unavailableReason,
    onState: (state) => {
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) window.webContents.send('update:state', state);
      }
    },
  });

  // None of these accept arguments from the renderer, so there is nothing to validate or spoof.
  ipcMain.handle('update:get-state', () => service.getState());
  ipcMain.handle('update:check', () => service.check());
  ipcMain.handle('update:download', () => service.download());
  ipcMain.handle('update:install', () => {
    service.install();
  });
  return service;
}
