'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { createDesktopAttention } = require('./desktop-attention.cjs')

function setup({ platform = 'win32', focused = false, supported = true } = {}) {
  const calls = []
  const sent = []
  const win = Object.assign(new EventEmitter(), {
    isDestroyed: () => false,
    isFocused: () => focused,
    isMinimized: () => true,
    restore: () => calls.push('restore'),
    show: () => calls.push('show'),
    focus: () => calls.push('focus'),
    flashFrame: (on) => calls.push(`flash:${on}`),
    webContents: { send: (channel, payload) => sent.push([channel, payload]) },
  })
  const shown = []
  class FakeNotification extends EventEmitter {
    static isSupported() { return supported }
    constructor(options) { super(); this.options = options }
    show() { shown.push(this) }
  }
  const app = {
    dock: { bounce: (kind) => calls.push(`bounce:${kind}`) },
    setBadgeCount: (n) => calls.push(`badge:${n}`),
  }
  const attention = createDesktopAttention({ app, Notification: FakeNotification, getMainWindow: () => win, platform })
  return { attention, calls, sent, shown, win }
}

test('fora de foco: notifica, pisca e o clique traz o app e abre o agente', () => {
  const { attention, calls, sent, shown, win } = setup()
  const result = attention.notify({ title: 'Precisa de resposta', body: 'Agente 1', nodeId: 'n1' })
  assert.deepEqual(result, { shown: true, flashed: true })
  assert.equal(shown[0].options.body, 'Agente 1')
  assert.ok(calls.includes('flash:true'))
  shown[0].emit('click')
  assert.deepEqual(calls.slice(-3), ['restore', 'show', 'focus'])
  assert.deepEqual(sent, [['desktop-attention:open', { nodeId: 'n1' }]])
  win.emit('focus')
  assert.ok(calls.includes('flash:false'))
})

test('janela em foco: não faz nada', () => {
  const { attention, calls, shown } = setup({ focused: true })
  assert.deepEqual(attention.notify({ title: 'x', body: 'y' }), { shown: false })
  assert.equal(shown.length, 0)
  assert.equal(calls.length, 0)
})

test('sem suporte a notificação: ainda chama a atenção na barra de tarefas', () => {
  const { attention, calls } = setup({ supported: false })
  assert.deepEqual(attention.notify({ title: 'x', body: 'y' }), { shown: false, flashed: true })
  assert.ok(calls.includes('flash:true'))
})

test('macOS: salta o Dock e mostra o número de não lidas', () => {
  const { attention, calls } = setup({ platform: 'darwin' })
  attention.notify({ title: 'x', body: 'y' })
  attention.setUnread(3.7)
  attention.setUnread(-4)
  assert.ok(calls.includes('bounce:informational'))
  assert.ok(!calls.includes('flash:true'))
  assert.deepEqual(calls.filter((c) => c.startsWith('badge')), ['badge:3', 'badge:0'])
})

test('texto longo é cortado e número inválido vira 0', () => {
  const { attention, shown } = setup()
  attention.notify({ title: 'a'.repeat(500), body: 'b' })
  assert.equal(shown[0].options.title.length, 140)
  assert.deepEqual(attention.setUnread('x'), { count: 0 })
})
