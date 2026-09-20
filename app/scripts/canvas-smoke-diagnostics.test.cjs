const test = require('node:test')
const assert = require('node:assert/strict')
const { diagnosticarMontagem } = require('./canvas-smoke-diagnostics.cjs')

test('canvas montado mas ainda carregando é APP LENTO, não bug', () => {
  const msg = diagnosticarMontagem({ rootPresent: true, hydrated: 'false', status: 'Carregando canvas…' }, 45000)
  assert.match(msg, /APP LENTO/)
  assert.match(msg, /45000 ms/)
  assert.match(msg, /Carregando canvas/)
})

test('sem a árvore do canvas é APP NÃO MONTOU', () => {
  const msg = diagnosticarMontagem({ rootPresent: false, hydrated: null, status: '' }, 20000)
  assert.match(msg, /APP NÃO MONTOU/)
  assert.doesNotMatch(msg, /LENTO/)
})
