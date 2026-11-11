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

test('jsonl line reader junta CRLF partido entre pedaços e várias linhas num pedaço só', () => {
  const lines = []
  const reader = createJsonlLineReader((line) => lines.push(line))

  reader.push('{"a":1}\r')
  reader.push('\n{"b":')
  reader.push('2}\r\n{"c":3}\n{"d"')
  reader.push(':4}')
  reader.flush()

  assert.deepEqual(lines, ['{"a":1}', '{"b":2}', '{"c":3}', '{"d":4}'])
})

test('jsonl line reader é linear: uma linha de 8 MB em pedaços de 8 KB não refaz o split do pendente', () => {
  // O leitor antigo refazia `buffer.split` do pendente inteiro a cada push: 1.024 pedaços de uma
  // linha só varriam ~4 GB (segundos). Linear, são milissegundos; o teto deixa folga de sobra.
  const text = `${JSON.stringify({ type: 'text', text: 'y'.repeat(8 * 1024 * 1024) })}\n{"fim":true}\n`
  const lines = []
  const reader = createJsonlLineReader((line) => lines.push(line))
  const started = process.hrtime.bigint()
  for (let index = 0; index < text.length; index += 8 * 1024) {
    reader.push(text.slice(index, index + 8 * 1024))
  }
  reader.flush()
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6

  assert.equal(lines.length, 2)
  assert.equal(lines[0].length, text.indexOf('\n'))
  assert.equal(lines[1], '{"fim":true}')
  assert.ok(elapsedMs < 300, `levou ${Math.round(elapsedMs)} ms`)
})
