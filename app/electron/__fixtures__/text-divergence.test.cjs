'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { describeDivergence } = require('./text-divergence.cjs')

test('textos iguais não têm divergência', () => {
  assert.equal(describeDivergence('abc', 'abc'), 'textos iguais')
})

test('aponta o índice e escapa controles injetados no meio (o caso do ConPTY)', () => {
  const esperado = 'linha 130\nlinha 131 — padrão de qualidade\nlinha 132\n'
  const recebido = 'linha 130\nlinha 131 — padrão de q\u001b[?9001hualidade\nlinha 132\n'
  const texto = describeDivergence(esperado, recebido)
  assert.match(texto, /índice 33/)
  assert.match(texto, /diferença 8/)
  assert.match(texto, /\\u001b\[\?9001h/)
})

test('acha a divergência quando um lado é prefixo do outro (carga truncada)', () => {
  const texto = describeDivergence('abcdef', 'abc')
  assert.match(texto, /índice 3/)
  assert.match(texto, /diferença -3/)
})
