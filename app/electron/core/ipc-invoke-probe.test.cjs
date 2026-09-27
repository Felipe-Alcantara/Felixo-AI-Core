'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const { EventEmitter } = require('node:events')

const { installIpcInvokeProbe } = require('./ipc-invoke-probe.cjs')
const { wrapIpcHandleWithLogging } = require('../services/global-error-handlers.cjs')

/**
 * `ipcMain` falso com o mesmo contrato do Electron: `handle` recusa um segundo
 * handler no mesmo canal, `handleOnce` é implementado sobre `handle`, e `on`,
 * `once` e `removeListener` vêm do EventEmitter do Node.
 */
class FakeIpcMain extends EventEmitter {
  constructor() {
    super()
    this.handlers = new Map()
  }

  handle(channel, listener) {
    if (this.handlers.has(channel)) throw new Error(`Attempted to register a second handler for '${channel}'`)
    this.handlers.set(channel, listener)
  }

  handleOnce(channel, listener) {
    this.handle(channel, (event, ...args) => {
      this.removeHandler(channel)
      return listener(event, ...args)
    })
  }

  removeHandler(channel) {
    this.handlers.delete(channel)
  }

  /** O que o `ipcRenderer.invoke` faz do outro lado: chama o handler registrado. */
  async invoke(channel, ...args) {
    const handler = this.handlers.get(channel)
    if (!handler) throw new Error(`No handler registered for '${channel}'`)
    return handler({ sender: 'renderer' }, ...args)
  }

  /** O que o `ipcRenderer.send` faz: emite o evento do canal. */
  send(channel, ...args) {
    this.emit(channel, { sender: 'renderer' }, ...args)
  }
}

test('conta invocações por canal em handle e em on, e não conta o registro', async () => {
  const ipcMain = new FakeIpcMain()
  const probe = installIpcInvokeProbe(ipcMain)
  ipcMain.handle('pty:spawn', () => 'ok')
  ipcMain.handle('onboarding:read', () => ({ ok: true }))
  ipcMain.on('janela:foco', () => {})

  assert.deepEqual({ ...probe.snapshot() }, {})

  await ipcMain.invoke('onboarding:read')
  await ipcMain.invoke('onboarding:read')
  await ipcMain.invoke('pty:spawn')
  ipcMain.send('janela:foco')

  assert.deepEqual({ ...probe.snapshot() }, { 'janela:foco': 1, 'onboarding:read': 2, 'pty:spawn': 1 })
  assert.deepEqual(Object.keys(probe.snapshot()), ['janela:foco', 'onboarding:read', 'pty:spawn'])
})

test('preserva o retorno (síncrono e assíncrono), os argumentos e o this do handler', async () => {
  const ipcMain = new FakeIpcMain()
  installIpcInvokeProbe(ipcMain)
  const receivedThis = []
  ipcMain.handle('sincrono', function handler(event, a, b) {
    receivedThis.push(this)
    return { event: event.sender, soma: a + b }
  })
  ipcMain.handle('assincrono', async (_event, value) => ({ dobro: value * 2 }))
  const onReceived = []
  ipcMain.on('mensagem', function listener(event, value) {
    onReceived.push({ self: this, value, sender: event.sender })
  })

  assert.deepEqual(await ipcMain.invoke('sincrono', 2, 3), { event: 'renderer', soma: 5 })
  assert.deepEqual(await ipcMain.invoke('assincrono', 21), { dobro: 42 })
  ipcMain.send('mensagem', 'x')
  assert.deepEqual(onReceived, [{ self: ipcMain, value: 'x', sender: 'renderer' }])
  // O handler de `handle` é chamado como função solta pelo Electron; a sonda não inventa um `this`.
  assert.deepEqual(receivedThis, [undefined])
})

test('preserva a exceção síncrona e a rejeição, e conta a invocação mesmo assim', async () => {
  const ipcMain = new FakeIpcMain()
  const probe = installIpcInvokeProbe(ipcMain)
  const boom = new Error('falhou de verdade')
  ipcMain.handle('lanca', () => {
    throw boom
  })
  ipcMain.handle('rejeita', async () => {
    throw new TypeError('rejeitado')
  })

  await assert.rejects(ipcMain.invoke('lanca'), (error) => error === boom)
  await assert.rejects(ipcMain.invoke('rejeita'), { name: 'TypeError', message: 'rejeitado' })
  assert.deepEqual({ ...probe.snapshot() }, { lanca: 1, rejeita: 1 })
})

