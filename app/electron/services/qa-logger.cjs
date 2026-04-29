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
  const webContents = mainWindow?.webContents

  if (!webContents || webContents.isDestroyed()) {
    return
  }

  webContents.send(channel, payload)
}

module.exports = {
  createQaLogStore,
  logQaEvent,
  registerQaLoggerIpcHandlers,
}
