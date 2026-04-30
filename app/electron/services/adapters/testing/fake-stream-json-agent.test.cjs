const test = require('node:test')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const path = require('node:path')

const AGENT_PATH = path.join(__dirname, 'fake-stream-json-agent.cjs')

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

test('fake stream-json agent emits system init and result on first message', async () => {
  const child = spawnAgent()
  const linesPromise = collectLines(child)

  const input = JSON.stringify({
    type: 'user',
    message: {
      role: 'user',
      content: [{ type: 'text', text: 'oi' }],
    },
  })

  child.stdin.write(`${input}\n`)
  child.stdin.end()

  const lines = await linesPromise

  assert.equal(lines[0].type, 'system')
  assert.equal(typeof lines[0].session_id, 'string')

  const textDeltas = lines.filter(
    (l) => l.type === 'stream_event' && l.event?.delta?.type === 'text_delta',
  )
  assert.ok(textDeltas.length > 0, 'should emit at least one text delta')

  const result = lines.find((l) => l.type === 'result')
  assert.ok(result, 'should emit a result line')
  assert.equal(typeof result.session_id, 'string')
})

test('fake stream-json agent handles multiple messages in same session', async () => {
  const child = spawnAgent()
  const linesPromise = collectLines(child)

  const msg = (text) =>
    JSON.stringify({
      type: 'user',
      message: { role: 'user', content: [{ type: 'text', text }] },
    })

  child.stdin.write(`${msg('primeiro')}\n`)
  child.stdin.write(`${msg('segundo')}\n`)
  child.stdin.end()

  const lines = await linesPromise

  const systemLines = lines.filter((l) => l.type === 'system')
  assert.equal(systemLines.length, 1, 'system init should only be emitted once')

  const results = lines.filter((l) => l.type === 'result')
  assert.equal(results.length, 2, 'should emit one result per message')
})
