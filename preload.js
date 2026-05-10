const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  saveDialog: (defaultName) => ipcRenderer.invoke('dialog:save', defaultName),
  openDialog: () => ipcRenderer.invoke('dialog:open'),
  writeFile: (filePath, content) => ipcRenderer.invoke('fs:writeFile', filePath, content),
  readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),
  printToPDF: (options) => ipcRenderer.invoke('pdf:printToPDF', options),
});
