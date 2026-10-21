const { app, BrowserWindow, Menu, shell, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const { spawn } = require('node:child_process');

const PANEL = path.join(__dirname, 'panel', 'index.html');
let serverProcess = null;
let serverPort = 0;

function runtimeDir() {
  const packaged = path.join(process.resourcesPath, 'server-runtime');
  if (app.isPackaged && fs.existsSync(packaged)) return packaged;
  return path.join(__dirname, 'server-runtime');
}

function checkPort(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '127.0.0.1');
  });
}

async function findPort(start, attempts = 20) {
  for (let offset = 0; offset < attempts; offset += 1) {
    const port = start + offset;
    if (await checkPort(port)) return port;
    if (await isOurServer(port)) return port;
  }
  return 0;
}

function isOurServer(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/api/health', timeout: 1200 }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve(parsed && parsed.ok === true && parsed.data && parsed.data.status === 'ok');
        } catch {
          resolve(false);
        }
      });
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

function waitForHealth(port, timeoutMs = 30000) {
  const started = Date.now();
  return new Promise((resolve) => {
    const tick = async () => {
      if (await isOurServer(port)) return resolve(true);
      if (Date.now() - started > timeoutMs) return resolve(false);
      setTimeout(tick, 400);
    };
    void tick();
  });
}

async function startServer() {
  const dir = runtimeDir();
  const entry = path.join(dir, 'dist', 'index.js');
  if (!fs.existsSync(entry)) {
    console.warn('server runtime missing at', dir);
    return 0;
  }

  const port = await findPort(5050);
  if (!port) throw new Error('No free local port found (5050-5069).');

  // An instance of our own server may already be running (e.g. launched twice).
  if (await isOurServer(port)) {
    console.log('reusing running server on', port);
    return port;
  }

  const dataDir = path.join(app.getPath('userData'), 'data');
  const logDir = path.join(app.getPath('userData'), 'logs');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(logDir, { recursive: true });
  const log = fs.createWriteStream(path.join(logDir, 'server.log'), { flags: 'a' });

  serverProcess = spawn(process.execPath, [entry], {
    cwd: dir,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: String(port),
      DB_PATH: path.join(dataDir, 'bulkrepair.db')
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  serverProcess.stdout.pipe(log);
  serverProcess.stderr.pipe(log);
  serverProcess.on('exit', (code, signal) => {
    console.log('embedded server exited', code, signal);
    serverProcess = null;
  });

  const healthy = await waitForHealth(port);
  if (!healthy) {
    throw new Error(`Embedded server did not become healthy. See ${path.join(logDir, 'server.log')}`);
  }

  console.log('embedded server ready on', port);
  return port;
}

function stopServer() {
  if (!serverProcess) return;
  try {
    serverProcess.kill('SIGTERM');
  } catch {
    /* already gone */
  }
  serverProcess = null;
}

function createWindow(port) {
  const win = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#0b1220',
    title: 'Bulk Repair',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  win.once('ready-to-show', () => win.show());

  if (!fs.existsSync(PANEL)) {
    win.loadURL(
      'data:text/html;charset=utf-8,' +
        encodeURIComponent(
          '<body style="font-family:system-ui;background:#0b1220;color:#e2e8f0;padding:40px">' +
            '<h2>Panel build missing</h2>' +
            '<p>Run <code>npm run panel</code> inside the desktop folder first.</p></body>'
        )
    );
    return;
  }

  const query = port ? { api: `http://127.0.0.1:${port}/api/gas` } : undefined;
  win.loadFile(PANEL, query ? { query } : undefined);

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) {
      event.preventDefault();
      if (url.startsWith('http')) shell.openExternal(url);
    }
  });
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);

  try {
    serverPort = await startServer();
  } catch (error) {
    console.error(error);
    dialog.showErrorBox(
      'Bulk Repair — server failed to start',
      `${error && error.message ? error.message : error}\n\nYou can still use the app by pointing Setup → Server URL at an external backend.`
    );
  }

  createWindow(serverPort);
  startAutoUpdate();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(serverPort);
  });
});

app.on('before-quit', () => {
  stopServer();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function startAutoUpdate() {
  const feed = process.env.UPDATE_FEED_URL;
  if (!feed || !app.isPackaged) return;

  try {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.setFeedURL({ provider: 'generic', url: feed });
    autoUpdater.autoDownload = true;
    autoUpdater.checkForUpdatesAndNotify().catch((error) => {
      console.warn('auto-update check failed:', error && error.message ? error.message : error);
    });
  } catch (error) {
    console.warn('auto-update unavailable:', error && error.message ? error.message : error);
  }
}
