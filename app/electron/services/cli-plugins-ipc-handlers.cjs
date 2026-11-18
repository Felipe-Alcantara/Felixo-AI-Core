'use strict'

const { ipcMain } = require('electron')
const { toErrorResult } = require('./ipc-result.cjs')

/**
 * Canais dos plugins das CLIs. O serviço decide tudo (conta, ambiente,
 * validação do id, confirmação); aqui só se lê o formato do pedido.
 */
function registerCliPluginsIpcHandlers({ service, ipc = ipcMain }) {
  const read = (params) => ({
    providerId: typeof params?.providerId === 'string' ? params.providerId : '',
    accountId: typeof params?.accountId === 'string' && params.accountId ? params.accountId : undefined,
    pluginId: params?.pluginId,
    source: params?.source,
    enabled: params?.enabled === true,
    confirmed: params?.confirmed === true,
    includeAvailable: params?.includeAvailable === true,
  })

  const handle = (channel, action, fallback) =>
    ipc.handle(channel, async (_event, params) => {
      try {
        return await service[action](read(params))
      } catch (error) {
        return toErrorResult(error, fallback)
      }
    })

  handle('cli-plugins:list', 'list', 'Não foi possível listar os plugins.')
  handle('cli-plugins:install', 'install', 'Não foi possível instalar o plugin.')
  handle('cli-plugins:remove', 'remove', 'Não foi possível remover o plugin.')
  handle('cli-plugins:set-enabled', 'setEnabled', 'Não foi possível alterar o plugin.')
  handle('cli-plugins:update', 'update', 'Não foi possível atualizar o plugin.')
}

module.exports = { registerCliPluginsIpcHandlers }
