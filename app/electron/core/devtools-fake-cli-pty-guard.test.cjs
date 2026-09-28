'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const FAKE_MODULE_PATH = path.join(__dirname, '..', 'services', 'devtools-fake-cli-pty.cjs')
const isFakeModuleLoaded = () => Boolean(require.cache[FAKE_MODULE_PATH])

// Antes de qualquer outro require deste arquivo: carregar a guarda não pode
// carregar o PTY roteirizado.
const { isFakeCliPtyRequested, loadDevtoolsFakeCliPty } = require('./devtools-fake-cli-pty-guard.cjs')

const FLAG = { FELIXO_DEVTOOLS_FAKE_CLI_PTY: '1' }

test('carregar a guarda não carrega o PTY roteirizado', () => {
  assert.equal(isFakeModuleLoaded(), false)
})

test('app normal (sem porta de depuração válida): nunca, nem com a flag', () => {
  for (const devtoolsPort of [Number.NaN, undefined, null, '', 'abc', 0, -1, 70000, 1.5]) {
    assert.equal(isFakeCliPtyRequested({ env: FLAG, devtoolsPort }), false, String(devtoolsPort))
  }
  assert.equal(isFakeCliPtyRequested(), false)
})

test('instância de automação sem pedido explícito continua com o node-pty', () => {
  for (const value of [undefined, '', '0', 'true', ' 1', 'yes']) {
    assert.equal(
      isFakeCliPtyRequested({ env: { FELIXO_DEVTOOLS_FAKE_CLI_PTY: value }, devtoolsPort: 9333 }),
      false,
      String(value),
    )
  }
})

test('porta válida + FELIXO_DEVTOOLS_FAKE_CLI_PTY=1: PTY roteirizado', () => {
  assert.equal(isFakeCliPtyRequested({ env: FLAG, devtoolsPort: 9333 }), true)
  assert.equal(isFakeCliPtyRequested({ env: FLAG, devtoolsPort: '9333' }), true)
})

test('loader: fora da guarda devolve null sem tocar no módulo', () => {
  let loads = 0
  const load = () => {
    loads += 1
    return {}
  }

  assert.equal(loadDevtoolsFakeCliPty({ env: FLAG, devtoolsPort: Number.NaN, load }), null)
  assert.equal(loadDevtoolsFakeCliPty({ env: {}, devtoolsPort: 9333, load }), null)
  assert.equal(loadDevtoolsFakeCliPty({ env: FLAG, devtoolsPort: Number.NaN }), null)
  assert.equal(loads, 0)
  assert.equal(isFakeModuleLoaded(), false, 'o carregador padrão também não foi chamado')

  const fake = { marca: 'roteiro' }
  assert.equal(loadDevtoolsFakeCliPty({ env: FLAG, devtoolsPort: 9333, load: () => fake }), fake)
})

test('loader padrão, dentro da guarda, carrega o módulo de verdade', () => {
  const loaded = loadDevtoolsFakeCliPty({ env: FLAG, devtoolsPort: 9333 })

  assert.equal(isFakeModuleLoaded(), true)
  assert.equal(typeof loaded.createFakeCliPtyFactory, 'function')
  assert.equal(typeof loaded.createFakeAuthCommandRunner, 'function')
})

test('contrato do main: o PTY roteirizado só entra pela guarda, com a porta e o ambiente do processo', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'main.cjs'), 'utf8')

  assert.doesNotMatch(
    source,
    /require\([^)]*devtools-fake-cli-pty\.cjs/,
    'o main não importa o módulo direto; só pela guarda',
  )
  assert.match(
    source,
    /const devtoolsFakeCliPty = loadDevtoolsFakeCliPty\(\{ env: process\.env, devtoolsPort \}\)/,
  )
  assert.match(
    source,
    /new PtyProcessManager\(\{\s*spawnPty: devtoolsFakeCliPty\?\.createFakeCliPtyFactory\(\),/,
    'sem a guarda, spawnPty fica undefined e o manager usa o node-pty',
  )
})
