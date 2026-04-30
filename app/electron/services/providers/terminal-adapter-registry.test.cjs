const test = require('node:test')
const assert = require('node:assert/strict')
const {
  getTerminalAdapter,
  listTerminalAdapterTypes,
} = require('./terminal-adapter-registry.cjs')

test('terminal adapter registry exposes supported CLI adapters', () => {
  assert.deepEqual(listTerminalAdapterTypes().sort(), [
    'claude',
    'codex',
    'gemini',
  ])
  assert.equal(getTerminalAdapter('claude').getSpawnArgs('Oi').command, 'claude')
  assert.equal(getTerminalAdapter('codex').getSpawnArgs('Oi').command, 'codex')
  assert.equal(getTerminalAdapter('gemini').getSpawnArgs('Oi').command, 'gemini')
})

test('terminal adapter registry rejects unknown CLI types', () => {
  assert.equal(getTerminalAdapter('unknown'), null)
  assert.equal(getTerminalAdapter(undefined), null)
})
