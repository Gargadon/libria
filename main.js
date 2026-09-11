const { app, BrowserWindow, dialog, ipcMain, Menu, MenuItem } = require('electron');
const path = require('path');
const fs = require('fs');

const MAX_DOCUMENT_BYTES = 100 * 1024 * 1024;
const ALLOWED_FILE_EXTENSIONS = new Set(['.libria', '.libria-theme', '.json']);

function assertTrustedRenderer(event) {
  if (!mainWindow || event.sender !== mainWindow.webContents) {
    throw new Error('Solicitud IPC no autorizada');
  }
}

function validateUserFilePath(filePath, operation) {
  if (typeof filePath !== 'string' || !path.isAbsolute(filePath) || filePath.includes('\0')) {
    throw new Error('Ruta de archivo inválida');
  }
  const resolved = path.resolve(filePath);
  if (!ALLOWED_FILE_EXTENSIONS.has(path.extname(resolved).toLowerCase())) {
    throw new Error(`Extensión no permitida para ${operation}`);
  }
  return resolved;
}

function writeFileAtomically(filePath, content) {
  const directory = path.dirname(filePath);
  const temporaryPath = path.join(directory, `.${path.basename(filePath)}.${process.pid}.tmp`);
  const fd = fs.openSync(temporaryPath, 'w', 0o600);
  try {
    fs.writeFileSync(fd, content, 'utf8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  try {
    fs.renameSync(temporaryPath, filePath);
  } catch (error) {
    try { fs.unlinkSync(temporaryPath); } catch (_) {}
    throw error;
  }
}

app.setName('Libria');
if (process.platform === 'linux') {
  const isX11 = process.argv.includes('--ozone-platform=x11') ||
                (app.commandLine && typeof app.commandLine.hasSwitch === 'function' && app.commandLine.hasSwitch('ozone-platform') && app.commandLine.getSwitchValue('ozone-platform') === 'x11');
  if (!isX11 && process.env.XDG_SESSION_TYPE === 'wayland') {
    process.env.UBUNTU_MENUPROXY = '0';
    process.env.KDE_NO_GLOBAL_MENU = '1';
  }
  if (typeof app.setDesktopName === 'function') {
    app.setDesktopName('libria.desktop');
  }
}

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, commandLine) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      const filePath = commandLine.find(a => a.endsWith('.libria'));
      if (filePath) mainWindow.webContents.send('file:open', filePath);
    } else {
      const filePath = commandLine.find(a => a.endsWith('.libria'));
      if (filePath) pendingFilePath = filePath;
    }
  });
}

const { pathToFileURL } = require('url');
const { spawnSync } = require('child_process');
let autoUpdater = null;
try { autoUpdater = require('electron-updater').autoUpdater; } catch (_) { /* system install without bundled node_modules */ }

function findGsPath() {
  const plat = process.platform;
  const isWin = plat === 'win32';
  const binary = isWin ? 'gswin64c.exe' : 'gs';

  // 1. Bundled with the app (electron-builder extraResources)
  const bundled = path.join(process.resourcesPath, 'gs', 'bin', binary);
  if (fs.existsSync(bundled)) return bundled;

  // 2. Dev/build directory
  const platDir = plat === 'win32' ? 'win' : plat === 'darwin' ? 'mac' : 'linux';
  const devPath = path.join(__dirname, 'build', 'bin', platDir, binary);
  if (fs.existsSync(devPath)) return devPath;

  // 3. System-installed (brew, apt, choco, built from source)
  const which = spawnSync(isWin ? 'where' : 'which', [binary]);
  if (which.status === 0) {
    const out = which.stdout.toString().trim().split('\n')[0];
    if (fs.existsSync(out)) return out;
  }

  // 4. Common Homebrew location on Apple Silicon
  if (plat === 'darwin') {
    const brewPaths = ['/opt/homebrew/bin/gs', '/usr/local/bin/gs'];
    for (const p of brewPaths) {
      if (fs.existsSync(p)) return p;
    }
  }

  return null;
}

let mainWindow;
let fileToOpen = null;
let pendingFilePath = null;
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
  return process.argv.find((a) => a.endsWith('.libria')) ?? null;
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
      sandbox: true,
    },
  });

  mainWindow.on('close', (e) => {
    if (mainWindow._forceClose) return;
    e.preventDefault();
    mainWindow.webContents.send('app:close-requested');
  });

  const isDev = process.argv.includes('--dev');
  if (isDev) {
    mainWindow.loadURL('http://localhost:4300');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'libria', 'browser', 'index.html'));
  }

  // --- Spell checker setup ---
  const session = mainWindow.webContents.session;
  session.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'local-fonts');
  });
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

  // Set pending file path immediately — before loadFile() — so Angular
  // can retrieve it via getPendingPath() on boot, avoiding the race
  // between did-finish-load and Angular's constructor.
  pendingFilePath = fileToOpen ?? getFileArgument();
  fileToOpen = null;
}

