const { ipcMain } = require('electron')

const DEFAULT_MAX_ENTRIES = 400
const qaLogStore = createQaLogStore(DEFAULT_MAX_ENTRIES)
let getMainWindow = null

function registerQaLoggerIpcHandlers(getWindow) {
  getMainWindow = getWindow

  ipcMain.handle('qa-logger:get', () => qaLogStore.getEntries())
  ipcMain.handle('qa-logger:clear', () => {
    qaLogStore.clear()
    sendQaLoggerEvent('qa-logger:cleared', null)
    return { ok: true }
  })
  // O renderer nunca tinha como escrever no log — só ler (getEntries/onEntry).
  // Diagnósticos que só fazem sentido observados no processo do canvas (ex.:
  // clamp de layout, medido de verdade contra o DOM) precisavam desse
  // caminho. `entry` chega do renderer: nunca confiar cegamente em `level`
  // (normalizeLevel já valida) nem deixar `scope`/`message` virarem algo
  // maior que uma string.
  ipcMain.handle('qa-logger:log', (_event, entry) => logQaEvent(entry ?? {}))
}

function logQaEvent(entry) {
  const logEntry = qaLogStore.append(entry)
  sendQaLoggerEvent('qa-logger:entry', logEntry)
  return logEntry
}

function createQaLogStore(maxEntries = DEFAULT_MAX_ENTRIES) {
  let entries = []
  let nextId = 1

  return {
    append(entry) {
      const logEntry = {
        id: nextId,
        createdAt: new Date().toISOString(),
        level: normalizeLevel(entry.level),
        scope: String(entry.scope ?? 'backend'),
        sessionId: entry.sessionId,
        message: String(entry.message ?? ''),
        details: entry.details ?? null,
      }

      nextId += 1
      entries = [...entries, logEntry].slice(-maxEntries)

      return logEntry
    },
    clear() {
      entries = []
    },
    getEntries() {
      return entries
    },
  }
}

function normalizeLevel(level) {
  if (level === 'debug' || level === 'info' || level === 'warn' || level === 'error') {
    return level
  }

  return 'info'
}

function sendQaLoggerEvent(channel, payload) {
  const mainWindow =
    typeof getMainWindow === 'function' ? getMainWindow() : getMainWindow

  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }

  const webContents = mainWindow.webContents

  if (!webContents || webContents.isDestroyed()) {
    return
  }

  webContents.send(channel, payload)
}

module.exports = {
  createQaLogStore,
  logQaEvent,
  registerQaLoggerIpcHandlers,
  __setMainWindowGetterForTests(getWindow) {
    getMainWindow = getWindow
  },
  __sendQaLoggerEventForTests: sendQaLoggerEvent,
}
