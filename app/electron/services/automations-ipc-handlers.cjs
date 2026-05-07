'use strict'

const { ipcMain } = require('electron')
const {
  createAutomationsRepository,
} = require('./storage/automations-repository.cjs')

function registerAutomationsIpcHandlers(options = {}) {
  const repository = createAutomationsRepository(options.database)

  ipcMain.handle('automations:list', () => {
    try {
      return { ok: true, automations: repository.list() }
    } catch (error) {
      return toErrorResult(error, 'Nao foi possivel carregar automations.')
    }
  })

  ipcMain.handle('automations:save', (_event, automation) => {
    try {
      return { ok: true, automation: repository.save(automation) }
    } catch (error) {
      return toErrorResult(error, 'Nao foi possivel salvar automation.')
    }
  })

  ipcMain.handle('automations:delete', (_event, automationId) => {
    try {
      return { ok: true, deleted: repository.delete(automationId) }
    } catch (error) {
      return toErrorResult(error, 'Nao foi possivel excluir automation.')
    }
  })
}

function toErrorResult(error, fallbackMessage) {
  return {
    ok: false,
    message: error instanceof Error ? error.message : fallbackMessage,
  }
}

module.exports = {
  registerAutomationsIpcHandlers,
}
