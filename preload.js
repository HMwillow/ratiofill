const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  pickVideo: () => ipcRenderer.invoke('pick-video'),
  pickImage: () => ipcRenderer.invoke('pick-image'),
  pickOutput: (name) => ipcRenderer.invoke('pick-output', name),
  probe: (p) => ipcRenderer.invoke('probe', p),
  export: (job) => ipcRenderer.invoke('export', job),
  cancelExport: () => ipcRenderer.invoke('cancel-export'),
  imageFromUrl: (url) => ipcRenderer.invoke('fetch-image', url),
  showInFolder: (p) => ipcRenderer.invoke('show-in-folder', p),
  onOpenVideo: (cb) => ipcRenderer.on('open-video', (_e, p) => cb(p)),
  onDevImage: (cb) => ipcRenderer.on('dev-image', (_e, p) => cb(p)),
  onProgress: (cb) => ipcRenderer.on('export-progress', (_e, d) => cb(d)),
  toFileUrl: (p) => {
    let s = String(p).replace(/\\/g, '/');
    if (!s.startsWith('/')) s = '/' + s;
    return 'file://' + encodeURI(s).replace(/[?#]/g, encodeURIComponent);
  },
  pathForFile: (f) => webUtils.getPathForFile(f),
});
