const test = require('node:test')
const assert = require('node:assert/strict')
const adapter = require('./gemini-acp-adapter.cjs')

test('gemini-acp adapter returns persistent spawn args', () => {
  const spawnArgs = adapter.getPersistentSpawnArgs()

  assert.equal(spawnArgs.command, 'gemini')
  assert.deepEqual(spawnArgs.args, ['--acp'])
})

test('gemini-acp adapter sends initialize on initial phase', () => {
  adapter.resetRequestId()
  const result = adapter.createPersistentInput('Oi', { persistentPhase: 'initial' })
  const parsed = JSON.parse(result.input.trim())

  assert.equal(parsed.jsonrpc, '2.0')
  assert.equal(parsed.method, 'initialize')
  assert.equal(typeof parsed.id, 'number')
  assert.equal(result.didStartSession, false)
  assert.equal(result.didSendPrompt, false)
})

test('gemini-acp adapter sends newSession on session phase', () => {
  adapter.resetRequestId()
  const result = adapter.createPersistentInput('Oi', { persistentPhase: 'session' })
  const parsed = JSON.parse(result.input.trim())

  assert.equal(parsed.method, 'newSession')
  assert.equal(result.didStartSession, true)
  assert.equal(result.didSendPrompt, false)
})

test('gemini-acp adapter sends prompt on prompt phase', () => {
  adapter.resetRequestId()
  const result = adapter.createPersistentInput('Oi', { persistentPhase: 'prompt' })
  const parsed = JSON.parse(result.input.trim())

  assert.equal(parsed.method, 'prompt')
  assert.equal(parsed.params.text, 'Oi')
  assert.equal(result.didStartSession, true)
  assert.equal(result.didSendPrompt, true)
})

test('gemini-acp adapter sends prompt directly when reusing process', () => {
  adapter.resetRequestId()
  const result = adapter.createPersistentInput('Oi', {
    persistentPhase: 'initial',
    isReusingProcess: true,
  })
  const parsed = JSON.parse(result.input.trim())

  assert.equal(parsed.method, 'prompt')
  assert.equal(parsed.params.text, 'Oi')
  assert.equal(result.didStartSession, true)
  assert.equal(result.didSendPrompt, true)
})

test('gemini-acp adapter parses textChunk notification', () => {
  const event = adapter.parseLine(JSON.stringify({
    jsonrpc: '2.0',
    method: 'textChunk',
    params: { text: 'Hello ' },
  }))

  assert.deepEqual(event, { type: 'text', text: 'Hello ' })
})

test('gemini-acp adapter parses initialize response as control', () => {
  const event = adapter.parseLine(JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    result: { capabilities: { streaming: true, tools: false, sessions: true } },
  }))

  assert.deepEqual(event, { type: 'control', readyForSession: true })
})

test('gemini-acp adapter parses newSession response as session', () => {
  const event = adapter.parseLine(JSON.stringify({
    jsonrpc: '2.0',
    id: 2,
    result: { sessionId: 'abc-123' },
  }))

  assert.deepEqual(event, {
    type: 'session',
    providerSessionId: 'abc-123',
    readyForPrompt: true,
  })
})

test('gemini-acp adapter parses prompt response as done', () => {
  const event = adapter.parseLine(JSON.stringify({
    jsonrpc: '2.0',
    id: 3,
    result: { text: 'Resposta completa', sessionId: 'abc-123' },
  }))

  assert.deepEqual(event, {
    type: 'done',
    providerSessionId: 'abc-123',
  })
})

test('gemini-acp adapter parses cancel response as done', () => {
  const event = adapter.parseLine(JSON.stringify({
    jsonrpc: '2.0',
    id: 4,
    result: { cancelled: true },
  }))

  assert.deepEqual(event, { type: 'done' })
})

test('gemini-acp adapter parses error response', () => {
  const event = adapter.parseLine(JSON.stringify({
    jsonrpc: '2.0',
    id: 5,
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
