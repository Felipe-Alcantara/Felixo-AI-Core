const test = require('node:test')
const assert = require('node:assert/strict')
const { createJsonlOutputGuard } = require('./jsonl-output-guard.cjs')

test('jsonl output guard waits through leading blank chunks', () => {
  const jsonChunks = []
  const nonJsonOutputs = []
  const guard = createJsonlOutputGuard(
    (chunk) => jsonChunks.push(chunk),
    (output) => nonJsonOutputs.push(output),
  )

  guard.push('\n')
  guard.push('{"type":"result"}\n')

  assert.deepEqual(jsonChunks, ['\n{"type":"result"}\n'])
  assert.deepEqual(nonJsonOutputs, [])
})

test('jsonl output guard reports non-json output after leading whitespace', () => {
  const jsonChunks = []
  const nonJsonOutputs = []
  const guard = createJsonlOutputGuard(
    (chunk) => jsonChunks.push(chunk),
    (output) => nonJsonOutputs.push(output),
  )

  guard.push('\n')
  guard.push('Opening authentication page in your browser.')

  assert.deepEqual(jsonChunks, [])
  assert.deepEqual(nonJsonOutputs, [
    '\nOpening authentication page in your browser.',
  ])
})

test('jsonl output guard forwards later chunks after a json start', () => {
  const jsonChunks = []
  const nonJsonOutputs = []
  const guard = createJsonlOutputGuard(
    (chunk) => jsonChunks.push(chunk),
    (output) => nonJsonOutputs.push(output),
  )

  guard.push('{"type":"init"}\n')
  guard.push('{"type":"result"}\n')

  assert.deepEqual(jsonChunks, ['{"type":"init"}\n', '{"type":"result"}\n'])
  assert.deepEqual(nonJsonOutputs, [])
})
