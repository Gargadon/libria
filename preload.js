const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  saveDialog: (defaultName) => ipcRenderer.invoke('dialog:save', defaultName),
  openDialog: () => ipcRenderer.invoke('dialog:open'),
  writeFile: (filePath, content) => ipcRenderer.invoke('fs:writeFile', filePath, content),
  readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),
  printToPDF: (options) => ipcRenderer.invoke('pdf:printToPDF', options),
  onMenuAction: (callback) => ipcRenderer.on('menu:action', (_event, action) => callback(action)),
  onCloseRequested: (callback) => ipcRenderer.on('app:close-requested', () => callback()),
  confirmClose: () => ipcRenderer.send('app:confirm-close'),
});
