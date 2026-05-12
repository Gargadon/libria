const { app, BrowserWindow, dialog, ipcMain, Menu, MenuItem } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let fileToOpen = null;
const customDictPath = path.join(app.getPath('userData'), 'custom-dictionary.json');

function loadCustomDictionary() {
  try {
    if (fs.existsSync(customDictPath)) {
      return JSON.parse(fs.readFileSync(customDictPath, 'utf-8'));
    }
  } catch (e) {
    console.error('Failed to load custom dictionary:', e);
  }
  return [];
}

function saveCustomDictionary(words) {
  try {
    fs.writeFileSync(customDictPath, JSON.stringify(words, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed to save custom dictionary:', e);
  }
}

app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (mainWindow) {
    mainWindow.webContents.send('file:open', filePath);
  } else {
    fileToOpen = filePath;
  }
});

function getFileArgument() {
  const args = process.argv.slice(app.isPackaged ? 1 : 2);
  return args.find((a) => a.endsWith('.libria')) ?? null;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 768,
    title: 'Libria',
    icon: path.join(__dirname, 'build', 'icon.png'),
    autoHideMenuBar: false, // Ensure menu bar is always visible on Linux/Windows
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

  // --- Spell checker setup ---
  const session = mainWindow.webContents.session;
  session.setSpellCheckerEnabled(true);
  session.setSpellCheckerLanguages(['es-ES']);
  const customWords = loadCustomDictionary();
  customWords.forEach(w => session.addWordToSpellCheckerDictionary(w));

  // Context menu with spelling suggestions
  mainWindow.webContents.on('context-menu', (_event, params) => {
    if (!params.isEditable) return;
    const menu = new Menu();

    if (params.misspelledWord) {
      for (const s of params.dictionarySuggestions.slice(0, 5)) {
        menu.append(new MenuItem({
          label: s,
          click: () => mainWindow.webContents.replaceMisspelling(s)
        }));
      }
      if (params.dictionarySuggestions.length > 0) {
        menu.append(new MenuItem({ type: 'separator' }));
      }
      menu.append(new MenuItem({
        label: 'Añadir «' + params.misspelledWord + '» al diccionario',
        click: () => {
          const word = params.misspelledWord;
          if (session.addWordToSpellCheckerDictionary(word)) {
            const words = loadCustomDictionary();
            if (!words.includes(word)) {
              words.push(word);
              saveCustomDictionary(words);
            }
          }
        }
      }));
      menu.append(new MenuItem({ type: 'separator' }));
    }

    if (params.editFlags.canCut) {
      menu.append(new MenuItem({ label: 'Cortar', accelerator: 'CmdOrCtrl+X', role: 'cut' }));
    }
    if (params.editFlags.canCopy) {
      menu.append(new MenuItem({ label: 'Copiar', accelerator: 'CmdOrCtrl+C', role: 'copy' }));
    }
    if (params.editFlags.canPaste) {
      menu.append(new MenuItem({ label: 'Pegar', accelerator: 'CmdOrCtrl+V', role: 'paste' }));
    }
    if (params.editFlags.canSelectAll) {
      if (menu.items.some(i => i.type !== 'separator')) {
        menu.append(new MenuItem({ type: 'separator' }));
      }
      menu.append(new MenuItem({ label: 'Seleccionar todo', accelerator: 'CmdOrCtrl+A', role: 'selectAll' }));
    }

    if (menu.items.length > 0) {
      menu.popup({ window: mainWindow });
    }
  });

  mainWindow.webContents.on('did-finish-load', () => {
    const filePath = fileToOpen ?? getFileArgument();
    if (filePath) {
      mainWindow.webContents.send('file:open', filePath);
      fileToOpen = null;
    }
  });
}

ipcMain.on('app:confirm-close', () => {
  mainWindow._forceClose = true;
  mainWindow.close();
});

function send(action) {
  mainWindow?.webContents.send('menu:action', action);
}

const menuLabels = {
  es: {
    file: 'Archivo', fileNew: 'Nuevo', fileOpen: 'Abrir', fileSave: 'Guardar', fileSaveAs: 'Guardar como', fileClose: 'Cerrar documento', fileQuit: 'Salir',
    edit: 'Editar', editUndo: 'Deshacer', editRedo: 'Rehacer',
    view: 'Ver', viewSearch: 'Buscar',
    help: 'Ayuda', helpAbout: 'Acerca de Libria…',
  },
  en: {
    file: 'File', fileNew: 'New', fileOpen: 'Open', fileSave: 'Save', fileSaveAs: 'Save As', fileClose: 'Close Document', fileQuit: 'Quit',
    edit: 'Edit', editUndo: 'Undo', editRedo: 'Redo',
    view: 'View', viewSearch: 'Search',
    help: 'Help', helpAbout: 'About Libria…',
  }
};

