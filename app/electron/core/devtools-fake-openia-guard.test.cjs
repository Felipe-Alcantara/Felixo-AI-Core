'use strict'
require('../../scripts/test-support/pasta-do-teste.cjs') // isola o temporário deste arquivo (ver pasta-do-teste.cjs)

const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

const FAKE_MODULE_PATH = path.join(__dirname, '..', 'services', 'devtools-fake-openia.cjs')
// Antes de qualquer outro require: carregar a guarda não pode carregar o Openia roteirizado.
const { isFakeOpeniaRequested, loadDevtoolsFakeOpenia } = require('./devtools-fake-openia-guard.cjs')

const FLAG = { FELIXO_DEVTOOLS_FAKE_OPENIA: '1' }

test('carregar a guarda não carrega o Openia roteirizado', () => {
  assert.equal(Boolean(require.cache[FAKE_MODULE_PATH]), false)
})

test('app normal (sem porta de depuração válida): nunca, nem com a flag', () => {
  for (const devtoolsPort of [Number.NaN, undefined, null, '', 'abc', 0, -1, 70000, 1.5]) {
    assert.equal(isFakeOpeniaRequested({ env: FLAG, devtoolsPort }), false, String(devtoolsPort))
  }
  assert.equal(isFakeOpeniaRequested(), false)
})

test('instância de automação sem pedido explícito usa o Openia de verdade', () => {
  for (const value of [undefined, '', '0', 'true', ' 1']) {
    assert.equal(isFakeOpeniaRequested({ env: { FELIXO_DEVTOOLS_FAKE_OPENIA: value }, devtoolsPort: 9333 }), false, String(value))
  }
})

test('loader: fora da guarda devolve null sem tocar no módulo; dentro dela carrega', () => {
  let loads = 0
  const load = () => {
    loads += 1
    return { createFakeOpenia: () => ({ roteirizado: true }) }
  }
  assert.equal(loadDevtoolsFakeOpenia({ env: FLAG, devtoolsPort: undefined, load }), null)
  assert.equal(loadDevtoolsFakeOpenia({ env: {}, devtoolsPort: 9333, load }), null)
  assert.equal(loads, 0)
  assert.deepEqual(loadDevtoolsFakeOpenia({ env: FLAG, devtoolsPort: 9333, load }), { roteirizado: true })
  assert.equal(loads, 1)
})

test('Openia roteirizado: catálogo falha uma vez, [saldo] e [antigo] seguem o contrato do serviço', async () => {
  const { createFakeOpenia } = require(FAKE_MODULE_PATH)
  const fake = createFakeOpenia()
  await assert.rejects(fake.fetchCatalog())
  assert.equal((await fake.fetchCatalog()).length, 1)
  const run = (prompt) => fake.runImage({ args: [`--prompt=${prompt}`, '--output-dir', require('node:os').tmpdir()], signal: new AbortController().signal })
  const saldo = await run('[saldo]')
  assert.equal(saldo.exitCode, 5)
  assert.equal(JSON.parse(saldo.stdout).error.code, 'account_limit')
  assert.equal((await run('[antigo]')).exitCode, 2)
  assert.equal(await fake.readVersion(), '0.1.0')
  assert.equal((await fake.installOfficial('openia')).ok, true)
  assert.equal((await run('[antigo]')).ok, true)
  const controller = new AbortController()
  const lento = fake.runImage({ args: ['--prompt=[lento]', '--output-dir', '.'], signal: controller.signal })
  controller.abort()
  assert.equal((await lento).exitCode, 130)
})
