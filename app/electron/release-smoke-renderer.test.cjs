'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const {
  CANARY_IMAGE_URL,
  findExcalidrawChunks,
  isCspViolationMessage,
  runRendererCspSmoke,
} = require('./release-smoke-renderer.cjs')

const SONDAS_OK = {
  imagemData: 'ok',
  imagemBlob: 'ok',
  som: 'ok',
  workerBlob: 'ok',
  excalidraw: 'ok',
  workerExcalidraw: 'ok',
}

/**
 * Janela falsa: responde aos scripts do smoke pelo que eles perguntam. A
 * medição com o Chromium de verdade (boot, sondas e as três mutações da CSP)
 * fica registrada na task; aqui fica o contrato de decisão.
 */
function criarJanela({
  booted = true,
  meta = true,
  cspAtiva = true,
  sondas = SONDAS_OK,
  violacoesNoBoot = [],
  consoleNoBoot = [],
} = {}) {
  const estado = { pagina: [], consoleOuvintes: [], requestOuvinte: null, destruida: false, desanexado: false }

  class FakeBrowserWindow {
    constructor(options) {
      estado.options = options
      const emitirConsole = (message) => {
        for (const ouvinte of estado.consoleOuvintes) ouvinte({ message })
      }
      this.webContents = {
        on: (evento, ouvinte) => {
          if (evento === 'console-message') estado.consoleOuvintes.push(ouvinte)
        },
        setWindowOpenHandler: (handler) => {
          estado.windowOpen = handler
        },
        session: {
          webRequest: {
            onBeforeRequest: (ouvinte) => {
              estado.requestOuvinte = ouvinte
            },
          },
        },
        debugger: {
          attach: () => {
            estado.anexado = true
          },
          sendCommand: async (metodo) => {
            if (metodo === 'Page.addScriptToEvaluateOnNewDocument') estado.ouvinteNaPagina = true
          },
          detach: () => {
            estado.desanexado = true
          },
        },
        executeJavaScript: async (script) => {
          if (script.includes('felixoAppReady')) return booted
          if (script.includes('http-equiv="Content-Security-Policy"')) return meta
          if (script.includes('const probes')) return { probes: sondas, notes: {} }
          if (script.includes('__felixoCspViolations.slice')) return estado.pagina.slice()
          if (script.includes("eval('1')")) {
            if (!cspAtiva) return false
            estado.pagina.push('script-src eval', `img-src ${CANARY_IMAGE_URL}`)
            emitirConsole(`Loading the image '${CANARY_IMAGE_URL}' violates the following Content Security Policy directive`)
            return true
          }
          throw new Error(`script inesperado: ${script.slice(0, 60)}`)
        },
      }
      this.loadURL = async () => {}
      this.loadFile = async (arquivo) => {
        estado.carregado = arquivo
        estado.pagina.push(...violacoesNoBoot)
        for (const texto of consoleNoBoot) emitirConsole(texto)
      }
      this.isDestroyed = () => estado.destruida
      this.destroy = () => {
        estado.destruida = true
      }
    }
  }

  return { FakeBrowserWindow, estado }
}

function rodar(janela, extra = {}) {
  return runRendererCspSmoke({
    BrowserWindow: janela.FakeBrowserWindow,
    windowOptions: { width: 10, webPreferences: { preload: '/preload.cjs', sandbox: true } },
    rendererPath: '/pacote/dist/index.html',
    excalidrawChunks: { canvas: './assets/ExcalidrawCanvas-x.js', subsetWorker: './assets/subset-worker.chunk-x.js' },
    wait: () => Promise.resolve(),
    ...extra,
  })
}