function buildMenu(lang = 'es') {
  const labels = menuLabels[lang] || menuLabels.es;
  const template = [
    {
      label: labels.file,
      submenu: [
        { label: labels.fileNew, accelerator: 'CmdOrCtrl+N', click: () => send('new') },
        { label: labels.fileOpen, accelerator: 'CmdOrCtrl+O', click: () => send('open') },
        { label: labels.fileSave, accelerator: 'CmdOrCtrl+S', click: () => send('save') },
        { label: labels.fileSaveAs, accelerator: 'CmdOrCtrl+Shift+S', click: () => send('saveAs') },
        { label: labels.fileClose, accelerator: 'CmdOrCtrl+W', click: () => send('close') },
        { type: 'separator' },
        { label: labels.fileQuit, accelerator: 'CmdOrCtrl+Q', click: () => mainWindow.close() },
      ],
    },
    {
      label: labels.edit,
      submenu: [
        { label: labels.editUndo, accelerator: 'CmdOrCtrl+Z', click: () => send('undo') },
        { label: labels.editRedo, accelerator: 'CmdOrCtrl+Y', click: () => send('redo') },
      ],
    },
    {
      label: labels.view,
      submenu: [
        { label: labels.viewSearch, accelerator: 'CmdOrCtrl+F', click: () => send('search') },
      ],
    },
    {
      label: labels.help,
      submenu: [
        { label: labels.helpAbout, click: () => send('about') },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
  return menu;
}

function setupHyphenation() {
  try {
    const userDataPath = app.getPath('userData');
    const hyphenDataPath = path.join(userDataPath, 'hyphen-data');
    if (!fs.existsSync(hyphenDataPath)) {
      fs.mkdirSync(hyphenDataPath, { recursive: true });
    }

    const dicts = ['hyph-es.hyb', 'hyph-en-us.hyb', 'hyph-en-gb.hyb', 'hyph-fr.hyb', 'hyph-it.hyb'];
    const isDev = process.argv.includes('--dev');
    const sourceDir = isDev 
      ? path.join(__dirname, 'public', 'dictionaries') 
      : path.join(__dirname, 'dist', 'libria', 'browser', 'dictionaries');
    
    // In some packaged structures, the public folder might end up somewhere else. Fallback:
    const fallbackSourceDir = path.join(process.resourcesPath || __dirname, 'dictionaries');

    let actualSource = null;
    if (fs.existsSync(sourceDir)) actualSource = sourceDir;
    else if (fs.existsSync(fallbackSourceDir)) actualSource = fallbackSourceDir;
    else actualSource = path.join(__dirname, 'public', 'dictionaries');

    if (fs.existsSync(actualSource)) {
      for (const dict of dicts) {
        const sourceFile = path.join(actualSource, dict);
        const destFile = path.join(hyphenDataPath, dict);
        if (fs.existsSync(sourceFile) && !fs.existsSync(destFile)) {
          fs.copyFileSync(sourceFile, destFile);
        }
      }
    }
  } catch (e) {
    // Fail silently
  }
}

app.whenReady().then(() => {
  setupHyphenation();
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

// ─── Language IPC (rebuild native menu) ────────────────────────────────────────

ipcMain.on('app:set-language', (_event, lang) => {
  buildMenu(lang);
});

// ─── Spell checker IPC ──────────────────────────────────────────────────────────

ipcMain.handle('spell:set-language', async (_event, lang) => {
  mainWindow?.webContents.session.setSpellCheckerLanguages([lang]);
});

ipcMain.handle('spell:get-dictionary', async () => {
  return loadCustomDictionary();
});

ipcMain.handle('spell:add-word', async (_event, word) => {
  const added = mainWindow?.webContents.session.addWordToSpellCheckerDictionary(word);
  if (added) {
    const words = loadCustomDictionary();
    if (!words.includes(word)) {
      words.push(word);
      saveCustomDictionary(words);
    }
  }
  return !!added;
});

ipcMain.handle('spell:remove-word', async (_event, word) => {
  const removed = mainWindow?.webContents.session.removeWordFromSpellCheckerDictionary(word);
  if (removed) {
    const words = loadCustomDictionary();
    const idx = words.indexOf(word);
    if (idx !== -1) {
      words.splice(idx, 1);
      saveCustomDictionary(words);
    }
  }
  return !!removed;
});

// ─── PDF ────────────────────────────────────────────────────────────────────────

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
        _save(c, ['overflow', 'height', 'flex', 'display']);
        c.style.overflow = 'visible';
        c.style.height   = 'auto';
        c.style.flex     = 'none';
        c.style.display  = 'block';
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
