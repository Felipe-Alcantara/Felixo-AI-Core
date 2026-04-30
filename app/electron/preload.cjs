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
    resetThread: (params) => ipcRenderer.invoke('cli:reset-thread', params),
    onStream: (callback) => {
      const handler = (_event, data) => callback(data)
      ipcRenderer.on('cli:stream', handler)
      return () => ipcRenderer.removeListener('cli:stream', handler)
    },
    onRawOutput: (callback) => {
      const handler = (_event, data) => callback(data)
      ipcRenderer.on('cli:terminal-output', handler)
      return () => ipcRenderer.removeListener('cli:terminal-output', handler)
    },
    onTerminalOutput: (callback) => {
      const handler = (_event, data) => callback(data)
      ipcRenderer.on('cli:terminal-output', handler)
      return () => ipcRenderer.removeListener('cli:terminal-output', handler)
    },
  },
  projects: {
    pickFolder: () => ipcRenderer.invoke('projects:pick-folder'),
    detectRepos: (folderPath) => ipcRenderer.invoke('projects:detect-repos', folderPath),
  },
  git: {
    getSummary: (params) => ipcRenderer.invoke('git:get-summary', params),
  },
  qaLogger: {
    getEntries: () => ipcRenderer.invoke('qa-logger:get'),
    clear: () => ipcRenderer.invoke('qa-logger:clear'),
    onEntry: (callback) => {
      const handler = (_event, data) => callback(data)
      ipcRenderer.on('qa-logger:entry', handler)
      return () => ipcRenderer.removeListener('qa-logger:entry', handler)
    },
    onCleared: (callback) => {
      const handler = () => callback()
      ipcRenderer.on('qa-logger:cleared', handler)
      return () => ipcRenderer.removeListener('qa-logger:cleared', handler)
    },
  },
})