ipcMain.handle('file:getPendingPath', () => {
  const p = pendingFilePath;
  pendingFilePath = null;
  return p;
});

ipcMain.on('app:confirm-close', (_event) => {
  assertTrustedRenderer(_event);
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

function getDialogParent() {
  return mainWindow;
}

function showLinuxUpdateNotice(latestVersion) {
  mainWindow?.webContents.send('update:available', latestVersion);
}

function isNewerVersion(remote, current) {
  const r = remote.split('.').map(Number);
  const c = current.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const rv = r[i] || 0;
    const cv = c[i] || 0;
    if (rv > cv) return true;
    if (rv < cv) return false;
  }
  return false;
}

function checkVersionViaGitHub(manual = false) {
  const https = require('https');
  const TIMEOUT_MS = 10000;
  const options = {
    hostname: 'api.github.com',
    path: '/repos/Gargadon/libria/releases/latest',
    headers: { 'User-Agent': `Libria/${app.getVersion()}` },
  };
  let timedOut = false;
  const req = https.get(options, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      try {
        const release = JSON.parse(data);
        const latest = (release.tag_name || '').replace(/^v/, '');
        const hasUpdate = latest && isNewerVersion(latest, app.getVersion());
        if (hasUpdate) {
          if (manual) {
            showLinuxUpdateNotice(latest);
          } else {
            // Automatic check: notify renderer for non-blocking in-app toast
            mainWindow?.webContents.send('update:available', latest);
          }
        } else if (manual) {
          mainWindow?.webContents.send('update:check-result', 'uptodate');
        }
      } catch (_) {
        if (manual) {
          mainWindow?.webContents.send('update:check-result', 'error');
        }
      }
    });
  });
  req.setTimeout(TIMEOUT_MS, () => {
    timedOut = true;
    req.destroy();
    console.error('[updater] Request timed out');
    if (manual) {
      mainWindow?.webContents.send('update:check-result', 'timeout');
    }
  });
  req.on('error', (err) => {
    if (timedOut) return;
    console.error('[updater]', err.message);
    if (manual) {
      mainWindow?.webContents.send('update:check-result', 'error');
    }
  });
}

let manualUpdateCheck = false;

function setupAutoUpdater() {
  // Linux sin electron-updater (AUR, deb, pacman): check manual vía GitHub API
  if (!autoUpdater) {
    setTimeout(() => checkVersionViaGitHub(false), 5000);
    return;
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on('update-available', (info) => {
    manualUpdateCheck = false; // Reset flag
    if (process.platform === 'linux') {
      showLinuxUpdateNotice(info.version);
      return;
    }
    dialog.showMessageBox(getDialogParent(), {
      type: 'question',
      title: 'Nueva versión disponible',
      message: `Libria ${info.version} está disponible`,
      detail: `Versión actual: ${app.getVersion()}\n\n${info.releaseNotes || ''}`.trim(),
      buttons: ['Descargar e instalar', 'Más tarde'],
      defaultId: 0,
      cancelId: 1,
    }).then(({ response }) => {
      if (response === 0) autoUpdater.downloadUpdate();
    });
  });

  autoUpdater.on('update-not-available', () => {
    if (manualUpdateCheck) {
      manualUpdateCheck = false;
      dialog.showMessageBox(getDialogParent(), {
        type: 'info',
        title: 'Actualizaciones',
        message: 'Estás al día',
        detail: `Libria ${app.getVersion()} es la versión más reciente disponible.`,
        buttons: ['Aceptar'],
      });
    }
  });

  autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox(getDialogParent(), {
      type: 'info',
      title: 'Listo para instalar',
      message: 'La actualización se instalará al reiniciar Libria',
      buttons: ['Reiniciar ahora', 'Más tarde'],
      defaultId: 0,
      cancelId: 1,
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall();
      else autoUpdater.autoInstallOnAppQuit = true;
    });
  });

  autoUpdater.on('error', (err) => {
    console.error('[updater]', err.message);
    if (manualUpdateCheck) {
      manualUpdateCheck = false;
      dialog.showMessageBox(getDialogParent(), {
        type: 'error',
        title: 'Actualizaciones',
        message: 'Error al buscar actualizaciones',
        detail: err.message,
        buttons: ['Aceptar'],
      });
    }
  });

  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(err => {
      console.error('[updater] Error during automatic update check:', err.message);
    });
  }, 5000);
}

