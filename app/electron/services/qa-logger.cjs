const { ipcMain } = require('electron')
const { buildProblemReport, writeProblemReportFile } = require('./qa-report-builder.cjs')

const DEFAULT_MAX_ENTRIES = 400
const qaLogStore = createQaLogStore(DEFAULT_MAX_ENTRIES)
let getMainWindow = null
let diskStore = null

/**
 * Liga a persistência em disco (`qa-log-disk-store.cjs`) e hidrata o buffer
 * em memória com o que sobreviveu ao restart anterior — sem isso, reiniciar
 * o app (o contorno que o Felipe usa quando algo trava) continuava apagando
 * o histórico do painel, mesmo com o arquivo em disco intacto.
 *
 * Chamado uma vez, depois que `appPaths` existe (main.cjs, dentro de
 * `whenReady`) — por isso é um passo separado de `createQaLogStore`, que
 * roda no `require` do módulo, antes de qualquer caminho estar disponível.
 */
async function initQaDiskStore(store) {
  diskStore = store
  const hydrated = await store.loadRecent(DEFAULT_MAX_ENTRIES)
  qaLogStore.hydrate(hydrated)
  // Arquivo velho demais ou orçamento de tamanho estourado: mesma
  // oportunidade (boot) que o terminal-log-store usa pra limpar o que sobrou
  // da execução anterior — só que aqui o objetivo é o oposto, manter o
  // histórico, então só o excesso é removido, nunca o arquivo do dia atual.
  await store.prune().catch(() => {})
}

/**
 * @param {() => (import('electron').BrowserWindow | null)} getWindow
 * @param {{
 *   getReportContext?: () => Promise<{
 *     appVersion?: string, platformName?: string, arch?: string,
 *     cliDetectionResults?: unknown[], reportsDirectory?: string,
 *   }>,
 * }} [options]
 */
function registerQaLoggerIpcHandlers(getWindow, options = {}) {
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
  // Botão "Reportar problema" (task "Observabilidade", item 4). Contexto
  // injetado por quem registra (main.cjs) em vez de importado direto aqui:
  // versão do app, plataforma e detecção de CLI são concerns do processo
  // principal, não do QA Logger — só as últimas entradas vêm daqui.
  ipcMain.handle('qa-logger:build-report', async () => {
    const context = typeof options.getReportContext === 'function' ? await options.getReportContext() : {}
    const report = buildProblemReport({
      appVersion: context.appVersion,
      platformName: context.platformName,
      arch: context.arch,
      qaEntries: qaLogStore.getEntries(),
      cliDetectionResults: context.cliDetectionResults ?? [],
    })
    const filePath = writeProblemReportFile(report, { directory: context.reportsDirectory })
    return { ok: true, filePath, report }
  })
}

function logQaEvent(entry) {
  const logEntry = qaLogStore.append(entry)
  // Melhor esforço, nunca bloqueia quem chamou: um handler de erro (main,
  // IPC, render-process-gone) não pode ficar preso esperando I/O de disco
  // pra terminar de tratar o próprio erro.
  diskStore?.append(logEntry).catch(() => {})
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
    /** Repõe o buffer com entradas já existentes (vindas do disco) — id/createdAt são preservados, não regravados. */
    hydrate(existingEntries) {
      if (!Array.isArray(existingEntries) || existingEntries.length === 0) return
      entries = existingEntries.slice(-maxEntries)
      const maxId = entries.reduce((max, item) => (Number.isInteger(item.id) && item.id > max ? item.id : max), 0)
      nextId = maxId + 1
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
  initQaDiskStore,
  logQaEvent,
  registerQaLoggerIpcHandlers,
  __setMainWindowGetterForTests(getWindow) {
    getMainWindow = getWindow
  },
  __setDiskStoreForTests(store) {
    diskStore = store
  },
  __sendQaLoggerEventForTests: sendQaLoggerEvent,
}
