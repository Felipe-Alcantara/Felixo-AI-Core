'use strict'

const { ipcMain } = require('electron')
const { toErrorResult } = require('./ipc-result.cjs')
const {
  createAgentPresetsRepository,
} = require('./storage/agent-presets-repository.cjs')

function registerAgentPresetsIpcHandlers(options = {}) {
  const repository = createAgentPresetsRepository(options.database)

  ipcMain.handle('agent-presets:list', () => {
    try {
      return { ok: true, presets: repository.list() }
    } catch (error) {
      return toErrorResult(error, 'Nao foi possivel carregar os presets de agente.')
    }
  })

  ipcMain.handle('agent-presets:save', (_event, preset) => {
    try {
      return { ok: true, preset: repository.save(preset) }
    } catch (error) {
      return toErrorResult(error, 'Nao foi possivel salvar o preset de agente.')
    }
  })

  ipcMain.handle('agent-presets:delete', (_event, presetId) => {
    try {
      return { ok: true, deleted: repository.delete(presetId) }
    } catch (error) {
      return toErrorResult(error, 'Nao foi possivel excluir o preset de agente.')
    }
  })
}

module.exports = { registerAgentPresetsIpcHandlers }
