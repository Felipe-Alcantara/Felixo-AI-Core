'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const {
  MAX_AUX_WINDOWS,
  auxWindowOptions,
  createAuxWindowManager,
  parseAuxFrameName,
} = require('./aux-windows.cjs')

const MONITOR_A = { workArea: { x: 0, y: 0, width: 1920, height: 1080 } }
const MONITOR_B = { workArea: { x: 1920, y: 0, width: 1080, height: 1920 } }

function janelaFalsa(bounds = { x: 100, y: 100, width: 800, height: 600 }) {
  const janela = new EventEmitter()
  let atual = bounds
  Object.assign(janela, {
    destroyed: false,
    closed: false,
    isDestroyed() { return this.destroyed },
    isMaximized: () => false,
    isFullScreen: () => false,
    getBounds: () => atual,
    setBounds(novo) { atual = novo },
    maximize() {},
    setFullScreen() {},
    close() { this.closed = true; this.emit('closed') },
    hide() { this.hidden = true },
    show() { this.hidden = false },
  })
  return janela
}

function montar({ displays = [MONITOR_A, MONITOR_B], salvo = {} } = {}) {
  const tela = new EventEmitter()
  Object.assign(tela, { getAllDisplays: () => displays, getPrimaryDisplay: () => displays[0] })
  const guardadas = []
  const repo = { dados: { ...salvo }, get(k) { return this.dados[k] }, set(k, v) { this.dados[k] = v } }
  const gerenciador = createAuxWindowManager({ settingsRepository: repo, screenApi: tela, applyGuards: (j) => guardadas.push(j) })
  const principal = Object.assign(new EventEmitter(), { webContents: new EventEmitter() })
  return { gerenciador, guardadas, principal, repo, tela, setDisplays: (novos) => { displays = novos } }
}

test('parseAuxFrameName aceita só o prefixo fixo com id seguro', () => {
  assert.equal(parseAuxFrameName('felixo-aux-t1'), 't1')
  assert.equal(parseAuxFrameName('felixo-aux-'), null)
  assert.equal(parseAuxFrameName('outro-t1'), null)
  assert.equal(parseAuxFrameName('felixo-aux-../x'), null)
  assert.equal(parseAuxFrameName('felixo-aux-' + 'a'.repeat(41)), null)
  assert.equal(parseAuxFrameName(undefined), null)
})

test('window.open: só about:blank com nome de quadro permitido vira auxiliar', () => {
  const { gerenciador } = montar()
  const ok = gerenciador.windowOpenHandler({ url: 'about:blank', frameName: 'felixo-aux-t1' })
  assert.equal(ok.action, 'allow')
  // Qualquer outro formato cai fora e segue a política de links (null = não é nosso).
  assert.equal(gerenciador.windowOpenHandler({ url: 'https://exemplo.com', frameName: 'felixo-aux-t1' }), null)
  assert.equal(gerenciador.windowOpenHandler({ url: 'about:blank', frameName: 'qualquer' }), null)
  assert.equal(gerenciador.windowOpenHandler({ url: 'about:blank', frameName: '' }), null)
  assert.equal(gerenciador.windowOpenHandler({ url: 'file:///c:/x', frameName: 'felixo-aux-t2' }), null)
})

test('as opções da auxiliar são fechadas: sandbox, contextIsolation, sem Node e sem preload', () => {
  const { gerenciador } = montar()
  const { overrideBrowserWindowOptions: opcoes } = gerenciador.windowOpenHandler({ url: 'about:blank', frameName: 'felixo-aux-t1' })
  assert.equal(opcoes.webPreferences.sandbox, true)
  assert.equal(opcoes.webPreferences.contextIsolation, true)
  assert.equal(opcoes.webPreferences.nodeIntegration, false)
  assert.equal(opcoes.webPreferences.nodeIntegrationInSubFrames, false)
  assert.equal('preload' in opcoes.webPreferences, false)
  assert.equal(auxWindowOptions({ x: 1, y: 2, width: 3, height: 4 }).x, 1)
})

test('cada auxiliar criada recebe as guardas da principal e entra no registro', () => {
  const { gerenciador, guardadas } = montar()
  gerenciador.windowOpenHandler({ url: 'about:blank', frameName: 'felixo-aux-t1' })
  const filha = janelaFalsa()
  gerenciador.onDidCreateWindow(filha, { frameName: 'felixo-aux-t1' })
  assert.deepEqual(guardadas, [filha])
  assert.deepEqual(gerenciador.list(), ['t1'])
  assert.equal(gerenciador.isAuxWindow(filha), true)
  assert.equal(gerenciador.isAuxWindow(janelaFalsa()), false)
  filha.emit('closed')
  assert.deepEqual(gerenciador.list(), [])
})

