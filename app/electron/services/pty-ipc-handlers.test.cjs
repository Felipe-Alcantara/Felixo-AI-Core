const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')

// Stub `electron` so the handler module can be loaded under node:test. The
// stub exposes a tiny `ipcMain` that records registered handlers so each test
// can invoke them directly.
const handlers = new Map()
const originalLoad = Module._load
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'electron') {
    return {
      ipcMain: {
        handle(channel, listener) {
          handlers.set(channel, listener)
        },
      },
    }
  }

  return originalLoad.call(this, request, parent, isMain)
}

const {
  registerPtyIpcHandlers,
  requireSessionId,
  toErrorResult,
} = require('./pty-ipc-handlers.cjs')

Module._load = originalLoad

function createFakeManager() {
  return {
    calls: [],
    spawn(sessionId, options) {
      this.calls.push({ method: 'spawn', sessionId, options })
      // Emit one data + exit event so we can assert the bridge forwards them.
      options.onData?.('boot\r\n')
      options.onExit?.({ exitCode: 0, signal: undefined })
    },
    write(sessionId, data) {
      this.calls.push({ method: 'write', sessionId, data })
      return true
    },
    resize(sessionId, cols, rows) {
      this.calls.push({ method: 'resize', sessionId, cols, rows })
      return true
    },
    kill(sessionId, options) {
      this.calls.push({ method: 'kill', sessionId, options })
      return true
    },
    killAll(options) {
      this.calls.push({ method: 'killAll', options })
    },
  }
}

function setup() {
  handlers.clear()
  const sent = []
  const window = {
    isDestroyed: () => false,
    webContents: {
      send: (channel, payload) => sent.push({ channel, payload }),
    },
  }
  const manager = createFakeManager()
  const api = registerPtyIpcHandlers(() => window, { manager })
  const invoke = (channel, params) => handlers.get(channel)(null, params)

  return { manager, sent, api, invoke }
}

test('requireSessionId rejects empty or non-string ids', () => {
  assert.equal(requireSessionId('term-1'), 'term-1')
  assert.throws(() => requireSessionId(''), /sessionId is required/)
  assert.throws(() => requireSessionId('   '), /sessionId is required/)
  assert.throws(() => requireSessionId(undefined), /sessionId is required/)
})

test('toErrorResult prefers the error message and falls back otherwise', () => {
  assert.deepEqual(toErrorResult(new Error('boom'), 'fallback'), {
    ok: false,
    message: 'boom',
  })
  assert.deepEqual(toErrorResult('not-an-error', 'fallback'), {
    ok: false,
    message: 'fallback',
  })
})

test('pty:spawn starts a session and streams data/exit to the window', () => {
  const { manager, sent, invoke } = setup()

  const result = invoke('pty:spawn', {
    sessionId: 'term-1',
    command: 'claude',
    cols: 100,
    rows: 30,
  })

  assert.deepEqual(result, { ok: true, sessionId: 'term-1' })
  const spawnCall = manager.calls.find((call) => call.method === 'spawn')
  assert.equal(spawnCall.sessionId, 'term-1')
  assert.equal(spawnCall.options.command, 'claude')

  assert.deepEqual(sent, [
    { channel: 'pty:data', payload: { sessionId: 'term-1', data: 'boot\r\n' } },
    {
      channel: 'pty:exit',
      payload: { sessionId: 'term-1', exitCode: 0, signal: undefined },
    },
  ])
})

test('pty:spawn returns an error result for a missing sessionId', () => {
  const { manager, invoke } = setup()

  const result = invoke('pty:spawn', {})

  assert.equal(result.ok, false)
  assert.match(result.message, /sessionId is required/)
  assert.equal(
    manager.calls.some((call) => call.method === 'spawn'),
    false,
  )
})

test('pty:write forwards input to the manager', () => {
  const { manager, invoke } = setup()

  const result = invoke('pty:write', { sessionId: 'term-1', data: 'ls\n' })

  assert.deepEqual(result, { ok: true, delivered: true })
  assert.deepEqual(
    manager.calls.find((call) => call.method === 'write'),
    { method: 'write', sessionId: 'term-1', data: 'ls\n' },
  )
})

test('pty:resize forwards dimensions to the manager', () => {
  const { manager, invoke } = setup()

  const result = invoke('pty:resize', { sessionId: 'term-1', cols: 120, rows: 40 })

  assert.deepEqual(result, { ok: true, applied: true })
  assert.deepEqual(
    manager.calls.find((call) => call.method === 'resize'),
    { method: 'resize', sessionId: 'term-1', cols: 120, rows: 40 },
  )
})

test('pty:kill forwards the force flag to the manager', () => {
  const { manager, invoke } = setup()

  const result = invoke('pty:kill', { sessionId: 'term-1', force: true })

  assert.deepEqual(result, { ok: true, killed: true })
  assert.deepEqual(
    manager.calls.find((call) => call.method === 'kill'),
    { method: 'kill', sessionId: 'term-1', options: { force: true } },
  )
})

test('dispose force-kills every session', () => {
  const { manager, api } = setup()

  api.dispose()

  assert.deepEqual(
    manager.calls.find((call) => call.method === 'killAll'),
    { method: 'killAll', options: { force: true } },
  )
})
