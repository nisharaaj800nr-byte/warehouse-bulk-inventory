const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const PANEL = path.join(__dirname, 'panel', 'index.html');

function createWindow() {
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

  win.loadFile(PANEL);

  // Any external link opens in the real browser, never inside the app shell.
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

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
