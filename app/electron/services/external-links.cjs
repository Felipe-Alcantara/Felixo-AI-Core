const { shell } = require('electron')

function denyExternalWindowOpen(details) {
  shell.openExternal(details.url)
  return { action: 'deny' }
}

module.exports = {
  denyExternalWindowOpen,
}
