'use strict'
require('./test-support/pasta-do-teste.cjs') // isola o temporário deste arquivo (ver pasta-do-teste.cjs)
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { codificarPasta, configuracaoClaude, escreverConversa, listarConversas, montarCenario } = require('./retomada-e2e-empacotado.cjs')

test('codificarPasta troca tudo que não é letra ou dígito por hífen', () => {
  assert.equal(codificarPasta('/tmp/a b/c.d'), '-tmp-a-b-c-d')
  assert.equal(codificarPasta('C:\\Temp\\x'), 'C--Temp-x')
})

test('configuracaoClaude marca onboarding e confiança de cada pasta', () => {
  const c = configuracaoClaude(['/a', '/b'])
  assert.equal(c.hasCompletedOnboarding, true)
  assert.deepEqual(Object.keys(c.projects), ['/a', '/b'])
  assert.equal(c.projects['/a'].hasTrustDialogAccepted, true)
})

test('escreverConversa grava jsonl datado de dias atrás', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ret-e2e-'))
  const arquivo = escreverConversa({ configDir: dir, cwd: '/x/y', sessionId: 'abc', titulo: 't', diasAtras: 3 })
  assert.deepEqual(listarConversas(dir, '/x/y'), ['abc.jsonl'])
  assert.ok(Date.now() - fs.statSync(arquivo).mtimeMs > 2.9 * 86_400_000)
  assert.equal(JSON.parse(fs.readFileSync(arquivo, 'utf8').trim()).sessionId, 'abc')
  fs.rmSync(dir, { recursive: true, force: true })
})

test('montarCenario cria os cinco cartões; o movido nasceu em outra pasta', () => {
  const ids = { ausente: 'a', disco: 'd', movido: 'm', conta: 'c', gemini: 'g' }
  const nos = montarCenario({ projeto: '/p', movido: '/m', ids })
  assert.equal(nos.length, 5)
  const movido = nos.find((n) => n.id === 'e2e-movido')
  assert.equal(movido.data.cwd, '/m')
  assert.equal(movido.data.agentSession.cwd, '/p')
  assert.equal(nos.find((n) => n.id === 'e2e-gemini').data.agentSession.provider, 'gemini')
})
