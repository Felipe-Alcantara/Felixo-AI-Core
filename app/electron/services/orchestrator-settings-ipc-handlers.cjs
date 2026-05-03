const { ipcMain } = require('electron')
const {
  createOrchestratorSettingsStore,
} = require('./orchestrator-settings-store.cjs')

function registerOrchestratorSettingsIpcHandlers(appPaths, options = {}) {
  const store = createOrchestratorSettingsStore({
    configDir: appPaths.config,
    database: options.database,
  })

  ipcMain.handle('settings:load-orchestrator', async () => {
    try {
      return {
        ok: true,
        settings: await store.load(),
      }
    } catch (error) {
      return {
        ok: false,
        message: getErrorMessage(
          error,
          'Falha ao carregar configuracoes do orquestrador.',
        ),
      }
    }
  })

  ipcMain.handle('settings:save-orchestrator', async (_event, settings) => {
    try {
      await store.save(settings)
      return { ok: true }
    } catch (error) {
      return {
        ok: false,
        message: getErrorMessage(
          error,
          'Falha ao salvar configuracoes do orquestrador.',
        ),
      }
    }
  })
}

function getErrorMessage(error, fallback) {
  return error instanceof Error ? error.message : fallback
}

module.exports = {
  registerOrchestratorSettingsIpcHandlers,
}