app.whenReady().then(() => {
  setupHyphenation();
  buildMenu();
  createWindow();
  if (app.isPackaged) setupAutoUpdater();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.handle('dialog:save', async (_event, defaultName, kind = 'document') => {
  assertTrustedRenderer(_event);
  const isTheme = kind === 'theme';
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName,
    filters: [{ name: isTheme ? 'Tema Libria' : 'Documento Libria', extensions: [isTheme ? 'libria-theme' : 'libria'] }],
  });
  return result.canceled ? null : result.filePath;
});

ipcMain.handle('dialog:open', async (_event, kind = 'document') => {
  assertTrustedRenderer(_event);
  const isTheme = kind === 'theme';
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: isTheme ? 'Tema Libria' : 'Documento Libria', extensions: isTheme ? ['libria-theme', 'json'] : ['libria', 'json'] }],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('fs:writeFile', async (_event, filePath, content) => {
  assertTrustedRenderer(_event);
  const safePath = validateUserFilePath(filePath, 'escritura');
  if (typeof content !== 'string' || Buffer.byteLength(content, 'utf8') > MAX_DOCUMENT_BYTES) {
    throw new Error('Contenido de archivo demasiado grande o inválido');
  }
  writeFileAtomically(safePath, content);
});

ipcMain.handle('fs:readFile', async (_event, filePath) => {
  assertTrustedRenderer(_event);
  const safePath = validateUserFilePath(filePath, 'lectura');
  const stat = fs.statSync(safePath);
  if (!stat.isFile() || stat.size > MAX_DOCUMENT_BYTES) {
    throw new Error('Archivo demasiado grande o inválido');
  }
  return fs.readFileSync(safePath, 'utf-8');
});

