const { contextBridge, webUtils } = require('electron')

contextBridge.exposeInMainWorld('felixo', {
  platform: process.platform,
  versions: {
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    node: process.versions.node,
  },
  getFilePath: (file) => webUtils?.getPathForFile(file) ?? '',
})