test('passa com o app montado, a <meta> presente, as sondas ok e o controle positivo visto nos dois canais', async () => {
  const janela = criarJanela()
  const resultado = await rodar(janela)

  assert.equal(resultado.ok, true)
  assert.deepEqual(resultado.violations, [])
  assert.deepEqual(resultado.consoleViolations, [])
  assert.deepEqual(resultado.canary, {
    evalRecusado: true,
    evalVistoNaPagina: true,
    imagemVistaNaPagina: true,
    imagemVistaNoConsole: true,
  })
  // A janela é a principal (mesmo preload e sandbox), só que oculta e sem freio.
  assert.equal(janela.estado.options.show, false)
  assert.equal(janela.estado.options.webPreferences.preload, '/preload.cjs')
  assert.equal(janela.estado.options.webPreferences.backgroundThrottling, false)
  assert.equal(janela.estado.ouvinteNaPagina, true)
  assert.equal(janela.estado.carregado, '/pacote/dist/index.html')
  assert.equal(janela.estado.destruida, true)
  assert.equal(janela.estado.desanexado, true)
})

test('reprova e lista a violação do boot (o hash errado do script inline)', async () => {
  const resultado = await rodar(
    criarJanela({
      violacoesNoBoot: ['script-src-elem inline'],
      consoleNoBoot: ["Executing inline script violates the following Content Security Policy directive 'script-src'"],
    }),
  )

  assert.equal(resultado.ok, false)
  assert.deepEqual(resultado.violations, ['script-src-elem inline'])
  assert.equal(resultado.consoleViolations.length, 1)
  // O controle positivo não entra na lista de violações.
  assert.ok(!resultado.violations.some((entrada) => entrada.includes(CANARY_IMAGE_URL)))
})

test('reprova a violação que só a página vê: um eval no boot não chega pelo console', async () => {
  const resultado = await rodar(criarJanela({ violacoesNoBoot: ['script-src eval'] }))

  assert.equal(resultado.ok, false)
  assert.deepEqual(resultado.violations, ['script-src eval'])
  assert.deepEqual(resultado.consoleViolations, [])
})

test('a conferência pelo console também reprova o que o ouvinte da página não recebeu', async () => {
  const resultado = await rodar(
    criarJanela({ consoleNoBoot: ["Loading the font 'https://x' violates the following Content Security Policy directive"] }),
  )

  assert.equal(resultado.ok, false)
  assert.deepEqual(resultado.violations, [])
  assert.equal(resultado.consoleViolations.length, 1)
})

test('reprova com a <meta> no lugar se o controle positivo não aparece (canal quebrado)', async () => {
  const resultado = await rodar(criarJanela({ cspAtiva: false }), { timeoutMs: 50 })

  assert.equal(resultado.ok, false)
  assert.equal(resultado.cspMeta, true)
  assert.deepEqual(resultado.violations, [])
  assert.equal(resultado.canary.evalVistoNaPagina, false)
})

test('reprova quando uma sonda falha (a diretiva blob: sumiu)', async () => {
  const resultado = await rodar(criarJanela({ sondas: { ...SONDAS_OK, imagemBlob: 'erro' } }))
  assert.equal(resultado.ok, false)
  assert.equal(resultado.probes.imagemBlob, 'erro')
})

test('reprova sem a <meta>: zero violações não vale quando o controle positivo não é barrado', async () => {
  const resultado = await rodar(criarJanela({ meta: false, cspAtiva: false }), { timeoutMs: 50 })

  assert.equal(resultado.ok, false)
  assert.equal(resultado.cspMeta, false)
  assert.deepEqual(resultado.violations, [])
  assert.equal(resultado.canary.evalRecusado, false)
  assert.equal(resultado.canary.imagemVistaNaPagina, false)
})

test('reprova quando o app não monta no tempo', async () => {
  const resultado = await rodar(criarJanela({ booted: false }), { timeoutMs: 50 })
  assert.equal(resultado.ok, false)
  assert.equal(resultado.booted, false)
})

