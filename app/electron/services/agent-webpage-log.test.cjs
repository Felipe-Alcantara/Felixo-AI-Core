'use strict'
require('../../scripts/test-support/pasta-do-teste.cjs') // isola o temporário deste arquivo (ver pasta-do-teste.cjs)

const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')

const { LIMITE, lerLogs, observarPagina } = require('./agent-webpage-log.cjs')
const { inspecionarPagina } = require('./agent-webpage-inspect.cjs')
const { normalizarPedido } = require('./fetch-all/agent-requests.cjs')

function paginaFalsa(url = 'https://exemplo.test/') {
  const wc = new EventEmitter()
  wc.getURL = () => url
  return wc
}

test('guarda console, navegação e falha de carga na ordem em que acontecem', () => {
  const wc = paginaFalsa()
  observarPagina(wc)
  wc.emit('console-message', { level: 3, message: 'quebrou', lineNumber: 7, sourceId: 'https://exemplo.test/app.js' })
  wc.emit('did-navigate', {}, 'https://exemplo.test/b')
  wc.emit('did-fail-load', {}, -105, 'ERR_NAME_NOT_RESOLVED', 'https://nao-existe.test/')

  const { entradas, total } = lerLogs(wc)
  assert.equal(total, 3)
  assert.deepEqual(
    entradas.map((entrada) => [entrada.tipo, entrada.nivel, entrada.texto, entrada.url]),
    [
      ['console', 'error', 'quebrou', undefined],
      ['navegacao', undefined, undefined, 'https://exemplo.test/b'],
      ['erro-de-carga', undefined, 'ERR_NAME_NOT_RESOLVED', 'https://nao-existe.test/'],
    ],
  )
})

test('aceita também o formato antigo do evento de console (argumentos soltos)', () => {
  const wc = paginaFalsa()
  observarPagina(wc)
  wc.emit('console-message', {}, 1, 'olá', 3, 'https://exemplo.test/x.js')

  assert.deepEqual(lerLogs(wc).entradas.map((entrada) => [entrada.nivel, entrada.texto]), [['info', 'olá']])
})

test('guarda só as últimas entradas e conta o total', () => {
  const wc = paginaFalsa()
  observarPagina(wc)
  for (let i = 0; i < LIMITE + 30; i += 1) wc.emit('did-navigate', {}, `https://exemplo.test/${i}`)

  const { entradas, total } = lerLogs(wc)
  assert.equal(entradas.length, LIMITE)
  assert.equal(total, LIMITE + 30)
  assert.equal(entradas.at(-1).url, `https://exemplo.test/${LIMITE + 29}`)
})

test('redige segredo no texto e na query dos endereços antes de entregar', () => {
  const wc = paginaFalsa()
  observarPagina(wc)
  wc.emit('console-message', { level: 1, message: 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz0123456789', lineNumber: 1, sourceId: '' })
  wc.emit('did-navigate', {}, 'https://exemplo.test/cb?code=segredo123456&ok=1')

  const texto = JSON.stringify(lerLogs(wc))
  assert.doesNotMatch(texto, /abcdefghijklmnopqrstuvwxyz0123456789/)
  assert.doesNotMatch(texto, /segredo123456/)
  assert.match(texto, /ok=1/)
})

test('página que nunca foi observada devolve lista vazia, e observar duas vezes não duplica ouvintes', () => {
  assert.deepEqual(lerLogs(paginaFalsa()).entradas, [])
  const wc = paginaFalsa()
  observarPagina(wc)
  observarPagina(wc)
  wc.emit('did-navigate', {}, 'https://exemplo.test/')
  assert.equal(lerLogs(wc).entradas.length, 1)
})

test('inspecionarPagina com tipo logs devolve as entradas redigidas e o endereço sem segredo', async () => {
  const wc = paginaFalsa('https://exemplo.test/p?token=abcdef1234567890')
  observarPagina(wc)
  wc.emit('console-message', { level: 2, message: 'aviso', lineNumber: 2, sourceId: '' })

  const resultado = await inspecionarPagina({ guest: wc, tipo: 'logs', pastaCapturas: '', idDoPedido: 'x' })
  assert.equal(resultado.ok, true)
  assert.equal(resultado.tipo, 'logs')
  assert.doesNotMatch(resultado.url, /abcdef1234567890/)
  assert.equal(resultado.entradas[0].nivel, 'warning')
})

test('o repositório de pedidos aceita o tipo logs e recusa o que não é inspeção', () => {
  assert.equal(normalizarPedido('pagina-inspecionar', { idDoElemento: 'web-1', tipo: 'logs' }).tipo, 'logs')
  assert.throws(() => normalizarPedido('pagina-inspecionar', { idDoElemento: 'web-1', tipo: 'cookies' }), /não reconhecido/)
})
