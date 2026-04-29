const { contextBridge, ipcRenderer, webUtils } = require('electron')

contextBridge.exposeInMainWorld('felixo', {
  platform: process.platform,
  versions: {
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    node: process.versions.node,
  },
  getFilePath: (file) => webUtils?.getPathForFile(file) ?? '',
  cli: {
    send: (params) => ipcRenderer.invoke('cli:send', params),
    stop: (params) => ipcRenderer.invoke('cli:stop', params),
    onStream: (callback) => {
      const handler = (_event, data) => callback(data)
      ipcRenderer.on('cli:stream', handler)
      return () => ipcRenderer.removeListener('cli:stream', handler)
    },
  },
})