test('uma janela com nome fora do formato nunca é registrada nem guardada como auxiliar', () => {
  const { gerenciador, guardadas } = montar()
  gerenciador.onDidCreateWindow(janelaFalsa(), { frameName: 'felixo-aux-../x' })
  assert.deepEqual(guardadas, [])
  assert.deepEqual(gerenciador.list(), [])
})

test('limite de auxiliares abertas', () => {
  const { gerenciador } = montar()
  for (let i = 0; i < MAX_AUX_WINDOWS; i += 1) {
    assert.equal(gerenciador.windowOpenHandler({ url: 'about:blank', frameName: `felixo-aux-j${i}` }).action, 'allow')
  }
  assert.deepEqual(gerenciador.windowOpenHandler({ url: 'about:blank', frameName: 'felixo-aux-extra' }), { action: 'deny' })
})

test('posição e tamanho vão para a chave própria window.aux.<id>.state e voltam na próxima abertura', () => {
  const { gerenciador, repo } = montar()
  gerenciador.windowOpenHandler({ url: 'about:blank', frameName: 'felixo-aux-t1' })
  const filha = janelaFalsa({ x: 2000, y: 50, width: 700, height: 500 })
  gerenciador.onDidCreateWindow(filha, { frameName: 'felixo-aux-t1' })
  filha.emit('close')
  assert.deepEqual(repo.dados['window.aux.t1.state'].bounds, { x: 2000, y: 50, width: 700, height: 500 })
  assert.equal(repo.dados['window.main.state'], undefined)

  const outro = montar({ salvo: { 'window.aux.t1.state': repo.dados['window.aux.t1.state'] } })
  const { overrideBrowserWindowOptions: opcoes } = outro.gerenciador.windowOpenHandler({ url: 'about:blank', frameName: 'felixo-aux-t1' })
  assert.equal(opcoes.x, 2000)
  assert.equal(opcoes.width, 700)
})

test('monitor que sumiu: a auxiliar volta para um monitor visível', () => {
  const ctx = montar()
  ctx.gerenciador.windowOpenHandler({ url: 'about:blank', frameName: 'felixo-aux-t1' })
  const filha = janelaFalsa({ x: 2100, y: 100, width: 800, height: 600 })
  ctx.gerenciador.onDidCreateWindow(filha, { frameName: 'felixo-aux-t1' })

  // Lista fabricada: o monitor B desaparece.
  ctx.setDisplays([MONITOR_A])
  ctx.gerenciador.reconcileDisplays()
  const b = filha.getBounds()
  assert.ok(b.x >= 0 && b.x + b.width <= 1920, `x=${b.x} w=${b.width}`)
  assert.equal(b.width, 800)

  // Quem já está visível não se mexe.
  const parada = janelaFalsa({ x: 10, y: 10, width: 300, height: 300 })
  ctx.gerenciador.windowOpenHandler({ url: 'about:blank', frameName: 'felixo-aux-t2' })
  ctx.gerenciador.onDidCreateWindow(parada, { frameName: 'felixo-aux-t2' })
  ctx.gerenciador.reconcileDisplays()
  assert.deepEqual(parada.getBounds(), { x: 10, y: 10, width: 300, height: 300 })
})

test('attachTo: reage aos eventos de monitor e fechar a principal fecha as auxiliares', () => {
  const ctx = montar()
  ctx.gerenciador.attachTo(ctx.principal)
  ctx.gerenciador.windowOpenHandler({ url: 'about:blank', frameName: 'felixo-aux-t1' })
  const filha = janelaFalsa({ x: 2100, y: 100, width: 800, height: 600 })
  ctx.principal.webContents.emit('did-create-window', filha, { frameName: 'felixo-aux-t1' })
  assert.deepEqual(ctx.gerenciador.list(), ['t1'])

  ctx.setDisplays([MONITOR_A])
  ctx.tela.emit('display-removed')
  assert.ok(filha.getBounds().x < 1920)

  ctx.principal.emit('closed')
  assert.equal(filha.closed, true)
  assert.equal(ctx.tela.listenerCount('display-removed'), 0)
})

