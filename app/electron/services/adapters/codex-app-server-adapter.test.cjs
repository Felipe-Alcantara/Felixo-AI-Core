const test = require('node:test')
const assert = require('node:assert/strict')
const adapter = require('./codex-app-server-adapter.cjs')

test('codex-app-server adapter returns persistent spawn args', () => {
  const spawnArgs = adapter.getPersistentSpawnArgs()

  assert.equal(spawnArgs.command, 'codex')
  assert.deepEqual(spawnArgs.args, ['app-server'])
})

test('codex-app-server adapter passes model config to persistent process', () => {
  const spawnArgs = adapter.getPersistentSpawnArgs({
    model: {
      providerModel: 'gpt-5.5',
      reasoningEffort: 'high',
    },
  })

  assert.equal(spawnArgs.command, 'codex')
  assert.deepEqual(spawnArgs.args, [
    'app-server',
    '--config',
    'model="gpt-5.5"',
    '--config',
    'model_reasoning_effort="high"',
  ])
})

test('codex-app-server adapter sends initialize + initialized on initial phase', () => {
  adapter.resetRequestId()
  const result = adapter.createPersistentInput('Oi', { persistentPhase: 'initial' })
  const lines = result.input.trim().split('\n')

  assert.equal(lines.length, 2, 'should emit initialize request + initialized notification')

  const initRequest = JSON.parse(lines[0])
  assert.equal(initRequest.method, 'initialize')
  assert.equal(initRequest.params.clientInfo.name, 'felixo-ai-core')
  assert.equal(typeof initRequest.id, 'number')

  const initializedNotif = JSON.parse(lines[1])
  assert.equal(initializedNotif.method, 'initialized')
  assert.equal(initializedNotif.id, undefined)

  assert.equal(result.didStartSession, false)
  assert.equal(result.didSendPrompt, false)
})

test('codex-app-server adapter sends thread/start on session phase', () => {
  adapter.resetRequestId()
  const result = adapter.createPersistentInput('Oi', {
    persistentPhase: 'session',
    cwd: '/tmp/test-project',
  })
  const parsed = JSON.parse(result.input.trim())

  assert.equal(parsed.method, 'thread/start')
  assert.equal(parsed.params.cwd, '/tmp/test-project')
  assert.equal(result.didStartSession, true)
  assert.equal(result.didSendPrompt, false)
})

test('codex-app-server adapter sends turn/start on prompt phase', () => {
  adapter.resetRequestId()
  const result = adapter.createPersistentInput('Oi', {
    persistentPhase: 'prompt',
    providerSessionId: 'thread-123',
  })
  const parsed = JSON.parse(result.input.trim())

  assert.equal(parsed.method, 'turn/start')
  assert.equal(parsed.params.threadId, 'thread-123')
  assert.deepEqual(parsed.params.input, [{ type: 'text', text: 'Oi' }])
  assert.equal(result.didStartSession, true)
  assert.equal(result.didSendPrompt, true)
})

test('codex-app-server adapter sends turn/start directly when reusing process', () => {
  adapter.resetRequestId()
  const result = adapter.createPersistentInput('Oi', {
    persistentPhase: 'initial',
    isReusingProcess: true,
    providerSessionId: 'thread-123',
  })
  const parsed = JSON.parse(result.input.trim())

  assert.equal(parsed.method, 'turn/start')
  assert.equal(parsed.params.threadId, 'thread-123')
  assert.equal(result.didStartSession, true)
  assert.equal(result.didSendPrompt, true)
})

test('codex-app-server adapter parses initialize response as control', () => {
  const event = adapter.parseLine(JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    result: {
      serverInfo: { name: 'codex', version: '0.125.0' },
      capabilities: { threads: true },
    },
  }))

  assert.deepEqual(event, { type: 'control', readyForSession: true })
})

test('codex-app-server adapter parses real initialize response without jsonrpc', () => {
  const event = adapter.parseLine(JSON.stringify({
    id: 1,
    result: {
      userAgent: 'felixo-ai-core/0.125.0',
      codexHome: '/tmp/felixo-codex-home',
      platformFamily: 'unix',
      platformOs: 'linux',
    },
  }))

  assert.deepEqual(event, { type: 'control', readyForSession: true })
})

test('codex-app-server adapter parses thread/start response as session', () => {
  const event = adapter.parseLine(JSON.stringify({
    id: 2,
    result: {
      thread: {
        id: 'thread-123',
        status: { type: 'idle' },
      },
      model: 'gpt-5.5',
      cwd: '/tmp/test-project',
    },
  }))

  assert.deepEqual(event, {
    type: 'session',
    providerSessionId: 'thread-123',
    readyForPrompt: true,
  })
})

