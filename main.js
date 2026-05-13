const { app, BrowserWindow, dialog, ipcMain, Menu, MenuItem } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

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

// Inserts blank pages before .ch--recto chapters that land on a verso (even)
// page so they start on a recto (odd) page.
//
// Root cause of the old offsetTop approach: break-before:page is IGNORED by
// Chromium in screen (non-print) mode, so chapters flowed without page breaks
// and offsetTop didn't represent actual print page positions.
//
// Fix: use a temporary multi-column layout where break-before:column IS
// respected in screen mode, identical to how the preview's fixRectoChapters()
// works. Measure offsetLeft / columnWidth = accurate page (column) index, then
// restore the normal layout and insert full-height blank divs before chapters
// that land on verso pages.
async function applyForceRecto(win, options) {
  const rectoCount = await win.webContents.executeJavaScript(
    `document.querySelectorAll('.ch--recto').length`
  );
  console.log('[forceRecto] .ch--recto elements found:', rectoCount);
  if (!rectoCount) return;

  const cfg = await win.webContents.executeJavaScript(`
    (function() {
      try { return JSON.parse(document.getElementById('libria-cfg').textContent); }
      catch(e) { return {mi: 20, mo: 20}; }
    })()
  `);
  console.log('[forceRecto] config:', cfg);

  const pageW   = options.pageSize.width;
  const pageH   = options.pageSize.height;
  const mTop    = (options.margins && options.margins.top)    || 0;
  const mBottom = (options.margins && options.margins.bottom) || 0;
  const mInner  = (cfg.mi || 20) / 25.4;
  const mOuter  = (cfg.mo || 20) / 25.4;
  const contentW = (pageW - mInner - mOuter) * 96;
  const contentH = (pageH - mTop - mBottom) * 96;
  console.log('[forceRecto] pageW=%s pageH=%s contentW=%s contentH=%s', pageW, pageH, contentW.toFixed(1), contentH.toFixed(1));

  // Resize body to print content width for accurate reflow
  await win.webContents.executeJavaScript(`
    document.documentElement.style.width    = '${contentW}px';
    document.documentElement.style.maxWidth = '${contentW}px';
    document.body.style.width    = '${contentW}px';
    document.body.style.maxWidth = '${contentW}px';
    document.body.style.margin   = '0';
    document.body.style.padding  = '0';
    void document.body.offsetHeight;
  `);
  await new Promise(r => setTimeout(r, 200));

  // Phase 1: measure chapter page positions using a temporary multi-column layout.
  // break-before:column IS respected in screen mode, so each chapter correctly
  // starts at a new column (= page). This mirrors fixRectoChapters() in the preview.
  const report = await win.webContents.executeJavaScript(`
    (function() {
      const cW = ${contentW};
      const cH = ${contentH};

      // Wrap all body content in a multi-column flow container
      const flow = document.createElement('div');
      flow.style.cssText =
        'width:' + cW + 'px;' +
        'height:' + cH + 'px;' +
        'column-fill:auto;' +
        'column-width:' + cW + 'px;' +
        'column-gap:0;' +
        'overflow:visible;';
      const bodyChildren = Array.from(document.body.childNodes);
      bodyChildren.forEach(function(c) { flow.appendChild(c); });
      document.body.appendChild(flow);

      // Switch chapters to column breaks (respected in screen mode)
      const allCh = Array.from(document.querySelectorAll('.ch'));
      allCh.forEach(function(ch, i) {
        ch.dataset.frBreak = ch.style.breakBefore || '';
        if (i > 0) ch.style.setProperty('break-before', 'column');
      });
      // Also switch in-chapter manual page breaks
      Array.from(document.querySelectorAll('.kp-page-break')).forEach(function(el) {
        el.dataset.frBreak = el.style.breakAfter || '';
        el.style.setProperty('break-after', 'column');
      });

      void document.body.offsetHeight; // flush layout

      // Read column (page) positions for recto chapters
      const rectoChapters = Array.from(document.querySelectorAll('.ch--recto'));
      let added = 0;
      const log = [];
      rectoChapters.forEach(function(ch) {
        const rawCol = Math.round((ch.offsetLeft - flow.offsetLeft) / cW);
        const colIdx = rawCol + added; // adjust for blanks already decided
        const needsBlank = colIdx % 2 !== 0; // odd 0-based index = even page = verso
        log.push({ rawCol, colIdx, needsBlank });
        if (needsBlank) added++;
      });

      // Restore original break values and remove flow wrapper
      allCh.forEach(function(ch) {
        const orig = ch.dataset.frBreak;
        if (orig) ch.style.setProperty('break-before', orig);
        else ch.style.removeProperty('break-before');
        delete ch.dataset.frBreak;
      });
      Array.from(document.querySelectorAll('.kp-page-break')).forEach(function(el) {
        const orig = el.dataset.frBreak;
        if (orig) el.style.setProperty('break-after', orig);
        else el.style.removeProperty('break-after');
        delete el.dataset.frBreak;
      });
      const flowChildren = Array.from(flow.childNodes);
      flowChildren.forEach(function(c) { document.body.appendChild(c); });
      flow.remove();

      void document.body.offsetHeight; // flush layout

      return log;
    })()
  `);
  console.log('[forceRecto] chapter positions:', JSON.stringify(report));

  // Phase 2: insert full-height blank pages before chapters that need to move to recto
  const needsAny = report.some(function(r) { return r.needsBlank; });
  if (needsAny) {
    await win.webContents.executeJavaScript(`
      (function() {
        const cH = ${contentH};
        const log = ${JSON.stringify(report)};
        const rectoChapters = Array.from(document.querySelectorAll('.ch--recto'));
        rectoChapters.forEach(function(ch, i) {
          if (!log[i] || !log[i].needsBlank) return;
          // Full-page-height blank: break-before:page starts a new blank page,
          // height fills it, break-after:page lands the chapter on the next page.
          const blank = document.createElement('div');
          blank.style.cssText =
            'display:block;' +
            'break-before:page;page-break-before:always;' +
            'height:' + cH + 'px;' +
            'break-after:page;page-break-after:always;';
          ch.parentElement.insertBefore(blank, ch);
          // Override chapter's CSS break-before:page to prevent a triple break.
          ch.style.setProperty('break-before', 'auto');
          ch.style.setProperty('page-break-before', 'auto');
        });
      })()
    `);
  }
}