// Recarregada, a principal perde o script que desenhava a auxiliar: a janela velha
// ficava aberta e vazia, e o novo `window.open` de mesmo nome a navegava de novo,
// apagando a lembrança de que ela precisava reabrir (medido em 27/11/2026).
test('recarregar ou travar a principal fecha as auxiliares; navegação de quadro ou de âncora não', () => {
  const abrir = (ctx, id) => {
    ctx.gerenciador.windowOpenHandler({ url: 'about:blank', frameName: `felixo-aux-${id}` })
    const filha = janelaFalsa()
    ctx.principal.webContents.emit('did-create-window', filha, { frameName: `felixo-aux-${id}` })
    return filha
  }
  const ctx = montar()
  ctx.gerenciador.attachTo(ctx.principal)

  const filha = abrir(ctx, 't1')
  ctx.principal.webContents.emit('did-start-navigation', { isMainFrame: false, isSameDocument: false })
  ctx.principal.webContents.emit('did-start-navigation', { isMainFrame: true, isSameDocument: true })
  assert.equal(filha.closed, false)

  ctx.principal.webContents.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false })
  assert.equal(filha.closed, true)
  assert.deepEqual(ctx.gerenciador.list(), [])

  const pip = abrir(ctx, 'pip-t1')
  ctx.principal.webContents.emit('render-process-gone', {}, { reason: 'crashed' })
  assert.equal(pip.closed, true)
})

test('esconder a principal (bandeja) esconde as auxiliares sem fechá-las; mostrar traz de volta', () => {
  const ctx = montar()
  ctx.gerenciador.attachTo(ctx.principal)
  ctx.gerenciador.windowOpenHandler({ url: 'about:blank', frameName: 'felixo-aux-t1' })
  const filha = janelaFalsa()
  ctx.principal.webContents.emit('did-create-window', filha, { frameName: 'felixo-aux-t1' })
  ctx.principal.emit('hide')
  assert.equal(filha.hidden, true)
  assert.equal(filha.closed, false)
  ctx.principal.emit('show')
  assert.equal(filha.hidden, false)
})

function janelaPipFalsa() {
  const janela = janelaFalsa({ x: 0, y: 0, width: 520, height: 320 })
  janela.noTopo = null
  janela.todasAreas = null
  janela.setAlwaysOnTop = (valor, nivel) => { janela.noTopo = { valor, nivel } }
  janela.setVisibleOnAllWorkspaces = (valor) => { janela.todasAreas = valor }
  return janela
}

test('picture-in-picture: id pip-<...> abre pequena, sempre no topo, no canto inferior direito', () => {
  const { gerenciador } = montar()
  const { overrideBrowserWindowOptions: pip } = gerenciador.windowOpenHandler({ url: 'about:blank', frameName: 'felixo-aux-pip-agente-1' })
  assert.equal(pip.alwaysOnTop, true)
  assert.equal(pip.width, 520)
  assert.equal(pip.height, 320)
  // Canto inferior direito do monitor principal (1920x1080), com margem.
  assert.equal(pip.x, 1920 - 520 - 24)
  assert.equal(pip.y, 1080 - 320 - 24)
  assert.equal(pip.minWidth < 360, true)

  // A janela comum continua como antes: sem sempre no topo.
  const { overrideBrowserWindowOptions: comum } = gerenciador.windowOpenHandler({ url: 'about:blank', frameName: 'felixo-aux-t-agente-1' })
  assert.equal(comum.alwaysOnTop, undefined)
  assert.equal(comum.width, 900)
})

test('picture-in-picture: a janela criada fica acima das outras em todas as áreas de trabalho', () => {
  const { gerenciador } = montar()
  gerenciador.windowOpenHandler({ url: 'about:blank', frameName: 'felixo-aux-pip-a' })
  const pip = janelaPipFalsa()
  gerenciador.onDidCreateWindow(pip, { frameName: 'felixo-aux-pip-a' })
  assert.deepEqual(pip.noTopo, { valor: true, nivel: 'floating' })
  assert.equal(pip.todasAreas, true)
})

test('picture-in-picture: segue visível com a principal na bandeja, e a principal não é estrangulada enquanto houver PiP', () => {
  const ctx = montar()
  const estrangular = []
  ctx.principal.webContents.setBackgroundThrottling = (valor) => estrangular.push(valor)
  ctx.gerenciador.attachTo(ctx.principal)

  ctx.gerenciador.windowOpenHandler({ url: 'about:blank', frameName: 'felixo-aux-pip-a' })
  const pip = janelaPipFalsa()
  ctx.principal.webContents.emit('did-create-window', pip, { frameName: 'felixo-aux-pip-a' })
  ctx.gerenciador.windowOpenHandler({ url: 'about:blank', frameName: 'felixo-aux-t-b' })
  const comum = janelaFalsa()
  ctx.principal.webContents.emit('did-create-window', comum, { frameName: 'felixo-aux-t-b' })
  assert.deepEqual(estrangular, [false])

  ctx.principal.emit('hide')
  assert.equal(comum.hidden, true)
  assert.equal(pip.hidden, undefined)

  // Fechar a última PiP devolve o estrangulamento normal da janela escondida.
  pip.close()
  assert.deepEqual(estrangular, [false, true])
})