test('codex-app-server adapter parses legacy threadId response as session', () => {
  const event = adapter.parseLine(JSON.stringify({
    jsonrpc: '2.0',
    id: 2,
    result: {
      threadId: 'thread-123',
    },
  }))

  assert.deepEqual(event, {
    type: 'session',
    providerSessionId: 'thread-123',
    readyForPrompt: true,
  })
})

test('codex-app-server adapter parses thread/started as session', () => {
  const event = adapter.parseLine(JSON.stringify({
    method: 'thread/started',
    params: {
      thread: { id: 'thread-123', status: 'active' },
    },
  }))

  assert.deepEqual(event, {
    type: 'session',
    providerSessionId: 'thread-123',
    readyForPrompt: true,
  })
})

test('codex-app-server adapter parses agentMessage delta as text', () => {
  const event = adapter.parseLine(JSON.stringify({
    jsonrpc: '2.0',
    method: 'item/agentMessage/delta',
    params: {
      delta: 'Hello ',
      itemId: 'item-1',
      threadId: 'thread-123',
      turnId: 'turn-1',
    },
  }))

  assert.deepEqual(event, { type: 'text', text: 'Hello ' })
})

test('codex-app-server adapter parses turn/completed as done', () => {
  const event = adapter.parseLine(JSON.stringify({
    jsonrpc: '2.0',
    method: 'turn/completed',
    params: {
      threadId: 'thread-123',
      turn: { id: 'turn-1', status: 'completed' },
    },
  }))

  assert.deepEqual(event, {
    type: 'done',
    providerSessionId: 'thread-123',
  })
})

test('codex-app-server adapter parses error notification', () => {
  const event = adapter.parseLine(JSON.stringify({
    jsonrpc: '2.0',
    method: 'error',
    params: { message: 'something broke' },
  }))

  assert.deepEqual(event, { type: 'error', message: 'something broke' })
})

test('codex-app-server adapter parses error response', () => {
  const event = adapter.parseLine(JSON.stringify({
    id: 5,
    error: { code: -32601, message: 'Method not found' },
  }))

  assert.deepEqual(event, { type: 'error', message: 'Method not found' })
})

test('codex-app-server adapter auto-approves command execution request', () => {
  const event = adapter.parseLine(JSON.stringify({
    jsonrpc: '2.0',
    id: 10,
    method: 'item/commandExecution/requestApproval',
    params: {
      threadId: 'thread-123',
      turnId: 'turn-1',
      itemId: 'item-1',
      command: 'ls -la',
    },
  }))

  assert.equal(event.type, 'control')
  assert.ok(event.responseInput, 'should have responseInput for auto-approval')
  const response = JSON.parse(event.responseInput.trim())
  assert.equal(response.id, 10)
  assert.equal(response.result.decision, 'approved')
})

test('codex-app-server adapter auto-approves file change request', () => {
  const event = adapter.parseLine(JSON.stringify({
    jsonrpc: '2.0',
    id: 11,
    method: 'item/fileChange/requestApproval',
    params: {
      threadId: 'thread-123',
      turnId: 'turn-1',
      itemId: 'item-2',
      filePath: '/home/user/project/src/main.js',
    },
  }))

  assert.equal(event.type, 'control')
  assert.ok(event.responseInput, 'should have responseInput for auto-approval')
  const response = JSON.parse(event.responseInput.trim())
  assert.equal(response.id, 11)
  assert.equal(response.result.decision, 'approved')
})

test('codex-app-server adapter ignores reasoning deltas', () => {
  const event = adapter.parseLine(JSON.stringify({
    jsonrpc: '2.0',
    method: 'item/reasoning/textDelta',
    params: { delta: 'thinking...' },
  }))

  assert.equal(event, null)
})

test('codex-app-server adapter returns null for non-json-rpc lines', () => {
  const event = adapter.parseLine(JSON.stringify({ type: 'unknown' }))

  assert.equal(event, null)
})

test('codex-app-server adapter canResume returns false', () => {
  assert.equal(adapter.canResume(), false)
})

test('codex-app-server adapter provides one-shot fallback spawn args', () => {
  const spawnArgs = adapter.getSpawnArgs('Oi')

  assert.equal(spawnArgs.command, 'codex')
  assert.ok(spawnArgs.args.includes('exec'))
  assert.ok(spawnArgs.args.includes('Oi'))
})
