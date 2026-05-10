const { app, BrowserWindow, dialog, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 768,
    title: 'Libria',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.on('close', (e) => {
    if (mainWindow._forceClose) return;
    e.preventDefault();
    mainWindow.webContents.send('app:close-requested');
  });

  const isDev = process.argv.includes('--dev');
  if (isDev) {
    mainWindow.loadURL('http://localhost:4200');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'libria', 'browser', 'index.html'));
  }
}

ipcMain.on('app:confirm-close', () => {
  mainWindow._forceClose = true;
  mainWindow.close();
});

function send(action) {
  mainWindow?.webContents.send('menu:action', action);
}

function buildMenu() {
  const template = [
    {
      label: 'Archivo',
      submenu: [
        { label: 'Nuevo', accelerator: 'CmdOrCtrl+N', click: () => send('new') },
        { label: 'Abrir', accelerator: 'CmdOrCtrl+O', click: () => send('open') },
        { label: 'Guardar', accelerator: 'CmdOrCtrl+S', click: () => send('save') },
        { label: 'Guardar como', accelerator: 'CmdOrCtrl+Shift+S', click: () => send('saveAs') },
      ],
    },
    {
      label: 'Editar',
      submenu: [
        { label: 'Deshacer', accelerator: 'CmdOrCtrl+Z', click: () => send('undo') },
        { label: 'Rehacer', accelerator: 'CmdOrCtrl+Y', click: () => send('redo') },
      ],
    },
    {
      label: 'Ver',
      submenu: [
        { label: 'Buscar', accelerator: 'CmdOrCtrl+F', click: () => send('search') },
      ],
    },
    {
      label: 'Ayuda',
      submenu: [
        { label: 'Acerca de Libria…', click: () => send('about') },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  buildMenu();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.handle('dialog:save', async (_event, defaultName) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName,
    filters: [{ name: 'Documento Libria', extensions: ['libria'] }],
  });
  return result.canceled ? null : result.filePath;
});

ipcMain.handle('dialog:open', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Documento Libria', extensions: ['libria', 'json'] }],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('fs:writeFile', async (_event, filePath, content) => {
  fs.writeFileSync(filePath, content, 'utf-8');
});

ipcMain.handle('fs:readFile', async (_event, filePath) => {
  return fs.readFileSync(filePath, 'utf-8');
});

ipcMain.handle('pdf:printToPDF', async (_event, options) => {
  // Apply inline styles directly — they override any stylesheet rule (no @media print needed)
  await mainWindow.webContents.executeJavaScript(`
    window.__libriaState = [];
    const _save = (el, props) => {
      const entry = { el, orig: {} };
      props.forEach(p => { entry.orig[p] = el.style[p]; });
      window.__libriaState.push(entry);
    };

    const pg = document.querySelector('.print-generator');
    if (pg) {
      // Unlock every ancestor
      let el = pg.parentElement;
      while (el && el !== document.documentElement) {
        _save(el, ['overflow', 'overflowY', 'height', 'maxHeight', 'flex']);
        el.style.overflow  = 'visible';
        el.style.overflowY = 'visible';
        el.style.height    = 'auto';
        el.style.maxHeight = 'none';
        el.style.flex      = 'none';
        el = el.parentElement;
      }
      // Unlock print-generator itself
      _save(pg, ['position', 'height', 'overflow', 'visibility', 'zIndex']);
      pg.style.position   = 'static';
      pg.style.height     = 'auto';
      pg.style.overflow   = 'visible';
      pg.style.visibility = 'visible';
      pg.style.zIndex     = 'auto';

      // Unlock print__content (container-type:size clips content)
      pg.querySelectorAll('.print__content').forEach(c => {
        _save(c, ['overflow', 'height', 'flex']);
        c.style.overflow = 'visible';
        c.style.height   = 'auto';
        c.style.flex     = 'none';
      });

      // Remove inline padding from each chapter page so @page :left/:right margins
      // are the ONLY margin source (prevents double-margin and wrong odd/even margins).
      pg.querySelectorAll('.print__page').forEach(page => {
        _save(page, ['paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight']);
        page.style.paddingTop    = '0';
        page.style.paddingBottom = '0';
        page.style.paddingLeft   = '0';
        page.style.paddingRight  = '0';
      });
    }
  `);

  try {
    const pdf = await mainWindow.webContents.printToPDF(options);
    return pdf;
  } catch (err) {
    console.error('[printToPDF] Error:', err);
    throw err;
  } finally {
    await mainWindow.webContents.executeJavaScript(`
      if (window.__libriaState) {
        window.__libriaState.forEach(({ el, orig }) => {
          Object.entries(orig).forEach(([p, v]) => { el.style[p] = v; });
        });
        delete window.__libriaState;
      }
    `);
  }
});
