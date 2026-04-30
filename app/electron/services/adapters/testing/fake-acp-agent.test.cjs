const test = require('node:test')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const path = require('node:path')

const AGENT_PATH = path.join(__dirname, 'fake-acp-agent.cjs')

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

test('fake ACP agent responds to initialize with capabilities', async () => {
  const child = spawnAgent()
  const linesPromise = collectLines(child)

  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'initialize', id: 1 })}\n`)
  child.stdin.end()

  const lines = await linesPromise

  assert.equal(lines.length, 1)
  assert.equal(lines[0].jsonrpc, '2.0')
  assert.equal(lines[0].id, 1)
  assert.ok(lines[0].result.capabilities)
  assert.equal(lines[0].result.capabilities.streaming, true)
})

test('fake ACP agent responds to newSession with sessionId', async () => {
  const child = spawnAgent()
  const linesPromise = collectLines(child)

  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'newSession', id: 1 })}\n`)
  child.stdin.end()

  const lines = await linesPromise

  assert.equal(lines[0].result.sessionId, 'fake-acp-session-001')
})

test('fake ACP agent handles full handshake + prompt', async () => {
  const child = spawnAgent()
  const linesPromise = collectLines(child)

  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'initialize', id: 1 })}\n`)
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'newSession', id: 2 })}\n`)
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'prompt', id: 3, params: { text: 'oi' } })}\n`)
  child.stdin.end()

  const lines = await linesPromise

  const initResponse = lines.find((l) => l.id === 1)
  assert.ok(initResponse.result.capabilities)

  const sessionResponse = lines.find((l) => l.id === 2)
  assert.ok(sessionResponse.result.sessionId)

  const notifications = lines.filter((l) => l.method === 'textChunk')
  assert.ok(notifications.length > 0, 'should emit text chunk notifications')

  const promptResponse = lines.find((l) => l.id === 3)
  assert.ok(promptResponse.result.text.includes('oi'))
  assert.ok(promptResponse.result.sessionId)
})

test('fake ACP agent handles cancel', async () => {
  const child = spawnAgent()
  const linesPromise = collectLines(child)

  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'cancel', id: 1 })}\n`)
  child.stdin.end()

  const lines = await linesPromise

  assert.equal(lines[0].result.cancelled, true)
})

test('fake ACP agent returns error for unknown method', async () => {
  const child = spawnAgent()
  const linesPromise = collectLines(child)

  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'unknown', id: 1 })}\n`)
  child.stdin.end()

  const lines = await linesPromise

  assert.equal(lines[0].error.code, -32601)
})
