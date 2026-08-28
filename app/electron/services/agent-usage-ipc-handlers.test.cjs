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
    addAccount: async (params) => {
      calls.push(['add', params])
      return { ok: true, account: { id: 'account-1' } }
    },
    removeAccount: async (id) => {
      calls.push(['remove', id])
      return { ok: true, removed: true }
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
})
