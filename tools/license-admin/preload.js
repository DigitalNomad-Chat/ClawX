const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('licenseAdminAPI', {
  generate: (data) => ipcRenderer.invoke('license:generate', data),
  list: () => ipcRenderer.invoke('license:list'),
  copy: (text) => ipcRenderer.invoke('license:copy', text),
  export: () => ipcRenderer.invoke('license:export'),
});
