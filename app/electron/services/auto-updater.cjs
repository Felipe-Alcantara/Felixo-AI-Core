const { app, ipcMain } = require('electron')
const { autoUpdater } = require('electron-updater')

const CHECK_INTERVAL_MS = 10 * 60 * 1000
const STARTUP_CHECK_DELAY_MS = 10 * 1000

function registerAutoUpdateHandlers(getMainWindow, options = {}) {
  let checkTimer = null
  let status = createStatus(
    app.isPackaged ? 'idle' : 'disabled',
    app.isPackaged
      ? 'Atualizador pronto.'
      : 'Auto-update fica ativo apenas no app empacotado.',
  )

  function setStatus(nextStatus) {
    status = {
      ...status,
      ...nextStatus,
      updatedAt: new Date().toISOString(),
    }

    sendStatus(getMainWindow, status)
    return status
  }

  async function checkForUpdates(reason = 'manual') {
    if (!app.isPackaged) {
      const nextStatus = setStatus({
        state: 'disabled',
        reason,
        message: 'Auto-update fica ativo apenas no app empacotado.',
      })

      return { ok: false, message: nextStatus.message, status: nextStatus }
    }

    try {
      const result = await autoUpdater.checkForUpdates()

      return {
        ok: true,
        status,
        updateInfo: result?.updateInfo ?? null,
      }
    } catch (error) {
      const nextStatus = setStatus({
        state: 'error',
        reason,
        message: getErrorMessage(error, 'Nao foi possivel verificar atualizacoes.'),
      })

      return { ok: false, message: nextStatus.message, status: nextStatus }
    }
  }

  ipcMain.handle('updates:get-status', () => ({ ok: true, status }))
  ipcMain.handle('updates:check', () => checkForUpdates('manual'))
  ipcMain.handle('updates:install', () => {
    if (status.state !== 'downloaded') {
      return {
        ok: false,
        message: 'Nenhuma atualizacao baixada para instalar.',
        status,
      }
    }

    autoUpdater.quitAndInstall(false, true)
    return { ok: true, status }
  })

  if (!app.isPackaged || options.disabled || process.env.FELIXO_DISABLE_AUTO_UPDATE === '1') {
    return {
      checkForUpdates,
      getStatus: () => status,
      stop: () => {},
    }
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowPrerelease = process.env.FELIXO_UPDATE_PRERELEASE === '1'

  if (process.env.FELIXO_UPDATE_CHANNEL) {
    autoUpdater.channel = process.env.FELIXO_UPDATE_CHANNEL
  }

  autoUpdater.on('checking-for-update', () => {
    setStatus({
      state: 'checking',
      message: 'Verificando atualizacoes.',
    })
  })

  autoUpdater.on('update-available', (info) => {
    setStatus({
      state: 'available',
      message: `Atualizacao ${info.version} encontrada. Baixando...`,
      version: info.version,
    })
  })

  autoUpdater.on('update-not-available', (info) => {
    setStatus({
      state: 'idle',
      message: 'Aplicativo atualizado.',
      version: info.version,
    })
  })

  autoUpdater.on('download-progress', (progress) => {
    setStatus({
      state: 'downloading',
      message: `Baixando atualizacao (${Math.round(progress.percent)}%).`,
      progress: progress.percent,
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    setStatus({
      state: 'downloaded',
      message: `Atualizacao ${info.version} baixada. Ela sera instalada ao fechar o app.`,
      version: info.version,
      progress: 100,
    })
  })

  autoUpdater.on('error', (error) => {
    setStatus({
      state: 'error',
      message: getErrorMessage(error, 'Falha no auto-update.'),
    })
  })

  const startupTimer = setTimeout(() => {
    checkForUpdates('startup')
  }, STARTUP_CHECK_DELAY_MS)

  checkTimer = setInterval(() => {
    checkForUpdates('interval')
  }, CHECK_INTERVAL_MS)

  app.once('before-quit', () => {
    clearTimeout(startupTimer)
    clearInterval(checkTimer)
  })

  return {
    checkForUpdates,
    getStatus: () => status,
    stop: () => {
      clearTimeout(startupTimer)
      clearInterval(checkTimer)
    },
  }
}

function sendStatus(getMainWindow, status) {
  const mainWindow =
    typeof getMainWindow === 'function' ? getMainWindow() : getMainWindow

  if (!mainWindow?.webContents || mainWindow.webContents.isDestroyed()) {
    return
  }

  mainWindow.webContents.send('updates:status', status)
}

function createStatus(state, message) {
  return {
    state,
    message,
    updatedAt: new Date().toISOString(),
  }
}

function getErrorMessage(error, fallback) {
  return error?.message ? String(error.message) : fallback
}

module.exports = {
  registerAutoUpdateHandlers,
}
