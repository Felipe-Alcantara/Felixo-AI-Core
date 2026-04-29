const test = require('node:test')
const assert = require('node:assert/strict')
const { createJsonlLineReader } = require('./jsonl-line-reader.cjs')

test('jsonl line reader preserves partial lines between chunks', () => {
  const lines = []
  const reader = createJsonlLineReader((line) => lines.push(line))

  reader.push('{"a":')
  reader.push('1}\n{"b":2')
  reader.flush()

  assert.deepEqual(lines, ['{"a":1}', '{"b":2'])
})

test('jsonl line reader ignores blank lines', () => {
  const lines = []
  const reader = createJsonlLineReader((line) => lines.push(line))

  reader.push('\n\n{"ok":true}\n  \n')
  reader.flush()

  assert.deepEqual(lines, ['{"ok":true}'])
})