// Clean HTML-based PDF export: render content in a dedicated hidden window
// to avoid fighting with the main UI's CSS/DOM complexity.
ipcMain.handle('pdf:printFromHTML', async (_event, html, options) => {
  // Inject local WOFF2 fonts from public/fonts.css (works offline, no CDN needed).
  const isDev = process.argv.includes('--dev');
  const fontsBase = isDev
    ? path.join(__dirname, 'public')
    : path.join(__dirname, 'dist', 'libria', 'browser');
  const fontsCssPath = path.join(fontsBase, 'fonts.css');
  let htmlWithFonts = html;
  if (fs.existsSync(fontsCssPath)) {
    const fontsDir = pathToFileURL(path.join(fontsBase, 'fonts')).href + '/';
    const fontsCss = fs.readFileSync(fontsCssPath, 'utf-8')
      .replace(/url\(fonts\//g, `url(${fontsDir}`);
    htmlWithFonts = html.replace('</head>', `<style>\n${fontsCss}\n</style>\n</head>`);
  }

  const tmpFile = path.join(app.getPath('userData'), `libria-print-${Date.now()}.html`);
  fs.writeFileSync(tmpFile, htmlWithFonts, 'utf-8');

  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  try {
    await win.loadFile(tmpFile);
    // Wait for fonts and layout to settle, 3 s max
    await win.webContents.executeJavaScript(
      'new Promise(r => { document.fonts.ready.then(r).catch(r); setTimeout(r, 3000); })'
    );
    await applyForceRecto(win, options);
    const pdf = await win.webContents.printToPDF(options);
    return pdf;
  } catch (err) {
    console.error('[printFromHTML] Error:', err);
    throw err;
  } finally {
    win.destroy();
    try { fs.unlinkSync(tmpFile); } catch (_) {}
  }
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