test('o snapshot é imutável e não muda com invocações posteriores', async () => {
  const ipcMain = new FakeIpcMain()
  const probe = installIpcInvokeProbe(ipcMain)
  ipcMain.handle('canal', () => null)
  await ipcMain.invoke('canal')

  const first = probe.snapshot()
  assert.equal(Object.isFrozen(first), true)
  assert.throws(() => {
    first.canal = 99
  }, TypeError)
  assert.throws(() => {
    first.novo = 1
  }, TypeError)

  await ipcMain.invoke('canal')
  assert.equal(first.canal, 1)
  assert.equal(probe.snapshot().canal, 2)
})

test('handleOnce e once passam pela sonda, e removeListener com o listener original funciona', async () => {
  const ipcMain = new FakeIpcMain()
  const probe = installIpcInvokeProbe(ipcMain)
  ipcMain.handleOnce('uma-vez', () => 'primeira')
  assert.equal(await ipcMain.invoke('uma-vez'), 'primeira')
  await assert.rejects(ipcMain.invoke('uma-vez'), /No handler/)

  let calls = 0
  ipcMain.once('evento-unico', () => {
    calls += 1
  })
  ipcMain.send('evento-unico')
  ipcMain.send('evento-unico')
  assert.equal(calls, 1)

  const listener = () => {
    calls += 10
  }
  ipcMain.on('removivel', listener)
  ipcMain.removeListener('removivel', listener)
  ipcMain.send('removivel')
  assert.equal(calls, 1)
  assert.equal(ipcMain.listenerCount('removivel'), 0)

  assert.deepEqual({ ...probe.snapshot() }, { 'evento-unico': 1, 'uma-vez': 1 })
})

test('mantém o contrato do Electron: segundo handler no mesmo canal continua recusado', () => {
  const ipcMain = new FakeIpcMain()
  installIpcInvokeProbe(ipcMain)
  ipcMain.handle('duplicado', () => null)
  assert.throws(() => ipcMain.handle('duplicado', () => null), /second handler/)
})

test('empilhada sobre o log de erros do main: conta uma vez e o erro continua registrado e propagado', async () => {
  const ipcMain = new FakeIpcMain()
  const logged = []
  const restoreLogging = wrapIpcHandleWithLogging(ipcMain, (entry) => logged.push(entry))
  const probe = installIpcInvokeProbe(ipcMain)
  ipcMain.handle('onboarding:write', () => {
    throw new Error('sqlite ocupado')
  })
  ipcMain.handle('onboarding:read', () => ({ ok: true }))

  assert.deepEqual(await ipcMain.invoke('onboarding:read'), { ok: true })
  await assert.rejects(ipcMain.invoke('onboarding:write'), /sqlite ocupado/)
  assert.deepEqual({ ...probe.snapshot() }, { 'onboarding:read': 1, 'onboarding:write': 1 })
  assert.equal(logged.length, 1)
  assert.equal(logged[0].details.channel, 'onboarding:write')

  probe.uninstall()
  restoreLogging()
})

test('uninstall devolve os métodos originais', () => {
  const ipcMain = new FakeIpcMain()
  const originalHandle = ipcMain.handle
  const originalOn = ipcMain.on
  const probe = installIpcInvokeProbe(ipcMain)
  assert.notEqual(ipcMain.handle, originalHandle)
  assert.notEqual(ipcMain.on, originalOn)
  probe.uninstall()
  assert.equal(ipcMain.handle, originalHandle)
  assert.equal(ipcMain.on, originalOn)
})

test('contrato do main: a sonda só existe com porta de depuração válida e chega ao main-eval só com snapshot', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'main.cjs'), 'utf8')
  const install = source.indexOf('installIpcInvokeProbe(ipcMain)')
  const firstHandle = source.indexOf('ipcMain.handle(')
  assert.ok(install > 0, 'main.cjs instala a sonda')
  assert.ok(install < firstHandle, 'a sonda é instalada antes do primeiro ipcMain.handle do main')
  assert.match(
    source,
    /const ipcProbe =\s*Number\.isInteger\(devtoolsPort\) && devtoolsPort > 0 && devtoolsPort <= 65535\s*\?\s*installIpcInvokeProbe\(ipcMain\)\s*:\s*null/,
  )
  assert.match(source, /Object\.freeze\(\{ snapshot: \(\) => ipcProbe\.snapshot\(\) \}\)/)
  assert.match(source, /\{ app, BrowserWindow, mainWindow, ipcProbe: probeView \}/)
})
