'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')

const { agirNaPagina } = require('./agent-webpage-act.cjs')
const { normalizarPedido, TECLAS_PAGINA } = require('./fetch-all/agent-requests.cjs')
const { observarPagina, lerLogs } = require('./agent-webpage-log.cjs')

function guestFalso({ focado = { editavel: false }, rolagem = { x: 0, y: 300 } } = {}) {
  const eventos = []
  const codigos = []
  return {
    eventos,
    codigos,
    getURL: () => 'https://exemplo.test/p?token=abcdef1234567890',
    sendInputEvent: (evento) => eventos.push(evento),
    insertText: () => {},
    executeJavaScriptInIsolatedWorld: async (_mundo, [{ code }]) => {
      codigos.push(code)
      return code.includes('scrollBy') ? rolagem : focado
    },
  }
}

test('rolar chama scrollBy no mundo isolado e devolve a posição, sem endereço com segredo', async () => {
  const guest = guestFalso()
  const resultado = await agirNaPagina({ guest, tipo: 'rolar', dy: 300 })

  assert.equal(resultado.ok, true)
  assert.deepEqual(resultado.rolagem, { x: 0, y: 300 })
  assert.match(guest.codigos[0], /scrollBy\(0, 300\)/)
  assert.doesNotMatch(resultado.url, /abcdef1234567890/)
})

test('tecla Enter manda keyDown, char e keyUp; seta usa o nome do Electron', async () => {
  const guest = guestFalso()
  await agirNaPagina({ guest, tipo: 'tecla', tecla: 'Enter' })
  assert.deepEqual(guest.eventos.map((e) => [e.type, e.keyCode]), [['keyDown', 'Enter'], ['char', '\r'], ['keyUp', 'Enter']])

  const outro = guestFalso()
  await agirNaPagina({ guest: outro, tipo: 'tecla', tecla: 'ArrowDown' })
  assert.deepEqual(outro.eventos.map((e) => [e.type, e.keyCode]), [['keyDown', 'Down'], ['keyUp', 'Down']])
})

test('tecla com foco em campo de senha pede confirmação e não aperta nada antes dela', async () => {
  const guest = guestFalso({ focado: { editavel: true, sensivel: 'senha' } })

  const sem = await agirNaPagina({ guest, tipo: 'tecla', tecla: 'Enter' })
  assert.deepEqual(sem, { ok: false, precisaConfirmar: 'senha' })
  assert.deepEqual(guest.eventos, [])

  const com = await agirNaPagina({ guest, tipo: 'tecla', tecla: 'Enter', confirmouCampoSensivel: true })
  assert.equal(com.ok, true)
  assert.equal(com.campoSensivel, 'senha')
  assert.equal(guest.eventos.length, 3)
})

test('o pedido valida dy e só aceita as teclas da lista fechada', () => {
  assert.deepEqual(normalizarPedido('pagina-agir', { idDoElemento: 'web-1', tipo: 'rolar', dy: '-400' }).dy, -400)
  for (const dy of [0, '0.2', 'x', 20001, undefined]) {
    assert.throws(() => normalizarPedido('pagina-agir', { idDoElemento: 'web-1', tipo: 'rolar', dy }), /Informe dy/)
  }
  for (const tecla of TECLAS_PAGINA) {
    assert.equal(normalizarPedido('pagina-agir', { idDoElemento: 'web-1', tipo: 'tecla', tecla }).tecla, tecla)
  }
  for (const tecla of ['Control+C', 'F5', 'Meta', '', undefined]) {
    assert.throws(() => normalizarPedido('pagina-agir', { idDoElemento: 'web-1', tipo: 'tecla', tecla }), /Tecla não permitida/)
  }
})

test('log de rede: guarda método, endereço redigido e status, sem corpo nem cabeçalho', () => {
  const wc = new EventEmitter()
  wc.getURL = () => 'https://exemplo.test/'
  const dbg = new EventEmitter()
  dbg.attach = () => {}
  dbg.sendCommand = async () => ({})
  wc.debugger = dbg
  observarPagina(wc)

  dbg.emit('message', {}, 'Network.requestWillBeSent', { requestId: '1', type: 'Fetch', request: { method: 'POST', url: 'https://api.exemplo.test/x?token=abcdef1234567890', headers: { Authorization: 'Bearer segredo' }, postData: 'senha=1' } })
  dbg.emit('message', {}, 'Network.responseReceived', { requestId: '1', response: { status: 201 } })
  dbg.emit('message', {}, 'Network.requestWillBeSent', { requestId: '2', type: 'Image', request: { method: 'GET', url: 'https://cdn.exemplo.test/a.png' } })
  dbg.emit('message', {}, 'Network.loadingFailed', { requestId: '2', errorText: 'net::ERR_FAILED' })

  const texto = JSON.stringify(lerLogs(wc))
  const rede = lerLogs(wc).entradas.filter((e) => e.tipo === 'rede')
  assert.deepEqual(rede.map((e) => [e.metodo, e.status, e.recurso]), [['POST', 201, 'Fetch'], ['GET', 0, 'Image']])
  assert.doesNotMatch(texto, /abcdef1234567890|segredo|senha=1/)
})

test('se outro debugger já está ligado, o bloco só fica sem log de rede', () => {
  const wc = new EventEmitter()
  wc.debugger = new EventEmitter()
  wc.debugger.attach = () => {
    throw new Error('Another debugger is already attached')
  }
  observarPagina(wc)
  wc.emit('did-navigate', {}, 'https://exemplo.test/')

  assert.equal(lerLogs(wc).entradas.length, 1)
})
