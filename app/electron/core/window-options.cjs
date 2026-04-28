const { preloadPath } = require('./paths.cjs')

const mainWindowOptions = {
  width: 1320,
  height: 760,
  minWidth: 960,
  minHeight: 600,
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
