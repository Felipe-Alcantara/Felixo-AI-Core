const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { watchBoot } = require('./boot-probe.cjs')

/** Imagem BGRA em que `claros` dos 1000 pixels amostrados (1 a cada 16) são brancos. */
function imagem(claros) {
  const bytes = Buffer.alloc(1000 * 16 * 4)
  for (let i = 0; i < claros; i += 1) bytes.fill(255, i * 64, i * 64 + 4)
  return { toBitmap: () => bytes }
}

function janela({ pronto = true, claros = 20, capturar } = {}) {
  const webContents = new EventEmitter()
  webContents.executeJavaScript = async () => pronto
  webContents.capturePage = capturar ?? (async () => imagem(claros))
  const win = { webContents, recargas: 0, isDestroyed: () => false, isVisible: () => true, isMinimized: () => false }
  webContents.reload = () => { win.recargas += 1 }
  return win
}

async function sondar(win, evento = (wc) => wc.emit('did-finish-load')) {
  const eventos = []
  const pendentes = []
  watchBoot(win, { log: (item) => eventos.push(item), agendar: (tarefa) => pendentes.push(tarefa) })
  evento(win.webContents)
  for (const tarefa of pendentes) await tarefa()
  return eventos
}

const sonda = (eventos) => eventos.find((item) => item.message === 'sonda')

test('abertura que desenhou a interface registra a sonda como informação', async () => {
  const item = sonda(await sondar(janela()))
  assert.equal(item.level, 'info')
  assert.deepEqual([item.details.carga, item.details.pronto, item.details.fracaoClara], [1, true, 0.02])
})

test('renderer pronto mas sem pixel claro vira aviso', async () => {
  const item = sonda(await sondar(janela({ claros: 0 })))
  assert.equal(item.level, 'warn')
  assert.equal(item.details.fracaoClara, 0)
})

test('interface que não montou vira aviso mesmo com a tela de carregamento visível', async () => {
  assert.equal(sonda(await sondar(janela({ pronto: false }))).level, 'warn')
})

test('página que nunca termina de carregar ainda é sondada', async () => {
  const item = sonda(await sondar(janela({ pronto: false, claros: 0 }), () => {}))
  assert.equal(item.details.carga, 0)
  assert.equal(item.level, 'warn')
})

test('recarga conta como segunda carga', async () => {
  const eventos = await sondar(janela(), (wc) => {
    wc.emit('did-finish-load')
    wc.emit('did-finish-load')
  })
  assert.deepEqual(eventos.filter((item) => item.message === 'carregou').map((item) => item.details.carga), [1, 2])
})

test('falha de carga do quadro principal é erro; a de um iframe é ignorada', async () => {
  const eventos = await sondar(janela(), (wc) => {
    wc.emit('did-fail-load', {}, -6, 'ERR_FILE_NOT_FOUND', 'app://x', false)
    wc.emit('did-fail-load', {}, -6, 'ERR_FILE_NOT_FOUND', 'app://x', true)
  })
  assert.equal(eventos.filter((item) => item.level === 'error').length, 1)
})

test('captura que falha não derruba o app e aparece no registro', async () => {
  const item = sonda(await sondar(janela({ capturar: async () => { throw new Error('sem quadro') } })))
  assert.equal(item.level, 'warn')
  assert.equal(item.details.erro, 'sem quadro')
})

const janelaComRecarga = janela

test('interface montada e janela preta: recarrega a interface uma vez só', async () => {
  const win = janelaComRecarga({ claros: 0 })
  const eventos = await sondar(win, (wc) => {
    wc.emit('did-finish-load')
    wc.emit('did-finish-load')
  })
  assert.equal(win.recargas, 1)
  assert.equal(eventos.filter((item) => item.message === 'recarregou').length, 1)
})

test('superfície indisponível também recarrega', async () => {
  const win = janelaComRecarga({ capturar: async () => { throw new Error('Current display surface not available for capture') } })
  await sondar(win)
  assert.equal(win.recargas, 1)
})

test('interface que não montou não recarrega sozinha: a tela de carregamento tem o botão', async () => {
  const win = janelaComRecarga({ pronto: false, claros: 0 })
  await sondar(win)
  assert.equal(win.recargas, 0)
})

test('janela escondida na bandeja não recarrega', async () => {
  const win = janelaComRecarga({ claros: 0 })
  win.isVisible = () => false
  await sondar(win)
  assert.equal(win.recargas, 0)
})
