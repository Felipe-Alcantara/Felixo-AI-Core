'use strict'

const { ipcMain } = require('electron')
const { toErrorResult } = require('./ipc-result.cjs')
const path = require('node:path')
const { createAgentUsageService } = require('./agent-usage-service.cjs')
const { getAppPaths } = require('../core/app-paths.cjs')
const {
  createClaudeStatuslineService,
} = require('./claude-statusline-service.cjs')

/**
 * A superfície IPC do painel é pequena de propósito: listar, atualizar,
 * adicionar e arquivar. Nenhuma saída de CLI atravessa este módulo.
 */
function registerAgentUsageIpcHandlers({
  service = createAgentUsageService(),
  statusline = createClaudeStatuslineService({
    baseDir: path.join(getAppPaths().userData, 'claude-statusline'),
  }),
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

  // A coleta do Claude altera ~/.claude/settings.json, que é configuração da
  // pessoa: só acontece por pedido explícito da interface.
  ipcMain.handle('agent-usage:claude-statusline-status', async () => {
    try {
      return { ok: true, ...statusline.status() }
    } catch (error) {
      return toErrorResult(error, 'Não foi possível ler o estado da coleta.')
    }
  })

  ipcMain.handle('agent-usage:enable-claude-statusline', async () => {
    try {
      const result = statusline.install()
      return { ...result, ...statusline.status() }
    } catch (error) {
      return toErrorResult(error, 'Não foi possível ligar a coleta do Claude.')
    }
  })

  ipcMain.handle('agent-usage:disable-claude-statusline', async () => {
    try {
      const result = statusline.uninstall()
      return { ...result, ...statusline.status() }
    } catch (error) {
      return toErrorResult(error, 'Não foi possível desligar a coleta do Claude.')
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
