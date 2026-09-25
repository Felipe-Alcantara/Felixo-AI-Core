'use strict'

const assert = require('node:assert/strict')
const { test } = require('node:test')
const { NOT_SELECTED, parseManagerSelection } = require('./package-manager-selection.cjs')

const CONHECIDOS = ['npm-runtime', 'pnpm', 'yarn-classic']

test('parseManagerSelection devolve os ids pedidos, sem espaços, na ordem escrita', () => {
  assert.deepEqual(parseManagerSelection('npm-runtime', CONHECIDOS), ['npm-runtime'])
  assert.deepEqual(parseManagerSelection(' yarn-classic, npm-runtime ', CONHECIDOS), ['yarn-classic', 'npm-runtime'])
})

test('parseManagerSelection recusa id desconhecido listando os válidos', () => {
  assert.throws(
    () => parseManagerSelection('npm-runtime,corepack,bun', CONHECIDOS),
    { message: 'Gerenciador desconhecido em --managers: corepack, bun. Válidos: npm-runtime, pnpm, yarn-classic.' },
  )
})

test('parseManagerSelection recusa lista vazia, item vazio e repetição', () => {
  for (const valor of ['', ',', 'pnpm,', ',pnpm', 'pnpm,,npm-runtime', undefined]) {
    assert.throws(() => parseManagerSelection(valor, CONHECIDOS), /--managers precisa listar ids/, String(valor))
  }
  assert.throws(() => parseManagerSelection('pnpm,pnpm', CONHECIDOS), /ids únicos/)
})

test('NOT_SELECTED é o marcador gravado nos relatórios', () => {
  assert.equal(NOT_SELECTED, 'not-selected')
})
