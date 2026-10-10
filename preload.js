const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  driveStatus: () => ipcRenderer.invoke('drive:status'),
  driveConnect: () => ipcRenderer.invoke('drive:connect'),
  driveDisconnect: () => ipcRenderer.invoke('drive:disconnect'),
  driveListFiles: (cursor) => ipcRenderer.invoke('drive:listFiles', cursor),
  driveReadFile: (id, forceRemote) => ipcRenderer.invoke('drive:readFile', id, forceRemote),
  driveFileMetadata: (id) => ipcRenderer.invoke('drive:fileMetadata', id),
  driveWriteFile: (id, version, content, account) => ipcRenderer.invoke('drive:writeFile', id, version, content, account),
  driveCreateFile: (name, content) => ipcRenderer.invoke('drive:createFile', name, content),
  driveCacheFile: (link, content) => ipcRenderer.invoke('drive:cacheFile', link, content),
  driveCachedLink: (path) => ipcRenderer.invoke('drive:cachedLink', path),
  driveCancel: () => ipcRenderer.invoke('drive:cancel'),
  saveDialog: (defaultName, kind) => ipcRenderer.invoke('dialog:save', defaultName, kind),
  openDialog: (kind) => ipcRenderer.invoke('dialog:open', kind),
  writeFile: (filePath, content) => ipcRenderer.invoke('fs:writeFile', filePath, content),
  readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),
  getFontsCss: () => ipcRenderer.invoke('fonts:getCss'),
  showError: (title, content) => ipcRenderer.invoke('dialog:error', title, content),
  printToPDF: (options) => ipcRenderer.invoke('pdf:printToPDF', options),
  printFromHTML: (html, options) => ipcRenderer.invoke('pdf:printFromHTML', html, options),
  onMenuAction: (callback) => ipcRenderer.on('menu:action', (_event, action) => callback(action)),
  onCloseRequested: (callback) => ipcRenderer.on('app:close-requested', () => callback()),
  confirmClose: () => ipcRenderer.send('app:confirm-close'),
  onFileOpen: (callback) => ipcRenderer.on('file:open', (_event, filePath) => callback(filePath)),
  getPendingPath: () => ipcRenderer.invoke('file:getPendingPath'),
  onUpdateAvailable: (callback) => ipcRenderer.on('update:available', (_event, update) => callback(update)),
  onUpdateCheckResult: (callback) => ipcRenderer.on('update:check-result', (_event, result) => callback(result)),

  setLanguage: (lang) => ipcRenderer.send('app:set-language', lang),

  platform: process.platform,
  arch: process.arch,
  useIntegratedMenu: process.platform === 'linux' && process.env.XDG_SESSION_TYPE === 'wayland' && !(process.argv && process.argv.includes('--ozone-platform=x11')),

  // Spell checker
  setSpellCheckerLanguage: (lang) => ipcRenderer.invoke('spell:set-language', lang),
  getCustomDictionary: () => ipcRenderer.invoke('spell:get-dictionary'),
  addWordToDictionary: (word) => ipcRenderer.invoke('spell:add-word', word),
  removeWordFromDictionary: (word) => ipcRenderer.invoke('spell:remove-word', word),

  // Auto-updater
  checkForUpdates: () => ipcRenderer.send('app:check-for-updates'),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
});
