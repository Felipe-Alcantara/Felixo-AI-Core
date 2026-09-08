const { shell } = require('electron')

function denyExternalWindowOpen(details) {
  void openExternalUrl(details.url)
  return { action: 'deny' }
}

/** Uses the same Electron system-browser path as links opened by the window. */
function openExternalUrl(url, electronShell = shell) {
  return electronShell.openExternal(url)
}

module.exports = {
  denyExternalWindowOpen,
  openExternalUrl,
}
