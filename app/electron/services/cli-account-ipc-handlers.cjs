'use strict'

const { ipcMain } = require('electron')
const { toErrorResult } = require('./ipc-result.cjs')
const { supportsProfiles } = require('./cli-account-profiles.cjs')
const { logQaEvent } = require('./qa-logger.cjs')

/** Teto de terminais aceitos numa confirmação; mais que isso é entrada torta. */
const MAX_ACKNOWLEDGED_SESSIONS = 200

/**
 * Só o formato: a confirmação é `true` estrito e a lista de terminais vistos
 * são strings. Quem decide se a confirmação cobre a remoção é a loja.
 */
function readRemoveOptions(options) {
  const acknowledged = Array.isArray(options?.acknowledgedSessionIds)
    ? options.acknowledgedSessionIds
        .filter((sessionId) => typeof sessionId === 'string' && sessionId !== '')
        .slice(0, MAX_ACKNOWLEDGED_SESSIONS)
    : []

  return {
    confirmed: options?.confirmed === true,
    acknowledgedSessionIds: acknowledged,
  }
}

/**
 * Superfície IPC das contas por terminal.
 *
 * Pequena de propósito: listar, criar, remover e guardar a chave do Openia.
 * Nada de credencial atravessa daqui para o renderer — a chave só entra, e o
 * caminho da pasta de perfil nunca sai, porque a interface não tem o que fazer
 * com ele e expor caminho de credencial só cria oportunidade de vazamento.
 */
function registerCliAccountIpcHandlers({ store, logEvent = logQaEvent } = {}) {
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

  // Sem confirmação, a resposta é a lista dos terminais vivos na conta, para a
  // interface perguntar nomeando cada um; nada é apagado.
  ipcMain.handle('cli-accounts:remove', async (_event, accountId, options) => {
    try {
      const result = store.remove(accountId, readRemoveOptions(options))

      if (result.requiresConfirmation) {
        return {
          ok: false,
          requiresConfirmation: true,
          sessions: result.sessions,
          message: 'Remover a conta exige confirmação explícita.',
        }
      }

      if (result.chainCleaned === false) {
        logEvent({
          level: 'warn',
          scope: 'cli-accounts:remove',
          message:
            'Conta removida, mas a limpeza da cadeia falhou; a recuperação do início tira as linhas órfãs.',
        })
      }

      return { ok: true, removed: result.removed, sessions: result.sessions }
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