ipcMain.handle('fonts:getCss', async (_event) => {
  assertTrustedRenderer(_event);
  const fontsBase = process.argv.includes('--dev')
    ? path.join(__dirname, 'public')
    : path.join(__dirname, 'dist', 'libria', 'browser');
  const fontsCssPath = path.join(fontsBase, 'fonts.css');
  if (!fs.existsSync(fontsCssPath)) return '';
  const fontsDir = path.join(fontsBase, 'fonts');
  const fontsCss = fs.readFileSync(fontsCssPath, 'utf-8');
  // The preview source is a blob document. Make its bundled fonts
  // self-contained so font loading does not depend on file:// or on the
  // system-installed font set.
  return fontsCss.replace(/url\((['"]?)fonts\/([^)'"\\]+)\1\)/g, (match, quote, filename) => {
    const fontPath = path.join(fontsDir, filename);
    if (!fs.existsSync(fontPath)) return match;
    const mime = path.extname(filename).toLowerCase() === '.woff' ? 'font/woff' : 'font/woff2';
    return `url(data:${mime};base64,${fs.readFileSync(fontPath).toString('base64')})`;
  });
});

ipcMain.handle('dialog:error', async (_event, title, content) => {
  assertTrustedRenderer(_event);
  dialog.showErrorBox(String(title || 'Libria'), String(content || 'Ocurrió un error.'));
});

ipcMain.on('app:set-language', (_event, lang) => {
  assertTrustedRenderer(_event);
  buildMenu(lang);
});

ipcMain.on('app:check-for-updates', (_event) => {
  assertTrustedRenderer(_event);
  if (app.isPackaged && autoUpdater) {
    manualUpdateCheck = true;
    autoUpdater.checkForUpdates().catch(err => {
      console.error('[updater] Error during manual update check:', err.message);
    });
  } else {
    // Linux package manager fallback / dev manual check via GitHub API
    checkVersionViaGitHub(true);
  }
});

// ─── Spell checker IPC ──────────────────────────────────────────────────────────

ipcMain.handle('spell:set-language', async (_event, lang) => {
  assertTrustedRenderer(_event);
  if (typeof lang !== 'string' || !/^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(lang)) throw new Error('Idioma inválido');
  mainWindow?.webContents.session.setSpellCheckerLanguages([lang]);
});

ipcMain.handle('spell:get-dictionary', async (_event) => {
  assertTrustedRenderer(_event);
  return loadCustomDictionary();
});

ipcMain.handle('spell:add-word', async (_event, word) => {
  assertTrustedRenderer(_event);
  if (typeof word !== 'string' || word.length === 0 || word.length > 100) return false;
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
  assertTrustedRenderer(_event);
  if (typeof word !== 'string' || word.length === 0 || word.length > 100) return false;
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

// Compose the print HTML with Vivliostyle's paged-media engine. Unlike
// Chromium printToPDF, it implements recto/verso breaks, page selectors,
// margin boxes and target-counter() as defined by CSS Paged Media.
ipcMain.handle('pdf:printFromHTML', async (_event, html, options) => {
  assertTrustedRenderer(_event);
  if (typeof html !== 'string' || html.length > MAX_DOCUMENT_BYTES) throw new Error('HTML de impresión inválido');
  const isDev = process.argv.includes('--dev');
  const fontsBase = isDev
    ? path.join(__dirname, 'public')
    : path.join(__dirname, 'dist', 'libria', 'browser');
  const fontsCssPath = path.join(fontsBase, 'fonts.css');
  let htmlWithFonts = html;
  if (fs.existsSync(fontsCssPath)) {
    const fontsDir = path.join(fontsBase, 'fonts');
    const fontsCss = fs.readFileSync(fontsCssPath, 'utf-8')
      .replace(/url\((['"]?)fonts\/([^)'"\\]+)\1\)/g, (match, quote, filename) => {
        const fontPath = path.join(fontsDir, filename);
        if (!fs.existsSync(fontPath)) return match;
        const mime = path.extname(filename).toLowerCase() === '.woff' ? 'font/woff' : 'font/woff2';
        return `url(data:${mime};base64,${fs.readFileSync(fontPath).toString('base64')})`;
      });
    htmlWithFonts = html.replace('</head>', `<style>\n${fontsCss}\n</style>\n</head>`);
  }

  const tmpFile = path.join(app.getPath('userData'), `libria-print-${Date.now()}.html`);
  const tmpOutput = path.join(app.getPath('userData'), `libria-vivliostyle-${Date.now()}.pdf`);
  fs.writeFileSync(tmpFile, htmlWithFonts, 'utf-8');

  try {
    const { build } = await import('@vivliostyle/cli');
    const width = Number(options?.pageSize?.width);
    const height = Number(options?.pageSize?.height);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      throw new Error('Tamaño de página PDF inválido');
    }
    await build({
      input: tmpFile,
      output: tmpOutput,
      size: `${width}in,${height}in`,
      logLevel: 'silent',
      renderMode: 'local',
    });
    let pdf = new Uint8Array(fs.readFileSync(tmpOutput));

    // Ghostscript PDF/X-3 post-processing (CMYK conversion)
    // Ghostscript is AGPL-3.0 — see resources/licenses/ in the packaged app.
    if (options.pdfx) {
      const gs = findGsPath();
      if (!gs) {
        throw new Error('Ghostscript no encontrado. Es necesario para exportar PDF profesional. Instálalo con: sudo pacman -S ghostscript');
      }
      const tmpPdf = path.join(app.getPath('userData'), `libria-gs-in-${Date.now()}.pdf`);
      const outPdf = path.join(app.getPath('userData'), `libria-gs-out-${Date.now()}.pdf`);
      fs.writeFileSync(tmpPdf, Buffer.from(pdf));

      const gsArgs = [
        '-dPDFX',
        '-dNOPAUSE',
        '-dBATCH',
        '-sDEVICE=pdfwrite',
        `-sOutputFile=${outPdf}`,
        '-dCompatibilityLevel=1.7',
        '-sColorConversionStrategy=CMYK',
        '-sColorConversionStrategyForImages=CMYK',
        '-dProcessColorModel=/DeviceCMYK',
        '-dUseCIEColor',
        '-dRenderIntent=3',
        tmpPdf,
      ];

      const r = spawnSync(gs, gsArgs, { timeout: 60000 });
      if (r.status !== 0) {
        console.error('[printFromHTML] Ghostscript failed:', r.stderr.toString());
        return pdf;
      }
      pdf = new Uint8Array(fs.readFileSync(outPdf));
      try { fs.unlinkSync(tmpPdf); } catch (_) {}
      try { fs.unlinkSync(outPdf); } catch (_) {}
    }

    return pdf;
  } catch (err) {
    console.error('[Vivliostyle] Error:', err);
    throw err;
  } finally {
    try { fs.unlinkSync(tmpFile); } catch (_) {}
    try { fs.unlinkSync(tmpOutput); } catch (_) {}
  }
});

ipcMain.handle('pdf:printToPDF', async (_event, options) => {
  assertTrustedRenderer(_event);
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
      // Also remove container-type:size which blocks CSS page fragmentation.
      pg.querySelectorAll('.print__page').forEach(page => {
        _save(page, ['paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight', 'containerType']);
        page.style.paddingTop    = '0';
        page.style.paddingBottom = '0';
        page.style.paddingLeft   = '0';
        page.style.paddingRight  = '0';
        page.style.containerType = 'normal';
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
