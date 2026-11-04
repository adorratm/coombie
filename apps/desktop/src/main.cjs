const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

/**
 * Dev: PROTOCOL_Z_GAME_URL (default Vite :5173) or PROTOCOL_Z_WEB_URL.
 * Packaged: load resources/game-dist/index.html (Steam / electron-builder artifact).
 */
const isDev = !app.isPackaged;
const DEV_GAME_URL =
  process.env.PROTOCOL_Z_GAME_URL ||
  process.env.PROTOCOL_Z_WEB_URL ||
  'http://localhost:5173';

function resolveGameIndex() {
  const candidates = [
    path.join(process.resourcesPath, 'game-dist', 'index.html'),
    path.join(__dirname, '..', 'game-dist', 'index.html'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/** Steamworks placeholder — Spacewar 480 until real AppID is set. */
function ensureSteamAppIdFile() {
  if (isDev) return;
  const target = path.join(path.dirname(process.execPath), 'steam_appid.txt');
  if (fs.existsSync(target)) return;
  const bundled = path.join(process.resourcesPath, 'steam_appid.txt');
  if (fs.existsSync(bundled)) {
    try {
      fs.copyFileSync(bundled, target);
    } catch {
      /* non-fatal */
    }
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 1280,
    minHeight: 720,
    backgroundColor: '#090D10',
    title: 'PROTOCOL-Z',
    autoHideMenuBar: true,
    fullscreenable: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      spellcheck: false,
    },
  });

  win.setMenuBarVisibility(false);

  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    }
    if (input.key === 'F12' && isDev) {
      win.webContents.toggleDevTools();
    }
  });

  if (isDev) {
    void win.loadURL(DEV_GAME_URL);
    return win;
  }

  const indexHtml = resolveGameIndex();
  if (indexHtml) {
    void win.loadFile(indexHtml);
  } else {
    void win.loadURL(
      'data:text/html,<h1 style="font-family:sans-serif;color:#fff;background:#111;padding:2rem">PROTOCOL-Z game-dist missing. Run yarn build:desktop first.</h1>',
    );
  }
  return win;
}

app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('force_high_performance_gpu');

app.whenReady().then(() => {
  ensureSteamAppIdFile();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
