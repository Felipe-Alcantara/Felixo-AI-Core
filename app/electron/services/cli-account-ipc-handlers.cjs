'use strict'

const { ipcMain } = require('electron')
const { toErrorResult } = require('./ipc-result.cjs')
const { supportsProfiles } = require('./cli-account-profiles.cjs')

/**
 * Superfície IPC das contas por terminal.
 *
 * Pequena de propósito: listar, criar, remover e guardar a chave do Openia.
 * Nada de credencial atravessa daqui para o renderer — a chave só entra, e o
 * caminho da pasta de perfil nunca sai, porque a interface não tem o que fazer
 * com ele e expor caminho de credencial só cria oportunidade de vazamento.
 */
function registerCliAccountIpcHandlers({ store } = {}) {
  ipcMain.handle('cli-accounts:list', async (_event, providerId) => {
    try {
      return {
        ok: true,
        accounts: store.list(typeof providerId === 'string' ? providerId : undefined),
        // A interface precisa saber se pode oferecer o seletor para cada CLI.
        secretStorage: store.canStoreSecret(),
      }
    } catch (error) {
      return toErrorResult(error, 'Não foi possível listar as contas.')
    }
  })

  ipcMain.handle('cli-accounts:create', async (_event, params = {}) => {
    try {
      if (!supportsProfiles(params?.providerId)) {
        return {
          ok: false,
          message: 'Esta CLI não aceita mais de uma conta no app.',
        }
      }

      return { ok: true, account: store.create(params) }
    } catch (error) {
      return toErrorResult(error, 'Não foi possível criar a conta.')
    }
  })

  ipcMain.handle('cli-accounts:remove', async (_event, accountId) => {
    try {
      const removed = store.remove(accountId)
      return { ok: true, removed }
    } catch (error) {
      return toErrorResult(error, 'Não foi possível remover a conta.')
    }
  })

  ipcMain.handle('cli-accounts:set-secret', async (_event, params = {}) => {
    try {
      store.setSecret(params?.accountId, params?.secret)
      return { ok: true }
    } catch (error) {
      return toErrorResult(error, 'Não foi possível guardar a chave da conta.')
    }
  })
}

module.exports = {
  registerCliAccountIpcHandlers,
}
