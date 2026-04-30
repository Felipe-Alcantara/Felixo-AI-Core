const test = require('node:test')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const path = require('node:path')

const AGENT_PATH = path.join(__dirname, 'fake-codex-app-server-agent.cjs')

function spawnAgent() {
  return spawn(process.execPath, [AGENT_PATH], {
    stdio: ['pipe', 'pipe', 'pipe'],
  })
}

function collectLines(child) {
  return new Promise((resolve, reject) => {
    const lines = []
    let buffer = ''

    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString()
      const parts = buffer.split('\n')
      buffer = parts.pop()

      for (const part of parts) {
        if (part.trim()) {
          lines.push(JSON.parse(part))
        }
      }
    })

    child.on('close', () => {
      if (buffer.trim()) {
        lines.push(JSON.parse(buffer))
      }
      resolve(lines)
    })

    child.on('error', reject)
  })
}

test('fake codex app-server agent responds to initialize with capabilities', async () => {
  const child = spawnAgent()
  const linesPromise = collectLines(child)

  child.stdin.write(`${JSON.stringify({
    jsonrpc: '2.0',
    method: 'initialize',
    id: 1,
    params: { clientInfo: { name: 'test', version: '1.0.0' } },
  })}\n`)
  child.stdin.end()

  const lines = await linesPromise

  assert.equal(lines.length, 1)
  assert.equal(lines[0].id, 1)
  assert.ok(lines[0].result.capabilities)
  assert.ok(lines[0].result.serverInfo)
})

test('fake codex app-server agent handles thread/start', async () => {
  const child = spawnAgent()
  const linesPromise = collectLines(child)

  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'thread/start', id: 1, params: {} })}\n`)
  child.stdin.end()

  const lines = await linesPromise

  const notification = lines.find((l) => l.method === 'thread/started')
  assert.ok(notification)
  assert.ok(notification.params.threadId)

  const response = lines.find((l) => l.id === 1)
  assert.ok(response.result.threadId)
})

test('fake codex app-server agent handles full flow: initialize → thread/start → turn/start', async () => {
  const child = spawnAgent()
  const linesPromise = collectLines(child)

  child.stdin.write(`${JSON.stringify({
    jsonrpc: '2.0',
    method: 'initialize',
    id: 1,
    params: { clientInfo: { name: 'test', version: '1.0.0' } },
  })}\n`)
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'initialized' })}\n`)
  child.stdin.write(`${JSON.stringify({
    jsonrpc: '2.0',
    method: 'thread/start',
    id: 2,
    params: {},
  })}\n`)
  child.stdin.write(`${JSON.stringify({
    jsonrpc: '2.0',
    method: 'turn/start',
    id: 3,
    params: {
      threadId: 'fake-codex-thread-001',
      input: [{ type: 'text', text: 'oi' }],
    },
  })}\n`)
  child.stdin.end()

  const lines = await linesPromise

  const initResponse = lines.find((l) => l.id === 1)
  assert.ok(initResponse.result.capabilities)

  const threadStarted = lines.find((l) => l.method === 'thread/started')
  assert.ok(threadStarted.params.threadId)

  const deltas = lines.filter((l) => l.method === 'item/agentMessage/delta')
  assert.ok(deltas.length > 0, 'should emit agent message deltas')
  assert.ok(deltas[0].params.delta)
  assert.ok(deltas[0].params.threadId)

  const turnCompleted = lines.find((l) => l.method === 'turn/completed')
  assert.ok(turnCompleted)
  assert.equal(turnCompleted.params.turn.status, 'completed')

  const turnResponse = lines.find((l) => l.id === 3)
  assert.ok(turnResponse.result.threadId)
  assert.ok(turnResponse.result.turnId)
})

test('fake codex app-server agent handles turn/interrupt', async () => {
  const child = spawnAgent()
  const linesPromise = collectLines(child)

  child.stdin.write(`${JSON.stringify({
    jsonrpc: '2.0',
    method: 'turn/interrupt',
    id: 1,
    params: {},
  })}\n`)
  child.stdin.end()

  const lines = await linesPromise

  assert.equal(lines[0].result.interrupted, true)
})

test('fake codex app-server agent returns error for unknown method', async () => {
  const child = spawnAgent()
  const linesPromise = collectLines(child)

  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'unknown', id: 1 })}\n`)
  child.stdin.end()

  const lines = await linesPromise

  assert.equal(lines[0].error.code, -32601)
})

test('fake codex app-server agent handles multiple turns in same thread', async () => {
  const child = spawnAgent()
  const linesPromise = collectLines(child)

  child.stdin.write(`${JSON.stringify({
    jsonrpc: '2.0',
    method: 'thread/start',
    id: 1,
    params: {},
  })}\n`)
  child.stdin.write(`${JSON.stringify({
    jsonrpc: '2.0',
    method: 'turn/start',
    id: 2,
    params: { threadId: 'fake-codex-thread-001', input: [{ type: 'text', text: 'primeiro' }] },
  })}\n`)
  child.stdin.write(`${JSON.stringify({
    jsonrpc: '2.0',
    method: 'turn/start',
    id: 3,
    params: { threadId: 'fake-codex-thread-001', input: [{ type: 'text', text: 'segundo' }] },
  })}\n`)
  child.stdin.end()

  const lines = await linesPromise

  const completions = lines.filter((l) => l.method === 'turn/completed')
  assert.equal(completions.length, 2, 'should complete both turns')
})
