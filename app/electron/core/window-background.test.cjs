'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { readWindowBackground, registerWindowThemeIpc } = require('./window-background.cjs')

const repo = (valor) => ({ get: () => valor })

test('lê a cor do tema salvo e cai no escuro quando não há tema válido', () => {
  assert.equal(readWindowBackground(repo('light')), '#f3f3f1')
  assert.equal(readWindowBackground(repo('high_contrast')), '#050505')
  assert.equal(readWindowBackground(repo('dark')), '#09090b')
  assert.equal(readWindowBackground(repo('outro')), '#09090b')
  assert.equal(readWindowBackground(undefined), '#09090b')
  assert.equal(readWindowBackground({ get() { throw new Error('x') } }), '#09090b')
})

test('o IPC grava só tema válido e repinta as janelas abertas', () => {
  let handler
  const gravado = []
  const cores = []
  registerWindowThemeIpc({
    ipcMain: { on: (_canal, fn) => { handler = fn } },
    settingsRepository: { set: (k, v) => gravado.push([k, v]) },
    listWindows: () => [{ isDestroyed: () => false, setBackgroundColor: (c) => cores.push(c) }],
  })
  handler({}, 'inválido')
  handler({}, 'constructor')
  assert.deepEqual(gravado, [])
  handler({}, 'light')
  assert.deepEqual(gravado, [['app.theme', 'light']])
  assert.deepEqual(cores, ['#f3f3f1'])
})
