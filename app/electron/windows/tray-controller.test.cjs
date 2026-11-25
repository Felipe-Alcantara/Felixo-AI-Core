'use strict'
require('../../scripts/test-support/pasta-do-teste.cjs') // isola o temporário deste arquivo (ver pasta-do-teste.cjs)

const assert = require('node:assert/strict')
const { test } = require('node:test')

const { createTrayController, trayEnabled, trayTooltip } = require('./tray-controller.cjs')

function criarAmbiente({ enabled = true, vivas = 2 } = {}) {
  const ouvintes = new Map()
  const app = {
    quits: 0,
    on: (nome, fn) => ouvintes.set(nome, [...(ouvintes.get(nome) ?? []), fn]),
    quit() {
      this.quits += 1
      ouvintes.get('before-quit')?.forEach((fn) => fn())
    },
    emit: (nome) => ouvintes.get(nome)?.forEach((fn) => fn()),
  }
  const bandejas = []
  class Tray {
    constructor(imagem) {
      this.imagem = imagem
      this.dica = null
      this.menu = null
      this.clique = null
      this.destruida = false
      bandejas.push(this)
    }
    setToolTip(texto) {
      this.dica = texto
    }
    setContextMenu(menu) {
      this.menu = menu
    }
    on(nome, fn) {
      if (nome === 'click') this.clique = fn
    }
    destroy() {
      this.destruida = true
    }
  }
  const janela = {
    escondida: false,
    minimizada: false,
    focos: 0,
    destruida: false,
    isDestroyed() {
      return this.destruida
    },
    isMinimized() {
      return this.minimizada
    },
    restore() {
      this.minimizada = false
    },
    hide() {
      this.escondida = true
    },
    show() {
      this.escondida = false
    },
    focus() {
      this.focos += 1
    },
  }
  const controlador = createTrayController({
    enabled,
    app,
    Tray,
    Menu: { buildFromTemplate: (itens) => itens },
    nativeImage: { createFromPath: (caminho) => ({ caminho }) },
    iconPath: 'icone.png',
    getMainWindow: () => janela,
    contarSessoesVivas: () => vivas,
  })
  const fechar = () => {
    let impedido = false
    const tratado = controlador.interceptar({
      preventDefault: () => {
        impedido = true
      },
    })
    return { tratado, impedido }
  }
  return { app, bandejas, janela, controlador, fechar }
}

test('a bandeja só vale no Windows e no Linux empacotados, nunca no macOS, em dev ou no smoke', () => {
  const base = { platformName: 'win32', isDevelopment: false, isReleaseSmoke: false }
  assert.equal(trayEnabled(base), true)
  assert.equal(trayEnabled({ ...base, platformName: 'linux' }), true)
  assert.equal(trayEnabled({ ...base, platformName: 'darwin' }), false)
  assert.equal(trayEnabled({ ...base, isDevelopment: true }), false)
  assert.equal(trayEnabled({ ...base, isReleaseSmoke: true }), false)
})

test('na automação a bandeja só liga com a variável própria e porta válida', () => {
  const base = { platformName: 'win32', isDevelopment: true, isReleaseSmoke: false, devtoolsPort: 9333 }
  assert.equal(trayEnabled({ ...base, env: {} }), false)
  assert.equal(trayEnabled({ ...base, env: { FELIXO_DEVTOOLS_TRAY: '1' } }), true)
  // Sem porta válida a variável sozinha não conta: não é automação, então vale o modo normal (dev: desligada).
  assert.equal(trayEnabled({ ...base, devtoolsPort: Number.NaN, env: { FELIXO_DEVTOOLS_TRAY: '1' } }), false)
  assert.equal(trayEnabled({ ...base, devtoolsPort: 70000, env: { FELIXO_DEVTOOLS_TRAY: '1' } }), false)
  // Automação do app empacotado (sem dev) também não liga sem a variável.
  assert.equal(trayEnabled({ ...base, isDevelopment: false, env: {} }), false)
})

test('a dica diz quantos agentes seguem rodando', () => {
  assert.equal(trayTooltip('App', 0), 'App')
  assert.equal(trayTooltip('App', 1), 'App — 1 agente rodando')
  assert.equal(trayTooltip('App', 3), 'App — 3 agentes rodando')
})

test('o X esconde a janela na bandeja e não deixa a janela fechar', () => {
  const { bandejas, janela, fechar } = criarAmbiente({ vivas: 2 })

  const { tratado, impedido } = fechar()

  assert.equal(tratado, true)
  assert.equal(impedido, true)
  assert.equal(janela.escondida, true)
  assert.equal(bandejas.length, 1)
  assert.equal(bandejas[0].dica, 'Felixo AI Core — 2 agentes rodando')
  assert.equal(bandejas[0].imagem.caminho, 'icone.png')
})

test('esconder de novo reaproveita a mesma bandeja', () => {
  const { bandejas, janela, controlador, fechar } = criarAmbiente()

  fechar()
  janela.show()
  fechar()

  assert.equal(bandejas.length, 1)
  assert.equal(controlador.existe(), true)
})

test('clicar na bandeja e Abrir trazem a janela de volta, inclusive minimizada', () => {
  const { bandejas, janela, fechar } = criarAmbiente()
  fechar()
  janela.minimizada = true

  bandejas[0].clique()

  assert.equal(janela.escondida, false)
  assert.equal(janela.minimizada, false)
  assert.equal(janela.focos, 1)

  fechar()
  assert.match(bandejas[0].menu[0].label, /Abrir/)
  bandejas[0].menu[0].click()
  assert.equal(janela.escondida, false)
})

test('o Sair do menu da bandeja pede ao app para sair e libera o fechamento (a guarda pergunta)', () => {
  const { app, bandejas, controlador, fechar } = criarAmbiente()
  fechar()

  bandejas[0].menu.find((item) => item.label === 'Sair').click()

  assert.equal(app.quits, 1)
  // Saindo, o X não esconde mais: o fechamento segue para a guarda, que pergunta "encerrar N agentes?".
  const { tratado, impedido } = fechar()
  assert.equal(tratado, false)
  assert.equal(impedido, false)
  assert.equal(controlador.existe(), true)
})

test('cancelar o Sair faz o X voltar a esconder', () => {
  const { bandejas, controlador, janela, fechar } = criarAmbiente()
  fechar()
  bandejas[0].menu.find((item) => item.label === 'Sair').click()
  assert.equal(fechar().tratado, false)

  controlador.aoCancelarSaida()
  janela.show()

  assert.equal(fechar().tratado, true)
  assert.equal(janela.escondida, true)
})

test('qualquer saída real (before-quit: Ctrl+Q, atualização) também libera o fechamento', () => {
  const { app, fechar } = criarAmbiente()

  app.emit('before-quit')

  assert.equal(fechar().tratado, false)
})

test('ao encerrar o app a bandeja é destruída', () => {
  const { app, bandejas, controlador, fechar } = criarAmbiente()
  fechar()

  app.emit('will-quit')

  assert.equal(bandejas[0].destruida, true)
  assert.equal(controlador.existe(), false)
})

test('desligada, o X não é tratado e nenhuma bandeja nasce', () => {
  const { bandejas, janela, fechar } = criarAmbiente({ enabled: false })

  const { tratado, impedido } = fechar()

  assert.equal(tratado, false)
  assert.equal(impedido, false)
  assert.equal(janela.escondida, false)
  assert.equal(bandejas.length, 0)
})

test('sem janela principal (já destruída) não há o que esconder', () => {
  const { janela, fechar } = criarAmbiente()
  janela.destruida = true

  assert.equal(fechar().tratado, false)
})