test('nada sai para a rede: só file:, data:, blob: e devtools: passam, e janela nova é negada', async () => {
  const janela = criarJanela()
  let ouvinte = null
  const original = janela.FakeBrowserWindow
  janela.FakeBrowserWindow = class extends original {
    constructor(options) {
      super(options)
      const registrar = this.webContents.session.webRequest.onBeforeRequest
      this.webContents.session.webRequest.onBeforeRequest = (fn) => {
        if (fn) ouvinte = fn
        registrar(fn)
      }
    }
  }
  await rodar(janela)

  const decidir = (url) => {
    let resposta = null
    ouvinte({ url }, (valor) => {
      resposta = valor
    })
    return resposta.cancel
  }
  assert.equal(decidir('file:///pacote/dist/assets/index.js'), false)
  assert.equal(decidir('data:image/png;base64,AAAA'), false)
  assert.equal(decidir('blob:file:///abc'), false)
  assert.equal(decidir('https://esm.sh/fonte.woff2'), true)
  assert.equal(decidir('http://127.0.0.1:5173/'), true)
  assert.deepEqual(janela.estado.windowOpen(), { action: 'deny' })
  // E o filtro sai junto com a janela.
  assert.equal(janela.estado.requestOuvinte, null)
})

test('o erro de invoke sem handler vira contagem; outro erro do processo principal continua no stderr', async () => {
  const janela = criarJanela()
  const original = janela.FakeBrowserWindow
  const consoleAntes = console.error
  const impressos = []
  const captura = (...args) => impressos.push(args.map(String).join(' '))
  console.error = captura
  janela.FakeBrowserWindow = class extends original {
    constructor(options) {
      super(options)
      const carregar = this.loadFile
      this.loadFile = async (arquivo) => {
        console.error("Error occurred in handler for 'qa-logger:log':", new Error("No handler registered for 'qa-logger:log'"))
        console.error("Error occurred in handler for 'qa-logger:log':", new Error("No handler registered for 'qa-logger:log'"))
        console.error('[felixo] outro erro de verdade')
        await carregar(arquivo)
      }
    }
  }
  let resultado
  let depois
  try {
    resultado = await rodar(janela)
    depois = console.error
  } finally {
    console.error = consoleAntes
  }

  // O filtro sai junto com o passo: fica no lugar o console de antes dele.
  assert.equal(depois, captura)
  assert.equal(resultado.ipcSemHandler, 2)
  assert.deepEqual(impressos, ['[felixo] outro erro de verdade'])
})

test('mensagem de console só conta quando é da CSP', () => {
  assert.equal(
    isCspViolationMessage("Loading the image 'blob:x' violates the following Content Security Policy directive"),
    true,
  )
  assert.equal(isCspViolationMessage("Error invoking remote method 'qa-logger:log'"), false)
  assert.equal(isCspViolationMessage(undefined), false)
})

test('acha o chunk do Excalidraw e o worker de fontes só quando há exatamente um de cada', () => {
  const fsFalso = (nomes) => ({ readdirSync: () => nomes })
  const dist = path.join('pacote', 'dist', 'index.html')

  assert.deepEqual(
    findExcalidrawChunks(dist, fsFalso(['ExcalidrawCanvas-BDXB-D3j.js', 'ExcalidrawCanvas-D_O2bRP1.css', 'subset-worker.chunk-CdMLauNP.js'])),
    { canvas: './assets/ExcalidrawCanvas-BDXB-D3j.js', subsetWorker: './assets/subset-worker.chunk-CdMLauNP.js' },
  )
  // Sobra de build antigo: a sonda não escolhe e reprova ("chunk não encontrado").
  assert.equal(findExcalidrawChunks(dist, fsFalso(['ExcalidrawCanvas-a.js', 'ExcalidrawCanvas-b.js'])).canvas, null)
  assert.deepEqual(findExcalidrawChunks(dist, { readdirSync: () => { throw new Error('ENOENT') } }), {
    canvas: null,
    subsetWorker: null,
  })
})
