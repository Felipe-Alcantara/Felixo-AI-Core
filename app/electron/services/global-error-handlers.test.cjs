'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { registerGlobalErrorHandlers, wrapIpcHandleWithLogging } = require('./global-error-handlers.cjs')

function fakeLog() {
  const entries = []
  const log = (entry) => entries.push(entry)
  return { log, entries }
}

test('uncaughtException vira uma entrada de log com mensagem e stack, sem derrubar o processo', () => {
  const processObj = new EventEmitter()
  const { log, entries } = fakeLog()
  registerGlobalErrorHandlers({ log, processObj })

  const error = new Error('falha no boot')
  assert.doesNotThrow(() => processObj.emit('uncaughtException', error))

  assert.equal(entries.length, 1)
  assert.equal(entries[0].level, 'error')
  assert.equal(entries[0].scope, 'main:uncaughtException')
  assert.equal(entries[0].message, 'falha no boot')
  assert.match(entries[0].details.stack, /Error: falha no boot/)
})

test('uncaughtException carrega error.cause quando a causa raiz foi encadeada', () => {
  const processObj = new EventEmitter()
  const { log, entries } = fakeLog()
  registerGlobalErrorHandlers({ log, processObj })

  const causa = new Error('banco corrompido')
  const erro = new Error('falha ao abrir storage', { cause: causa })
  processObj.emit('uncaughtException', erro)

  assert.equal(entries[0].details.cause, 'banco corrompido')
})

test('unhandledRejection loga mesmo quando o motivo não é um Error', () => {
  const processObj = new EventEmitter()
  const { log, entries } = fakeLog()
  registerGlobalErrorHandlers({ log, processObj })

  processObj.emit('unhandledRejection', 'string de rejeição')

  assert.equal(entries[0].scope, 'main:unhandledRejection')
  assert.equal(entries[0].message, 'string de rejeição')
})

test('render-process-gone loga o motivo do Chromium sem lançar quando webContents já foi destruído', () => {
  const electronApp = new EventEmitter()
  const { log, entries } = fakeLog()
  registerGlobalErrorHandlers({ log, processObj: new EventEmitter(), electronApp })

  const webContents = { isDestroyed: () => true }
  electronApp.emit('render-process-gone', {}, webContents, { reason: 'crashed', exitCode: 11 })

  assert.equal(entries[0].scope, 'main:render-process-gone')
  assert.match(entries[0].message, /crashed/)
  assert.equal(entries[0].details.reason, 'crashed')
  assert.equal(entries[0].details.exitCode, 11)
  assert.equal(entries[0].details.webContentsId, null)
})

test('child-process-gone loga tipo, motivo e nome do processo auxiliar', () => {
  const electronApp = new EventEmitter()
  const { log, entries } = fakeLog()
  registerGlobalErrorHandlers({ log, processObj: new EventEmitter(), electronApp })

  electronApp.emit('child-process-gone', {}, { type: 'Utility', reason: 'killed', name: 'network' })

  assert.equal(entries[0].scope, 'main:child-process-gone')
  assert.match(entries[0].message, /Utility/)
  assert.match(entries[0].message, /killed/)
  assert.equal(entries[0].details.name, 'network')
})

test('registerGlobalErrorHandlers sem electronApp não registra os handlers de processo do Electron (não lança)', () => {
  const processObj = new EventEmitter()
  const { log } = fakeLog()
  assert.doesNotThrow(() => registerGlobalErrorHandlers({ log, processObj }))
})

test('wrapIpcHandleWithLogging loga canal e causa quando o handler lança, e ainda rejeita pro invoker', async () => {
  const { log, entries } = fakeLog()
  const registered = {}
  const ipcMainFake = { handle: (channel, listener) => { registered[channel] = listener } }

  wrapIpcHandleWithLogging(ipcMainFake, log)
  ipcMainFake.handle('canvas:save', async () => {
    throw new Error('disco cheio', { cause: new Error('ENOSPC') })
  })

  await assert.rejects(() => registered['canvas:save']({}), /disco cheio/)

  assert.equal(entries.length, 1)
  assert.equal(entries[0].scope, 'main:ipc')
  assert.match(entries[0].message, /canvas:save/)
  assert.match(entries[0].message, /disco cheio/)
  assert.equal(entries[0].details.channel, 'canvas:save')
  assert.equal(entries[0].details.cause, 'ENOSPC')
})

test('wrapIpcHandleWithLogging não loga nem interfere quando o handler resolve normalmente', async () => {
  const { log, entries } = fakeLog()
  const registered = {}
  const ipcMainFake = { handle: (channel, listener) => { registered[channel] = listener } }

  wrapIpcHandleWithLogging(ipcMainFake, log)
  ipcMainFake.handle('canvas:save', async () => ({ ok: true }))

  const result = await registered['canvas:save']({})

  assert.deepEqual(result, { ok: true })
  assert.equal(entries.length, 0)
})

test('wrapIpcHandleWithLogging devolve uma função que restaura o handle original', () => {
  const originalHandle = () => {}
  const ipcMainFake = { handle: originalHandle }

  const restore = wrapIpcHandleWithLogging(ipcMainFake, () => {})
  assert.notEqual(ipcMainFake.handle, originalHandle)

  restore()
  assert.equal(ipcMainFake.handle, originalHandle)
})
