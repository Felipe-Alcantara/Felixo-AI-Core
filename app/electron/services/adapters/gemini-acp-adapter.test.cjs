const test = require('node:test')
const assert = require('node:assert/strict')
const adapter = require('./gemini-acp-adapter.cjs')

test('gemini-acp adapter returns persistent spawn args', () => {
  const spawnArgs = adapter.getPersistentSpawnArgs()

  assert.equal(spawnArgs.command, 'gemini')
  assert.deepEqual(spawnArgs.args, ['--acp'])
})

test('gemini-acp adapter passes provider model to persistent process', () => {
  const spawnArgs = adapter.getPersistentSpawnArgs({
    model: {
      providerModel: 'gemini-3-pro-preview',
      reasoningEffort: 'high',
    },
  })

  assert.equal(spawnArgs.command, 'gemini')
  assert.deepEqual(spawnArgs.args, [
    '--acp',
    '--model',
    'gemini-3-pro-preview',
  ])
})

test('gemini-acp adapter sends initialize on initial phase', () => {
  adapter.resetRequestId()
  const result = adapter.createPersistentInput('Oi', { persistentPhase: 'initial' })
  const parsed = JSON.parse(result.input.trim())

  assert.equal(parsed.jsonrpc, '2.0')
  assert.equal(parsed.method, 'initialize')
  assert.equal(parsed.params.protocolVersion, 1)
  assert.equal(typeof parsed.id, 'number')
  assert.equal(result.didStartSession, false)
  assert.equal(result.didSendPrompt, false)
})

test('gemini-acp adapter sends session/new on session phase', () => {
  adapter.resetRequestId()
  const result = adapter.createPersistentInput('Oi', {
    persistentPhase: 'session',
    cwd: '/home/user/project',
  })
  const parsed = JSON.parse(result.input.trim())

  assert.equal(parsed.method, 'session/new')
  assert.equal(parsed.params.cwd, '/home/user/project')
  assert.deepEqual(parsed.params.mcpServers, [])
  assert.equal(result.didStartSession, true)
  assert.equal(result.didSendPrompt, false)
})

test('gemini-acp adapter sends session/prompt on prompt phase', () => {
  adapter.resetRequestId()
  const result = adapter.createPersistentInput('Oi', {
    persistentPhase: 'prompt',
    providerSessionId: 'sess-abc',
  })
  const parsed = JSON.parse(result.input.trim())

  assert.equal(parsed.method, 'session/prompt')
  assert.equal(parsed.params.sessionId, 'sess-abc')
  assert.deepEqual(parsed.params.prompt, [{ type: 'text', text: 'Oi' }])
  assert.equal(result.didStartSession, true)
  assert.equal(result.didSendPrompt, true)
})

test('gemini-acp adapter sends session/prompt directly when reusing process', () => {
  adapter.resetRequestId()
  const result = adapter.createPersistentInput('Oi', {
    persistentPhase: 'initial',
    isReusingProcess: true,
    providerSessionId: 'sess-existing',
  })
  const parsed = JSON.parse(result.input.trim())

  assert.equal(parsed.method, 'session/prompt')
  assert.equal(parsed.params.sessionId, 'sess-existing')
  assert.deepEqual(parsed.params.prompt, [{ type: 'text', text: 'Oi' }])
  assert.equal(result.didStartSession, true)
  assert.equal(result.didSendPrompt, true)
})

test('gemini-acp adapter parses initialize response as authenticate responseInput', () => {
  adapter.resetRequestId()
  const event = adapter.parseLine(JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    result: {
      protocolVersion: 1,
      agentCapabilities: { loadSession: true },
      agentInfo: { name: 'gemini-cli', version: '0.40.1' },
    },
  }))

  assert.equal(event.type, 'control')
  assert.ok(event.responseInput, 'should have responseInput')
  const parsed = JSON.parse(event.responseInput.trim())
  assert.equal(parsed.method, 'authenticate')
  assert.equal(parsed.params.methodId, 'oauth-personal')
  assert.equal(event.readyForSession, undefined)
})

test('gemini-acp adapter parses authenticate response as readyForSession', () => {
  const event = adapter.parseLine(JSON.stringify({
    jsonrpc: '2.0',
    id: 2,
    result: {},
  }))

  assert.deepEqual(event, { type: 'control', readyForSession: true })
})

test('gemini-acp adapter parses session/new response as session event', () => {
  const event = adapter.parseLine(JSON.stringify({
    jsonrpc: '2.0',
    id: 3,
    result: { sessionId: 'sess-xyz', configOptions: [], models: null, modes: null },
  }))

  assert.deepEqual(event, {
    type: 'session',
    providerSessionId: 'sess-xyz',
    readyForPrompt: true,
  })
})

test('gemini-acp adapter parses session/prompt response as done', () => {
  const event = adapter.parseLine(JSON.stringify({
    jsonrpc: '2.0',
    id: 4,
    result: { stopReason: 'done', usage: null },
  }))

  assert.deepEqual(event, { type: 'done' })
})

test('gemini-acp adapter parses session/update agent_message_chunk as text', () => {
  const event = adapter.parseLine(JSON.stringify({
    jsonrpc: '2.0',
    method: 'session/update',
    params: {
      sessionId: 'sess-xyz',
      update: {
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text: 'Hello ' },
        messageId: 'msg-1',
      },
    },
  }))

  assert.deepEqual(event, { type: 'text', text: 'Hello ' })
})

test('gemini-acp adapter ignores non-text session/update chunks', () => {
  const event = adapter.parseLine(JSON.stringify({
    jsonrpc: '2.0',
    method: 'session/update',
    params: {
      sessionId: 'sess-xyz',
      update: {
        sessionUpdate: 'agent_thought_chunk',
        content: { type: 'text', text: 'thinking...' },
      },
    },
  }))

  assert.equal(event, null)
})

test('gemini-acp adapter auto-approves session/request_permission', () => {
  const event = adapter.parseLine(JSON.stringify({
    jsonrpc: '2.0',
    id: 5,
    method: 'session/request_permission',
    params: {
      sessionId: 'sess-xyz',
      options: [
        { id: 'opt-1', kind: 'allow_once', name: 'Allow once' },
        { id: 'opt-2', kind: 'allow_always', name: 'Allow always' },
      ],
    },
  }))

  assert.equal(event.type, 'control')
  assert.ok(event.responseInput)
  const parsed = JSON.parse(event.responseInput.trim())
  assert.equal(parsed.result.outcome, 'selected')
  assert.equal(parsed.result.optionId, 'opt-1')
})

test('gemini-acp adapter parses error response', () => {
  const event = adapter.parseLine(JSON.stringify({
    jsonrpc: '2.0',
    id: 6,
    error: { code: -32601, message: 'Method not found' },
  }))

  assert.deepEqual(event, { type: 'error', message: 'Method not found' })
})

test('gemini-acp adapter returns null for non-json-rpc lines', () => {
  const event = adapter.parseLine(JSON.stringify({ type: 'unknown' }))

  assert.equal(event, null)
})

test('gemini-acp adapter canResume returns false', () => {
  assert.equal(adapter.canResume(), false)
})

test('gemini-acp adapter provides one-shot fallback spawn args', () => {
  const spawnArgs = adapter.getSpawnArgs('Oi')

  assert.equal(spawnArgs.command, 'gemini')
  assert.ok(spawnArgs.args.includes('--prompt'))
  assert.ok(spawnArgs.args.includes('Oi'))
})
