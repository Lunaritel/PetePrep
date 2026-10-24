import { app, BrowserWindow, dialog, ipcMain, nativeTheme, net, protocol, shell } from 'electron';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, normalize, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { registerUpdater } from './updater';

const APP_SCHEME = 'app';
const APP_HOST = 'renderer';
const rendererRoot = join(__dirname, '../renderer');

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);

function registerAppProtocol(): void {
  protocol.handle(APP_SCHEME, (request) => {
    const { host, pathname } = new URL(request.url);
    if (host !== APP_HOST) return new Response('Not found', { status: 404 });
    const relative = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
    const filePath = normalize(join(rendererRoot, relative));
    if (!filePath.startsWith(rendererRoot + sep)) {
      return new Response('Forbidden', { status: 403 });
    }
    return net.fetch(pathToFileURL(filePath).toString());
  });
}

const devIcon = join(__dirname, '../../build/icon.png');
const MAX_PDF_BYTES = 100 * 1024 * 1024;
const MAX_TEXT_BYTES = 200 * 1024 * 1024;

function registerIpc(): void {
  ipcMain.handle('file:open-pdf', async (event) => {
    const owner = BrowserWindow.fromWebContents(event.sender);
    const options = { title: 'Choose a DECA exam PDF', properties: ['openFile' as const], filters: [{ name: 'PDF', extensions: ['pdf'] }] };
    const picked = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options);
    if (picked.canceled || picked.filePaths.length === 0) return null;
    const data = await readFile(picked.filePaths[0]);
    if (data.byteLength > MAX_PDF_BYTES) throw new Error('That PDF is too large to import.');
    return { name: basename(picked.filePaths[0]), data: new Uint8Array(data) };
  });

  ipcMain.handle('file:save-text', async (event, suggestedName: unknown, text: unknown) => {
    if (typeof suggestedName !== 'string' || typeof text !== 'string') throw new Error('Invalid save request.');
    const owner = BrowserWindow.fromWebContents(event.sender);
    const options = { defaultPath: basename(suggestedName), filters: [{ name: 'JSON', extensions: ['json'] }] };
    const picked = owner ? await dialog.showSaveDialog(owner, options) : await dialog.showSaveDialog(options);
    if (picked.canceled || !picked.filePath) return null;
    await writeFile(picked.filePath, text, 'utf8');
    return picked.filePath;
  });

  ipcMain.handle('file:open-text', async (event) => {
    const owner = BrowserWindow.fromWebContents(event.sender);
    const options = { title: 'Choose a backup file', properties: ['openFile' as const], filters: [{ name: 'JSON', extensions: ['json'] }] };
    const picked = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options);
    if (picked.canceled || picked.filePaths.length === 0) return null;
    const data = await readFile(picked.filePaths[0]);
    if (data.byteLength > MAX_TEXT_BYTES) throw new Error('That file is too large to restore.');
    return { name: basename(picked.filePaths[0]), text: data.toString('utf8') };
  });

  ipcMain.handle('file:auto-backup', async (_event, fileName: unknown, text: unknown) => {
    if (typeof fileName !== 'string' || typeof text !== 'string') throw new Error('Invalid backup request.');
    const safe = basename(fileName).replace(/[^\w.-]+/g, '_');
    if (!safe.endsWith('.json')) throw new Error('Backups must be .json files.');
    const dir = join(app.getPath('documents'), 'DECAPete Backups');
    await mkdir(dir, { recursive: true });
    const path = join(dir, safe);
    await writeFile(path, text, 'utf8');
    return path;
  });
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1100,
    height: 800,
    minWidth: 760,
    minHeight: 600,
    show: false,
    // Packaged builds carry the icon in the .exe; this file only exists when running from source.
    ...(existsSync(devIcon) ? { icon: devIcon } : {}),
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#131528' : '#eef0f8',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  window.on('ready-to-show', () => {
    window.show();
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadURL(`${APP_SCHEME}://${APP_HOST}/index.html`);
  }
}

// One window only: two instances would fight over the same IndexedDB and backup files.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [existing] = BrowserWindow.getAllWindows();
    if (existing) {
      if (existing.isMinimized()) existing.restore();
      existing.focus();
    }
  });
}

app.whenReady().then(() => {
  registerAppProtocol();
  registerIpc();
  registerUpdater();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
