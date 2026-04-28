const { preloadPath } = require('./paths.cjs')

const mainWindowOptions = {
  width: 980,
  height: 680,
  minWidth: 720,
  minHeight: 540,
  backgroundColor: '#09090b',
  title: 'Felixo AI Core',
  webPreferences: {
    preload: preloadPath,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
  },
}

module.exports = {
  mainWindowOptions,
}
