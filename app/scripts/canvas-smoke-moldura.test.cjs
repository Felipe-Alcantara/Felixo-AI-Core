'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const moldura = require('./canvas-smoke-moldura.cjs')

test('todo check exportado entra na lista que a sessão I executa, sem repetição', () => {
  const exportados = Object.keys(moldura).filter((nome) => nome.startsWith('checar')).sort()
  const executados = moldura.CHECKS_DA_MOLDURA.map((check) => check.name).sort()
  assert.deepEqual(executados, exportados)
  assert.equal(new Set(executados).size, executados.length)
  assert.equal(executados.length, 14)
})

test('a sessão I do smoke executa os checks da moldura', () => {
  const smoke = fs.readFileSync(path.join(__dirname, 'canvas-smoke.cjs'), 'utf8')
  assert.match(smoke, /letter: 'I',[\s\S]{0,400}run: \(page\) => executarChecksDaMoldura\(page\)/)
})

test('o inventário cita cada check da moldura (nenhum teste órfão)', () => {
  const dados = fs.readFileSync(path.join(__dirname, '..', 'src/features/canvas/inventory/data/chrome.ts'), 'utf8')
  for (const check of moldura.CHECKS_DA_MOLDURA) {
    assert.ok(dados.includes(`check: '${check.name}'`), `o inventário não cita ${check.name}`)
  }
})
