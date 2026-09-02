const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const {
  WINDOW_FOCUS_CHANNEL,
  registerWindowFocusBridge,
} = require('./window-focus-bridge.cjs')

function criarJanela() {
  const browserWindow = new EventEmitter()
  const mensagens = []
  browserWindow.webContents = {
    send: (channel, payload) => mensagens.push({ channel, payload }),
  }
  browserWindow.isDestroyed = () => false
  return { browserWindow, mensagens }
}

test('encaminha focus e blur nativos para o renderer', () => {
  const { browserWindow, mensagens } = criarJanela()

  registerWindowFocusBridge(browserWindow)
  browserWindow.emit('blur')
  browserWindow.emit('focus')

  assert.deepEqual(mensagens, [
    { channel: WINDOW_FOCUS_CHANNEL, payload: false },
    { channel: WINDOW_FOCUS_CHANNEL, payload: true },
  ])
})

test('não envia depois que a janela foi destruída', () => {
  const { browserWindow, mensagens } = criarJanela()
  browserWindow.isDestroyed = () => true

  registerWindowFocusBridge(browserWindow)
  browserWindow.emit('blur')
  browserWindow.emit('focus')

  assert.deepEqual(mensagens, [])
})

test('remove os listeners ao descartar a ponte', () => {
  const { browserWindow, mensagens } = criarJanela()
  const parar = registerWindowFocusBridge(browserWindow)

  parar()
  browserWindow.emit('blur')
  browserWindow.emit('focus')

  assert.deepEqual(mensagens, [])
})
