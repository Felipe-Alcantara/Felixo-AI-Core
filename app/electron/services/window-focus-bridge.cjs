const WINDOW_FOCUS_CHANNEL = 'window:focus-state'

/**
 * Encaminha o foco real da BrowserWindow para o renderer.
 *
 * Em algumas combinações de Linux/window manager, perder o foco da janela
 * Electron não produz `window.blur` nem `document.focusout` no DOM. O processo
 * principal, porém, recebe os eventos nativos de forma confiável.
 *
 * @param {import('electron').BrowserWindow} browserWindow
 * @returns {() => void} remove os listeners registrados
 */
function registerWindowFocusBridge(browserWindow) {
  const notificar = (focado) => {
    if (browserWindow.isDestroyed?.()) {
      return
    }

    browserWindow.webContents.send(WINDOW_FOCUS_CHANNEL, focado)
  }

  const aoFocar = () => notificar(true)
  const aoDesfocar = () => notificar(false)

  browserWindow.on('focus', aoFocar)
  browserWindow.on('blur', aoDesfocar)

  return () => {
    browserWindow.off('focus', aoFocar)
    browserWindow.off('blur', aoDesfocar)
  }
}

module.exports = {
  WINDOW_FOCUS_CHANNEL,
  registerWindowFocusBridge,
}
