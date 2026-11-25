require('./test-support/pasta-do-teste.cjs') // isola o temporário deste arquivo (ver pasta-do-teste.cjs)
const test = require('node:test')
const assert = require('node:assert/strict')
const { diagnosticarMontagem, descreverEstadoDoShell, descreverDesfecho } = require('./canvas-smoke-diagnostics.cjs')

test('canvas montado mas ainda carregando é APP LENTO, não bug', () => {
  const msg = diagnosticarMontagem({ rootPresent: true, hydrated: 'false', status: 'Carregando canvas…' }, 45000)
  assert.match(msg, /APP LENTO/)
  assert.match(msg, /45000 ms/)
  assert.match(msg, /Carregando canvas/)
})

test('sem a árvore do canvas é APP NÃO MONTOU', () => {
  const msg = diagnosticarMontagem({ rootPresent: false, hydrated: null, status: '' }, 20000)
  assert.match(msg, /APP NÃO MONTOU/)
  assert.doesNotMatch(msg, /LENTO/)
})

test('estado do shell: requisição da CanvasView ausente, pendente e com erro', () => {
  const base = { appReady: 'true', shell: true, loadingText: 'Carregando workspace…', readyState: 'complete' }
  assert.match(descreverEstadoDoShell({ ...base }), /NÃO saiu.*sem erro/)
  assert.match(descreverEstadoDoShell({ ...base, recursos: [{ status: 200, duration: 90, responseEnd: 0 }] }), /200 90 ms \(sem fim\)/)
  const falho = descreverEstadoDoShell({ ...base, appReady: undefined, shell: false, erros: ['boom'] })
  assert.match(falho, /felixoAppReady=ausente; shell=ausente/)
  assert.match(falho, /erros: boom/)
})

test('desfecho da espera estendida: apareceu depois, não apareceu, desligada', () => {
  assert.match(descreverDesfecho(20000, 135000, 180000), /era lentidão/)
  assert.match(descreverDesfecho(20000, 135000, 180000), /65000 ms no total/)
  assert.match(descreverDesfecho(null, 135000, 180000), /travou/)
  assert.match(descreverDesfecho(null, 0, 45000), /desligada/)
})
