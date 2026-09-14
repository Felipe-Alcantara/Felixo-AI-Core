'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { prepararEscrita, TIPOS_COM_ESCRITA } = require('./canvas-agent-write.cjs')

test('TIPOS_COM_ESCRITA só aceita note nesta fatia', () => {
  assert.deepEqual([...TIPOS_COM_ESCRITA], ['note'])
})

test('prepararEscrita: id inexistente devolve ok:false com mensagem clara', () => {
  const resultado = prepararEscrita({ id: 'nao-existe', nodes: [], conteudo: 'x' })
  assert.equal(resultado.ok, false)
  assert.match(resultado.message, /Nenhum elemento com id/)
})

test('prepararEscrita: tipo sem suporte a escrita (ex.: terminal) devolve ok:false', () => {
  const nodes = [{ id: 't1', type: 'terminal', data: {} }]
  const resultado = prepararEscrita({ id: 't1', nodes, conteudo: 'x' })
  assert.equal(resultado.ok, false)
  assert.match(resultado.message, /ainda não aceitam escrita/)
})

test('prepararEscrita: nota troca data.text preservando o resto de data', () => {
  const nodes = [{ id: 'n1', type: 'note', data: { text: 'antigo', orderIndex: 3, label: 'Minha nota' } }]
  const resultado = prepararEscrita({ id: 'n1', nodes, conteudo: 'novo conteúdo' })
  assert.equal(resultado.ok, true)
  assert.equal(resultado.node.id, 'n1')
  assert.deepEqual(resultado.novaData, { text: 'novo conteúdo', orderIndex: 3, label: 'Minha nota' })
})

test('prepararEscrita: conteúdo vazio é um pedido válido (limpar a nota)', () => {
  const nodes = [{ id: 'n1', type: 'note', data: { text: 'antigo' } }]
  const resultado = prepararEscrita({ id: 'n1', nodes, conteudo: '' })
  assert.equal(resultado.ok, true)
  assert.equal(resultado.novaData.text, '')
})
