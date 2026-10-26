'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')

const handlers = new Map()
const originalLoad = Module._load
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'electron') {
    return { ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) } }
  }
  return originalLoad.call(this, request, parent, isMain)
}
const { registerAgentUsageIpcHandlers } = require('./agent-usage-ipc-handlers.cjs')
Module._load = originalLoad

test('agent usage IPC validates input and forwards only normalized parameters', async () => {
  const calls = []
  const service = {
    list: async () => ({ ok: true, providers: [], accounts: [] }),
    refresh: async () => ({ ok: true, providers: [], accounts: [] }),
    refreshAccount: async (id) => {
      calls.push(['refresh-account', id])
      return { ok: true, providers: [], accounts: [] }
    },
    addAccount: async (params) => {
      calls.push(['add', params])
      return { ok: true, account: { id: 'account-1' } }
    },
    removeAccount: async (id) => {
      calls.push(['remove', id])
      return { ok: true, removed: true }
    },
    consumeResetCredit: async (params) => {
      calls.push(['consume', params])
      return { ok: true, consumed: true }
    },
  }
  registerAgentUsageIpcHandlers({ service })

  const invalid = await handlers.get('agent-usage:add-account')({}, { providerId: 'codex' })
  assert.equal(invalid.ok, false)
  assert.equal(calls.length, 0)

  const added = await handlers.get('agent-usage:add-account')({}, {
    providerId: 'codex',
    label: '  Principal  ',
    identityHint: '  alice@example.com  ',
  })
  assert.equal(added.ok, true)
  assert.deepEqual(calls[0], [
    'add',
    { providerId: 'codex', label: 'Principal', identityHint: 'alice@example.com' },
  ])

  const removed = await handlers.get('agent-usage:remove-account')({}, ' account-1 ')
  assert.equal(removed.ok, true)
  assert.deepEqual(calls[1], ['remove', 'account-1'])

  const consumed = await handlers.get('agent-usage:consume-reset-credit')({}, {
    accountId: ' account-1 ',
    creditId: ' credit-1 ',
  })
  assert.equal(consumed.ok, true)
  assert.deepEqual(calls[2], [
    'consume',
    { accountId: 'account-1', creditId: 'credit-1' },
  ])

  const invalidConsume = await handlers.get('agent-usage:consume-reset-credit')({}, {
    accountId: 'account-1',
  })
  assert.equal(invalidConsume.ok, false)
  assert.equal(calls.length, 3)

  const refreshed = await handlers.get('agent-usage:refresh-account')({}, ' account-1 ')
  assert.equal(refreshed.ok, true)
  assert.deepEqual(calls[3], ['refresh-account', 'account-1'])

  for (const invalidId of [undefined, '', '   ', 42, { id: 'account-1' }]) {
    const invalidRefresh = await handlers.get('agent-usage:refresh-account')({}, invalidId)
    assert.equal(invalidRefresh.ok, false, `id ${JSON.stringify(invalidId)} deve ser recusado`)
  }
  assert.equal(calls.length, 4, 'id inválido não chega ao serviço')
})

test('agent usage IPC não devolve ao renderer segredo que veio dentro da mensagem de uma exceção', async () => {
  const falha = () => {
    throw new Error('spawn falhou: OPENAI_API_KEY=CANARIOipc0a1b2c e https://u:CANARIOipcurl9z@proxy.example.com')
  }
  registerAgentUsageIpcHandlers({
    service: { list: falha, refresh: falha, refreshAccount: falha, reconnect: falha, addAccount: falha, removeAccount: falha, consumeResetCredit: falha },
  })

  const respostas = await Promise.all([
    handlers.get('agent-usage:list')({}),
    handlers.get('agent-usage:refresh')({}),
    handlers.get('agent-usage:refresh-account')({}, 'account-1'),
    handlers.get('agent-usage:reconnect')({}),
    handlers.get('agent-usage:add-account')({}, { providerId: 'codex', label: 'Principal' }),
    handlers.get('agent-usage:remove-account')({}, 'account-1'),
    handlers.get('agent-usage:consume-reset-credit')({}, { accountId: 'account-1', creditId: 'credit-1' }),
  ])

  for (const resposta of respostas) {
    assert.equal(resposta.ok, false)
    assert.doesNotMatch(JSON.stringify(resposta), /CANARIO/)
    assert.match(resposta.message, /spawn falhou/, 'o motivo continua legível; só o segredo sai')
  }
})
