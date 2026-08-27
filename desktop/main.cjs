/**
 * Desktop shell for the Madden Draft Class Generator: boots the Express server
 * (built server/dist) in this process on a free port and opens the web UI in a
 * window. All state lives per-user:
 *   data (read-only)  -> resources/data          (shipped with the app)
 *   cache / downloads -> %APPDATA%/madden-draft-class-generator/cache
 * In development (`npm start` inside desktop/) it uses the repo's server/dist,
 * web/dist and server/data directly.
 */
const { app, BrowserWindow, shell, dialog } = require('electron');
const path = require('path');
const net = require('net');
const fs = require('fs');

const packaged = app.isPackaged;
const res = (...p) => (packaged ? path.join(process.resourcesPath, ...p) : path.join(__dirname, '..', ...p));

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

async function waitForHealth(port, tries = 120) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (r.ok) return true;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

/** Which game this build targets ('m26' | 'm27'), baked into the packaged
 *  package.json by electron-builder extraMetadata. Dev falls back to the env. */
function pinnedGameVersion() {
  try {
    const v = require(path.join(app.getAppPath(), 'package.json')).gameVersion;
    if (v === 'm26' || v === 'm27') return v;
  } catch { /* dev: no extraMetadata */ }
  const e = process.env.DRAFT_TOOL_GAME;
  return e === 'm26' || e === 'm27' ? e : null;
}

async function start() {
  const port = await freePort();
  const cacheDir = path.join(app.getPath('userData'), 'cache');
  fs.mkdirSync(cacheDir, { recursive: true });

  process.env.PORT = String(port);
  process.env.HOST = '127.0.0.1';
  process.env.DRAFT_TOOL_DATA = packaged ? res('data') : path.join(__dirname, '..', 'server', 'data');
  process.env.DRAFT_TOOL_CACHE = cacheDir;
  process.env.WEB_DIST = packaged ? res('web') : path.join(__dirname, '..', 'web', 'dist');
  const game = pinnedGameVersion();
  if (game) process.env.DRAFT_TOOL_GAME = game;

  // The server listens as a side effect of the require (same process: no child
  // Node needed, and the native modules are the ones electron-builder rebuilt).
  const serverEntry = packaged ? path.join(app.getAppPath(), 'server', 'server.js') : path.join(__dirname, '..', 'server', 'dist', 'server.js');
  try {
    require(serverEntry);
  } catch (e) {
    dialog.showErrorBox('Server failed to start', String(e && e.stack ? e.stack : e));
    app.quit();
    return;
  }

  // Packaged builds get their icon from the exe (builder-m26/27.json win.icon);
  // dev (`npm start`) reads the same .ico from disk so the window matches.
  const devIcon = path.join(__dirname, 'icons', game === 'm27' ? 'm27.ico' : 'm26.ico');
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    backgroundColor: '#0b0d12',
    autoHideMenuBar: true,
    title: game === 'm26' ? 'Madden 26 Draft Class Generator' : game === 'm27' ? 'Madden 27 Draft Class Generator' : 'Madden Draft Class Generator',
    ...(packaged ? {} : fs.existsSync(devIcon) ? { icon: devIcon } : {}),
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  // External links (Wikipedia photos etc.) go to the real browser.
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });

  const ok = await waitForHealth(port);
  if (!ok) {
    dialog.showErrorBox('Server did not come up', 'The local API never answered on http://127.0.0.1:' + port);
    app.quit();
    return;
  }
  await win.loadURL(`http://127.0.0.1:${port}`);
}

app.whenReady().then(start);
app.on('window-all-closed', () => app.quit());
