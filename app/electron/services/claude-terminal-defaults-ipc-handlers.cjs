'use strict'

const { ipcMain } = require('electron')
const { describeOptions } = require('./claude-config-catalog.cjs')
const { toErrorResult } = require('./ipc-result.cjs')

/**
 * Padrão da aba Config do Claude Code para os terminais do app. O renderer lê o catálogo e o que
 * está salvo e grava uma opção por vez; nada aqui toca o `settings.json` nem o `.claude.json`.
 */
function registerClaudeTerminalDefaultsIpcHandlers({ terminalDefaults }) {
  ipcMain.handle('claude-terminal-defaults:get', async () => {
    try {
      const { global, accounts } = terminalDefaults.read()
      return { ok: true, options: describeOptions(), global, accounts: { ...accounts } }
    } catch (error) {
      return toErrorResult(error, 'Não foi possível ler o padrão dos terminais do Claude.')
    }
  })

  ipcMain.handle('claude-terminal-defaults:set', async (_event, change) => {
    try {
      const result = terminalDefaults.set({
        key: change?.key,
        accountId: typeof change?.accountId === 'string' ? change.accountId : null,
        value: change?.value,
        clear: change?.clear === true,
      })
      if (!result.ok) return result
      const { global, accounts } = terminalDefaults.read()
      return { ok: true, global, accounts: { ...accounts } }
    } catch (error) {
      return toErrorResult(error, 'Não foi possível gravar o padrão dos terminais do Claude.')
    }
  })
}

module.exports = { registerClaudeTerminalDefaultsIpcHandlers }
