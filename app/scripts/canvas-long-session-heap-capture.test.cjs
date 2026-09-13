'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { parseArgs } = require('./canvas-long-session-heap-capture.cjs')

test('parseArgs aplica os padrões e aceita cada opção no formato --chave=valor', () => {
  assert.deepEqual(parseArgs(['--out-dir=/tmp/x']), {
    terminals: 6, webviews: 2, durationMinutes: 30, sampleIntervalMs: 60_000, outDir: '/tmp/x',
  })
  assert.deepEqual(
    parseArgs(['--terminals=10', '--webviews=3', '--duration-minutes=60', '--sample-interval-ms=15000', '--out-dir=/tmp/y']),
    { terminals: 10, webviews: 3, durationMinutes: 60, sampleIntervalMs: 15000, outDir: '/tmp/y' },
  )
})

test('parseArgs exige --out-dir', () => {
  assert.throws(() => parseArgs(['--terminals=1']), /--out-dir/)
})

test('parseArgs rejeita --terminals/--webviews negativos ou não inteiros', () => {
  assert.throws(() => parseArgs(['--out-dir=/tmp/x', '--terminals=-1']), /--terminals/)
  assert.throws(() => parseArgs(['--out-dir=/tmp/x', '--webviews=1.5']), /--webviews/)
})

test('parseArgs rejeita opção desconhecida', () => {
  assert.throws(() => parseArgs(['--out-dir=/tmp/x', '--bogus=1']), /Opção desconhecida/)
})
