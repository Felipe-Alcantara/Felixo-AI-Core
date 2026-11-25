'use strict'
require('../../scripts/test-support/pasta-do-teste.cjs') // isola o temporário deste arquivo (ver pasta-do-teste.cjs)

const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')

const CAMINHO = path.join(__dirname, 'auto-updater.cjs')

/**
 * Carrega o serviço com `electron` e `electron-updater` falsos: o ciclo verificar → baixar → instalar roda inteiro, sem
 * rede e sem app empacotado. Cada chamada devolve um módulo novo e as pontas que o teste dirige.
 */
function carregar({ empacotado }) {
  const ouvintes = {}
  const handlers = {}
  const chamadas = { quitAndInstall: [], checkForUpdates: 0 }
  const autoUpdater = {
    on: (evento, fn) => { ouvintes[evento] = fn },
    checkForUpdates: async () => {
      chamadas.checkForUpdates += 1
      if (autoUpdater.falhar) throw new Error(autoUpdater.falhar)
      return { updateInfo: { version: '9.9.9' } }
    },
    quitAndInstall: (...args) => { chamadas.quitAndInstall.push(args) },
  }
  const app = { isPackaged: empacotado, once: () => {} }
  const ipcMain = { handle: (canal, fn) => { handlers[canal] = fn } }
  const eletron = { app, ipcMain }

  const carregarOriginal = Module._load
  Module._load = function (pedido, ...resto) {
    if (pedido === 'electron') return eletron
    if (pedido === 'electron-updater') return { autoUpdater }
    return carregarOriginal.call(this, pedido, ...resto)
  }
  delete require.cache[CAMINHO]
  let modulo
  try {
    modulo = require(CAMINHO)
  } finally {
    Module._load = carregarOriginal
  }
  return { modulo, ouvintes, handlers, chamadas, autoUpdater }
}

/** Janela falsa que guarda o que o main manda para a interface. */
function janela() {
  const enviados = []
  return { enviados, webContents: { isDestroyed: () => false, send: (canal, status) => enviados.push([canal, status]) } }
}

test('fora do app empacotado o atualizador fica desligado e a verificação manual diz por quê', async () => {
  const { modulo, handlers } = carregar({ empacotado: false })
  const win = janela()
  const servico = modulo.registerAutoUpdateHandlers(() => win)

  assert.equal(servico.getStatus().state, 'disabled')
  assert.match((await handlers['updates:get-status']()).status.message, /apenas no app empacotado/)

  const resposta = await handlers['updates:check']()
  assert.equal(resposta.ok, false)
  assert.equal(resposta.status.state, 'disabled')
  assert.equal(win.enviados.at(-1)[0], 'updates:status')
  servico.stop()
})

test('o ciclo verificar → baixar → pronto avisa a interface a cada passo e libera a instalação só no fim', async () => {
  const { modulo, handlers, ouvintes, chamadas } = carregar({ empacotado: true })
  const win = janela()
  const servico = modulo.registerAutoUpdateHandlers(() => win)
  try {
    assert.equal(servico.getStatus().state, 'idle')

    // Antes de baixar, "Reiniciar agora" não pode reiniciar nada.
    const cedo = await handlers['updates:install']()
    assert.equal(cedo.ok, false)
    assert.match(cedo.message, /Nenhuma atualizacao baixada/)
    assert.equal(chamadas.quitAndInstall.length, 0)

    const verificacao = await handlers['updates:check']()
    assert.equal(verificacao.ok, true)
    assert.equal(verificacao.updateInfo.version, '9.9.9')
    assert.equal(chamadas.checkForUpdates, 1)

    ouvintes['checking-for-update']()
    assert.equal(servico.getStatus().state, 'checking')
    ouvintes['update-available']({ version: '9.9.9' })
    assert.equal(servico.getStatus().state, 'available')
    assert.equal(servico.getStatus().version, '9.9.9')
    ouvintes['download-progress']({ percent: 41.6 })
    assert.equal(servico.getStatus().state, 'downloading')
    assert.match(servico.getStatus().message, /\(42%\)/)
    assert.equal((await handlers['updates:install']()).ok, false)

    ouvintes['update-downloaded']({ version: '9.9.9' })
    assert.equal(servico.getStatus().state, 'downloaded')
    assert.equal(servico.getStatus().progress, 100)

    const instalacao = await handlers['updates:install']()
    assert.equal(instalacao.ok, true)
    assert.deepEqual(chamadas.quitAndInstall, [[false, true]])

    // Cada mudança chegou à interface, na ordem.
    assert.deepEqual(
      win.enviados.map(([, status]) => status.state),
      ['checking', 'available', 'downloading', 'downloaded'],
    )
  } finally {
    servico.stop()
  }
})

test('"já está atualizado" volta a idle com a versão e a falha da verificação vira estado de erro', async () => {
  const { modulo, handlers, ouvintes, autoUpdater } = carregar({ empacotado: true })
  const win = janela()
  const servico = modulo.registerAutoUpdateHandlers(() => win)
  try {
    ouvintes['update-not-available']({ version: '1.0.0' })
    assert.equal(servico.getStatus().state, 'idle')
    assert.equal(servico.getStatus().message, 'Aplicativo atualizado.')

    autoUpdater.falhar = 'sem rede'
    const resposta = await handlers['updates:check']()
    assert.equal(resposta.ok, false)
    assert.equal(resposta.message, 'sem rede')
    assert.equal(servico.getStatus().state, 'error')

    // Erro assíncrono do próprio updater também aparece, com texto padrão se vier sem mensagem.
    ouvintes.error({})
    assert.equal(servico.getStatus().message, 'Falha no auto-update.')
  } finally {
    servico.stop()
  }
})

test('com o atualizador desligado por opção a verificação manual segue funcionando, sem ouvir eventos do updater', async () => {
  const { modulo, ouvintes } = carregar({ empacotado: true })
  const servico = modulo.registerAutoUpdateHandlers(() => janela(), { disabled: true })
  assert.deepEqual(Object.keys(ouvintes), [])
  servico.stop()
})

test('sem janela viva o status não é enviado, e a janela destruída é ignorada', async () => {
  const { modulo, ouvintes } = carregar({ empacotado: true })
  const destruida = { webContents: { isDestroyed: () => true, send: () => assert.fail('não deveria enviar') } }
  const servico = modulo.registerAutoUpdateHandlers(() => destruida)
  try {
    ouvintes['checking-for-update']()
    assert.equal(servico.getStatus().state, 'checking')
  } finally {
    servico.stop()
  }
  const servicoSemJanela = carregar({ empacotado: true })
  const outro = servicoSemJanela.modulo.registerAutoUpdateHandlers(() => null)
  try {
    servicoSemJanela.ouvintes['checking-for-update']()
    assert.equal(outro.getStatus().state, 'checking')
  } finally {
    outro.stop()
  }
})
