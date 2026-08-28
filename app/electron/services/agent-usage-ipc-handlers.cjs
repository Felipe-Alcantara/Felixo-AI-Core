'use strict'

const { ipcMain } = require('electron')
const { toErrorResult } = require('./ipc-result.cjs')
const { createAgentUsageService } = require('./agent-usage-service.cjs')

/**
 * A superfície IPC do painel é pequena de propósito: listar, atualizar,
 * adicionar e arquivar. Nenhuma saída de CLI atravessa este módulo.
 */
function registerAgentUsageIpcHandlers({
  service = createAgentUsageService(),
} = {}) {
  ipcMain.handle('agent-usage:list', async () => {
    try {
      return await service.list()
    } catch (error) {
      return toErrorResult(error, 'Não foi possível carregar o uso dos agentes.')
    }
  })

  ipcMain.handle('agent-usage:refresh', async () => {
    try {
      return await service.refresh()
    } catch (error) {
      return toErrorResult(error, 'Não foi possível atualizar o uso dos agentes.')
    }
  })

  ipcMain.handle('agent-usage:add-account', async (_event, params = {}) => {
    try {
      return await service.addAccount({
        providerId: requireString(params?.providerId, 'Provider de agente inválido.'),
        label: requireString(params?.label, 'Nome da conta de agente inválido.'),
        identityHint:
          params?.identityHint === undefined || params?.identityHint === null
            ? undefined
            : requireString(
                params.identityHint,
                'Identificador da conta de agente inválido.',
              ),
      })
    } catch (error) {
      return toErrorResult(error, 'Não foi possível adicionar a conta de agente.')
    }
  })

  ipcMain.handle('agent-usage:remove-account', async (_event, accountId) => {
    try {
      return await service.removeAccount(
        requireString(accountId, 'ID da conta de agente inválido.'),
      )
    } catch (error) {
      return toErrorResult(error, 'Não foi possível remover a conta de agente.')
    }
  })
}

function requireString(value, message) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(message)
  }
  return value.trim()
}

module.exports = {
  registerAgentUsageIpcHandlers,
}
