'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const { shouldQuitWhenAllWindowsClosed } = require('./app-lifecycle.cjs')

test('macOS empacotado mantém o app no Dock', () => {
  assert.equal(
    shouldQuitWhenAllWindowsClosed({ platformName: 'darwin', isDevelopment: false }),
    false,
  )
})

test('macOS em desenvolvimento encerra Electron ao fechar a última janela', () => {
  assert.equal(
    shouldQuitWhenAllWindowsClosed({ platformName: 'darwin', isDevelopment: true }),
    true,
  )
})

test('Linux e Windows continuam encerrando ao fechar a última janela', () => {
  assert.equal(
    shouldQuitWhenAllWindowsClosed({ platformName: 'linux', isDevelopment: false }),
    true,
  )
  assert.equal(
    shouldQuitWhenAllWindowsClosed({ platformName: 'win32', isDevelopment: false }),
    true,
  )
})
test('no --release-smoke quem encerra é o smoke: fechar a janela oculta da CSP não derruba o PTY', () => {
  for (const platformName of ['win32', 'linux', 'darwin']) {
    assert.equal(
      shouldQuitWhenAllWindowsClosed({ platformName, isDevelopment: false, isReleaseSmoke: true }),
      false,
      platformName,
    )
  }
})
