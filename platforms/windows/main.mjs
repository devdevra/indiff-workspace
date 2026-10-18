/** Independent Electron host. Does not load or execute the extracted original app. */
import { app, BrowserWindow, dialog, ipcMain, protocol, session } from 'electron';
import { readFile, realpath, lstat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { APP_URL, CSP, assetForURL, createHostController, trustedSender } from './host-core.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const IPC_CHANNEL = 'indiff-native:invoke:v1';
const PARTITION = 'persist:indiff-platform-v1';
let mainWindow, controller, currentOwner;

// Must be registered before app.ready. The scheme has no external URL handler.
protocol.registerSchemesAsPrivileged([{ scheme: 'indiff-app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
app.enableSandbox();
app.setName('INDIFF Independent Platform Preview');
app.setAppUserModelId('local.indiff.independent.platformpreview');

async function installAssets(ses) {
  const root = await realpath(path.join(here, 'web'));
  const raw = await readFile(path.join(here, 'web-manifest.json'), 'utf8');
  const manifest = JSON.parse(raw);
  if (!Array.isArray(manifest) || !manifest.some(e => e.name === 'index.html')) throw Error('Missing prepared web assets.');
  const assets = new Map();
  for (const entry of manifest) {
    if (typeof entry.name !== 'string' || !/^(?:index\.html|styles\.css|app\.js|lib\/[a-z0-9._-]+\.js)$/.test(entry.name) || !/^[a-f0-9]{64}$/.test(entry.sha256) || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || entry.bytes > 2 * 1024 * 1024 || assets.has(entry.name)) throw Error('Invalid web manifest.');
    const absolute = path.join(root, ...entry.name.split('/'));
    if (!(await lstat(absolute)).isFile() || (await realpath(absolute)) !== absolute) throw Error('Unsafe web asset.');
    const bytes = await readFile(absolute);
    if (bytes.length !== entry.bytes || createHash('sha256').update(bytes).digest('hex') !== entry.sha256) throw Error('Web asset integrity mismatch.');
    // Only verified in-memory bytes are served. No request is converted into a disk path.
    assets.set(entry.name, bytes);
  }
  const names = new Set(assets.keys());
  const headers = { 'Content-Security-Policy': CSP, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };
  await ses.protocol.handle('indiff-app', request => {
    const name = assetForURL(request.url, names);
    if (!name || request.method !== 'GET') return new Response('Not found', { status: 404, headers });
    const contentType = name.endsWith('.html') ? 'text/html; charset=utf-8' : name.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8';
    return new Response(assets.get(name), { headers: { ...headers, 'Content-Type': contentType } });
  });
  ses.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  ses.setPermissionCheckHandler(() => false);
  ses.setDevicePermissionHandler(() => false);
  ses.on('will-download', event => event.preventDefault());
  ses.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !assetForURL(details.url, names) });
  });
}

function fileFilters(kind) {
  return kind === 'workspace' ? [{ name: 'INDIFF workspace JSON', extensions: ['json'] }] : [{ name: 'UTF-8 text and Markdown', extensions: ['txt', 'md', 'markdown', 'json'] }];
}

function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.focus(); return; }
  mainWindow = new BrowserWindow({
    width: 1440, height: 900, minWidth: 700, minHeight: 480,
    backgroundColor: '#09090b', show: false, autoHideMenuBar: true,
    webPreferences: {
      partition: PARTITION, preload: path.join(here, 'preload.cjs'),
      sandbox: true, contextIsolation: true, nodeIntegration: false,
      nodeIntegrationInWorker: false, nodeIntegrationInSubFrames: false,
      webviewTag: false, webSecurity: true, allowRunningInsecureContent: false,
      experimentalFeatures: false, devTools: false, safeDialogs: true, navigateOnDragDrop: false,
      spellcheck: false
    }
  });
  mainWindow.setMenu(null);
  currentOwner = controller.addOwner();
  const contents = mainWindow.webContents;
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', event => event.preventDefault());
  contents.on('will-frame-navigate', event => event.preventDefault());
  contents.on('will-redirect', event => event.preventDefault());
  contents.on('will-attach-webview', event => event.preventDefault());
  contents.on('did-start-navigation', (_event, _url, inPlace, isMainFrame) => {
    if (isMainFrame && !inPlace) { controller.revokeOwner(currentOwner); currentOwner = controller.addOwner(); }
  });
  contents.on('render-process-gone', () => { controller.revokeOwner(currentOwner); });
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => { controller.revokeOwner(currentOwner); mainWindow = null; });
  void mainWindow.loadURL(APP_URL).catch(() => {
    dialog.showErrorBox('INDIFF preview could not open', 'The prepared local UI could not be loaded. No original app or remote server was started.');
    app.quit();
  });
}

const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) app.quit();
else {
  app.on('second-instance', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); } });
  app.whenReady().then(async () => {
    const ses = session.fromPartition(PARTITION);
    await installAssets(ses);
    controller = createHostController({
      workspacePath: path.join(app.getPath('userData'), 'workspace-v1.json'), appVersion: app.getVersion(),
      dialogs: {
        async pick({ kind }) {
          const result = await dialog.showOpenDialog(mainWindow, { title: kind === 'workspace' ? 'Open workspace backup' : 'Open UTF-8 text', properties: ['openFile', 'dontAddToRecent'], filters: fileFilters(kind) });
          return result.canceled ? null : result.filePaths[0] || null;
        },
        async saveAs({ kind, name }) {
          const result = await dialog.showSaveDialog(mainWindow, { title: kind === 'workspace' ? 'Save workspace backup' : 'Save UTF-8 text', defaultPath: name, properties: ['dontAddToRecent', 'showOverwriteConfirmation'], filters: fileFilters(kind) });
          return result.canceled ? null : result.filePath || null;
        }
      }
    });
    ipcMain.handle(IPC_CHANNEL, async (event, method, payload) => {
      if (!mainWindow || !trustedSender(event, mainWindow.webContents)) return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Native access is restricted to the local application main document.' } };
      return controller.invoke(method, payload, currentOwner);
    });
    createWindow();
    app.on('activate', createWindow);
  }).catch(() => {
    dialog.showErrorBox('INDIFF preview is not prepared', 'Run the independent Windows prepare step and verify the packaged asset manifest before opening the preview.');
    app.quit();
  });
  app.on('window-all-closed', () => app.quit());
}
