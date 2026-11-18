'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const handlers = new Map()
const originalLoad = Module._load
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'electron') {
    return { ipcMain: { handle: (channel, listener) => handlers.set(channel, listener) } }
  }
  return originalLoad.call(this, request, parent, isMain)
}
const { registerClaudeTerminalDefaultsIpcHandlers } = require('./claude-terminal-defaults-ipc-handlers.cjs')
const { createClaudeTerminalDefaults } = require('./claude-terminal-defaults.cjs')
Module._load = originalLoad

test('o painel lê o catálogo e grava uma opção por vez, na pasta temporária', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-claude-defaults-ipc-'))
  try {
    handlers.clear()
    registerClaudeTerminalDefaultsIpcHandlers({ terminalDefaults: createClaudeTerminalDefaults({ baseDir: root }) })

    const inicial = await handlers.get('claude-terminal-defaults:get')(null)
    assert.equal(inicial.ok, true)
    assert.ok(inicial.options.some((opcao) => opcao.key === 'theme' && opcao.editable))
    assert.deepEqual(inicial.global, {})

    const gravado = await handlers.get('claude-terminal-defaults:set')(null, { key: 'theme', value: 'light' })
    assert.deepEqual(gravado, { ok: true, global: { theme: 'light' }, accounts: {} })

    const excecao = await handlers.get('claude-terminal-defaults:set')(null, { key: 'theme', accountId: 'conta-b', value: null })
    assert.deepEqual(excecao.accounts, { 'conta-b': { theme: null } })

    const recusado = await handlers.get('claude-terminal-defaults:set')(null, { key: 'copyOnSelect', value: false })
    assert.equal(recusado.ok, false)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
