'use strict'

const { ipcMain } = require('electron')
const {
  createModelsRepository,
} = require('./storage/models-repository.cjs')

function registerModelsIpcHandlers(options = {}) {
  const repository = createModelsRepository(options.database)

  ipcMain.handle('models:list', () => {
    try {
      return { ok: true, models: repository.list() }
    } catch (error) {
      return toErrorResult(error, 'Nao foi possivel carregar os modelos.')
    }
  })

  ipcMain.handle('models:save', (_event, model) => {
    try {
      return { ok: true, model: repository.save(model) }
    } catch (error) {
      return toErrorResult(error, 'Nao foi possivel salvar o modelo.')
    }
  })

  ipcMain.handle('models:delete', (_event, modelId) => {
    try {
      return { ok: true, deleted: repository.delete(modelId) }
    } catch (error) {
      return toErrorResult(error, 'Nao foi possivel excluir o modelo.')
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
  registerModelsIpcHandlers,
}
