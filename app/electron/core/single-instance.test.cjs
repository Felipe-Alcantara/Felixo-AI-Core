'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { claimSingleInstance, fileFromArgv } = require('./single-instance.cjs')

const EXTENSIONS = new Set(['.fxai', '.fxchat', '.fxworkflow'])

function fakeApp(lock) {
  const events = []
  const listeners = new Map()
  return {
    events,
    listeners,
    requestSingleInstanceLock: () => { events.push('request-lock'); return lock },
    exit: (code) => events.push(`exit ${code}`),
    on: (name, listener) => { events.push(`on ${name}`); listeners.set(name, listener) },
  }
}

test('sem a trava, a segunda abertura sai na hora e não escuta nada', () => {
  const app = fakeApp(false)
  const result = claimSingleInstance({ app, onSecondInstance: () => assert.fail('não deveria encaminhar') })
  assert.equal(result, false)
  assert.deepEqual(app.events, ['request-lock', 'exit 0'])
})

test('com a trava, cada nova abertura chega com o argv e a pasta de origem', () => {
  const app = fakeApp(true)
  const aberturas = []
  assert.equal(claimSingleInstance({ app, onSecondInstance: (abertura) => aberturas.push(abertura) }), true)
  assert.deepEqual(app.events, ['request-lock', 'on second-instance'])

  app.listeners.get('second-instance')({}, ['felixo.exe', 'projeto.fxai'], 'C:\\Users\\ana')
  assert.deepEqual(aberturas, [{ argv: ['felixo.exe', 'projeto.fxai'], workingDirectory: 'C:\\Users\\ana' }])
})

test('o arquivo da segunda abertura é achado entre os switches e resolvido na pasta de origem', () => {
  const pasta = path.resolve('pasta-da-pessoa')
  assert.equal(
    fileFromArgv(['felixo', '--allow-file-access-from-files', 'docs/Plano.FXAI'], pasta, EXTENSIONS),
    path.resolve(pasta, 'docs/Plano.FXAI'),
  )
  const absoluto = path.resolve('outra', 'conversa.fxchat')
  assert.equal(fileFromArgv(['felixo', absoluto], pasta, EXTENSIONS), absoluto)
})

test('sem arquivo suportado, a segunda abertura só pede a janela', () => {
  assert.equal(fileFromArgv(['felixo', '--inspect', 'leia-me.md'], '/tmp', EXTENSIONS), null)
  assert.equal(fileFromArgv(undefined, '/tmp', EXTENSIONS), null)
})
