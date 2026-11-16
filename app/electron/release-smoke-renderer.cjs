'use strict'

/**
 * O renderer do build sob a CSP de verdade, dentro do app empacotado.
 *
 * A CSP só existe no build (`vite.config.ts`): vai numa <meta> do
 * `dist/index.html` que o app instalado abre por `file://` de dentro do asar.
 * Uma diretiva que falte (som, `blob:`, worker) ou um hash errado do script
 * inline quebram em silêncio, e só no app instalado. Este passo do
 * `--release-smoke` abre esse mesmo `index.html`, com o mesmo preload, numa
 * janela oculta, e falha listando cada violação.
 *
 * Canais, medidos no Electron 42 com o build:
 * - `securitypolicyviolation` na página é o principal. O ouvinte entra pelo
 *   CDP (`Page.addScriptToEvaluateOnNewDocument`) antes de qualquer script do
 *   documento, inclusive os inline cujo hash importa.
 * - `console-message` só recebe as violações de carregamento de recurso
 *   ("Loading the image … violates …"). Um `eval` recusado não chega por ele
 *   (só como issue do DevTools); fica como conferência.
 *
 * O modo de smoke sai antes do banco e dos handlers de IPC (`main.cjs`): o
 * React monta (o `BootMarker` liga `data-felixo-app-ready`), mas as chamadas
 * ao processo principal falham. Por isso as funcionalidades entram como
 * sondas que fazem o mesmo pedido que elas: o som de notificação, a imagem
 * `data:` e a `blob:` (prévia colada), o worker `blob:`, o chunk do
 * Excalidraw e o worker de fontes dele.
 *
 * Controle positivo: um `eval` e uma imagem `https:`, que a política recusa,
 * precisam ser barrados e vistos. Sem isso, uma <meta> que sumiu do pacote ou
 * um evento que deixou de chegar passariam como "zero violações".
 *
 * Nada sai para a rede: navegação, `window.open` e qualquer request fora de
 * `file:`, `data:`, `blob:` e `devtools:` são cancelados.
 */

const fs = require('node:fs')
const path = require('node:path')

const RENDERER_SMOKE_TIMEOUT_MS = 30_000
const SETTLE_MS = 500
const LOCAL_REQUEST = /^(?:file|data|blob|devtools):/i
const CSP_MESSAGE = /Content Security Policy/i
const CANARY_IMAGE_URL = 'https://felixo-release-smoke.invalid/controle.png'
const EXCALIDRAW_CHUNK = /^ExcalidrawCanvas-[\w-]+\.js$/
const EXCALIDRAW_SUBSET_WORKER = /^subset-worker\.chunk-[\w-]+\.js$/

/** PNG 1×1, para as sondas de imagem `data:` e `blob:`. */
const PIXEL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

const PAGE_LISTENER_SOURCE = `window.__felixoCspViolations = []
document.addEventListener('securitypolicyviolation', (event) => {
  window.__felixoCspViolations.push(event.effectiveDirective + ' ' + (event.blockedURI || 'inline'))
})`

const READ_PAGE_VIOLATIONS = 'Array.isArray(window.__felixoCspViolations) ? window.__felixoCspViolations.slice() : null'

const CANARY_SCRIPT = `(() => {
  const image = new Image()
  image.src = ${JSON.stringify(CANARY_IMAGE_URL)}
  try {
    eval('1')
    return false
  } catch (error) {
    return error instanceof EvalError
  }
})()`

function isCspViolationMessage(message) {
  return CSP_MESSAGE.test(String(message ?? ''))
}

/**
 * Caminho relativo de um chunk do build pelo nome (que tem hash). Mais de um
 * significa `dist` com sobra de build antigo, e a sonda não escolhe sozinha.
 */
function findBuildChunk(rendererPath, pattern, fsImpl = fs) {
  try {
    const chunks = fsImpl
      .readdirSync(path.join(path.dirname(rendererPath), 'assets'))
      .filter((name) => pattern.test(name))
    return chunks.length === 1 ? `./assets/${chunks[0]}` : null
  } catch {
    return null
  }
}

/** O canvas do Excalidraw (chunk preguiçoso) e o worker de subset de fontes dele. */
function findExcalidrawChunks(rendererPath, fsImpl = fs) {
  return {
    canvas: findBuildChunk(rendererPath, EXCALIDRAW_CHUNK, fsImpl),
    subsetWorker: findBuildChunk(rendererPath, EXCALIDRAW_SUBSET_WORKER, fsImpl),
  }
}

function buildProbeScript({ canvas, subsetWorker }) {
  return `(async () => {
  const notes = {}
  const settle = (start) => new Promise((resolve) => {
    const timer = setTimeout(() => resolve('tempo esgotado'), 10000)
    start((value) => {
      clearTimeout(timer)
      resolve(value)
    })
  })
  const image = (src) => settle((done) => {
    const img = new Image()
    img.onload = () => done('ok')
    img.onerror = () => done('erro')
    img.src = src
  })
  const png = '${PIXEL_PNG_BASE64}'
  const bytes = Uint8Array.from(atob(png), (char) => char.charCodeAt(0))
  const canvas = ${JSON.stringify(canvas)}
  const subsetWorker = ${JSON.stringify(subsetWorker)}
  const probes = {
    imagemData: await image('data:image/png;base64,' + png),
    imagemBlob: await image(URL.createObjectURL(new Blob([bytes], { type: 'image/png' }))),
    // O mesmo caminho de useCanvasNotifications.
    som: await settle((done) => {
      const audio = new Audio('./sounds/notification.mp3')
      audio.onloadedmetadata = () => done('ok')
      audio.onerror = () => done('erro')
      audio.load()
    }),
    workerBlob: await settle((done) => {
      const worker = new Worker(URL.createObjectURL(new Blob(['postMessage(1)'], { type: 'text/javascript' })))
      worker.onmessage = () => {
        worker.terminate()
        done('ok')
      }
      worker.onerror = () => {
        worker.terminate()
        done('erro')
      }
    }),
    excalidraw: canvas
      ? await import(new URL(canvas, document.baseURI).href).then(() => 'ok', (error) => 'erro: ' + error.message)
      : 'chunk não encontrado',
    // A CSP decide se o worker carrega. Um erro COM mensagem é do script já
    // rodando (a CSP deixou) e vai para as observações; sem mensagem, o
    // carregamento falhou.
    workerExcalidraw: subsetWorker
      ? await settle((done) => {
        try {
          const worker = new Worker(new URL(subsetWorker, document.baseURI).href, { type: 'module' })
          const timer = setTimeout(() => {
            worker.terminate()
            done('ok')
          }, 1500)
          worker.onerror = (event) => {
            clearTimeout(timer)
            worker.terminate()
            if (event.message) notes.workerExcalidraw = event.message
            done(event.message ? 'ok' : 'erro ao carregar')
          }
        } catch (error) {
          done('erro: ' + error.message)
        }
      })
      : 'chunk não encontrado',
  }
  return { probes, notes }
})()`
}

/**
 * @param {object} options
 * @param {Function} options.BrowserWindow - Construtor do Electron (ou falso, nos testes).
 * @param {object} options.windowOptions - As mesmas opções da janela principal.
 * @param {string} options.rendererPath - `dist/index.html` do pacote.
 * @returns {Promise<object>} `ok` só com boot, sondas, controle positivo e zero violações.
 */
async function runRendererCspSmoke({
  BrowserWindow,
  windowOptions,
  rendererPath,
  timeoutMs = RENDERER_SMOKE_TIMEOUT_MS,
  excalidrawChunks = findExcalidrawChunks(rendererPath),
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  const startedAt = Date.now()
  const deadline = startedAt + timeoutMs
  const result = {
    ok: false,
    booted: false,
    cspMeta: false,
    probes: null,
    notes: {},
    canary: null,
    violations: [],
    consoleViolations: [],
    ipcSemHandler: 0,
    durationMs: null,
  }
  const consoleViolations = []
  // Sem os handlers (o smoke sai antes deles), cada chamada do renderer vira
  // um "Error occurred in handler for … No handler registered" no stderr. O
  // diagnóstico do smoke guarda só os primeiros 2000 caracteres, e esse ruído
  // escondia o erro de verdade dos passos seguintes: aqui ele vira contagem.
  const originalConsoleError = console.error
  console.error = (...args) => {
    const handlerMissing =
      typeof args[0] === 'string' &&
      args[0].startsWith('Error occurred in handler for') &&
      String(args[1]?.message ?? args[1] ?? '').includes('No handler registered')
    if (handlerMissing) {
      result.ipcSemHandler += 1
      return
    }
    originalConsoleError.apply(console, args)
  }
  const win = new BrowserWindow({
    ...windowOptions,
    show: false,
    // Janela oculta sem freio: o boot não espera o ritmo de segundo plano.
    webPreferences: { ...windowOptions.webPreferences, backgroundThrottling: false },
  })
  const contents = win.webContents
  const run = (script) => contents.executeJavaScript(script, true)
  let attached = false

  try {
    contents.on('will-navigate', (event) => event.preventDefault())
    contents.setWindowOpenHandler(() => ({ action: 'deny' }))
    contents.session.webRequest.onBeforeRequest((details, callback) => {
      callback({ cancel: !LOCAL_REQUEST.test(details.url) })
    })

    // O CDP só responde com um documento na janela: sem ele, o primeiro comando não volta.
    await win.loadURL('about:blank')
    contents.debugger.attach('1.3')
    attached = true
    await contents.debugger.sendCommand('Page.enable')
    await contents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: PAGE_LISTENER_SOURCE })
    // Só o objeto: declarar os argumentos posicionais (obsoletos) faz o Electron 42 avisar no stderr.
    contents.on('console-message', (details) => {
      if (isCspViolationMessage(details?.message)) consoleViolations.push(String(details.message).slice(0, 500))
    })

    await win.loadFile(rendererPath)
    while (!result.booted && Date.now() < deadline) {
      result.booted = (await run("document.documentElement.dataset.felixoAppReady === 'true'")) === true
      if (!result.booted) await wait(100)
    }
    result.cspMeta =
      (await run(`Boolean(document.querySelector('meta[http-equiv="Content-Security-Policy"]'))`)) === true

    const probed = await run(buildProbeScript(excalidrawChunks))
    result.probes = probed?.probes ?? null
    result.notes = probed?.notes ?? {}
    await wait(SETTLE_MS)

    const consoleBefore = consoleViolations.length
    const pageBefore = (await run(READ_PAGE_VIOLATIONS)) ?? []
    const evalRefused = (await run(CANARY_SCRIPT)) === true
    let page = pageBefore
    do {
      await wait(100)
      page = (await run(READ_PAGE_VIOLATIONS)) ?? []
    } while ((page.length < pageBefore.length + 2 || consoleViolations.length === consoleBefore) && Date.now() < deadline)

    const pageCanary = page.slice(pageBefore.length)
    const consoleCanary = consoleViolations.slice(consoleBefore)
    result.canary = {
      evalRecusado: evalRefused,
      evalVistoNaPagina: pageCanary.some((entry) => entry.startsWith('script-src')),
      imagemVistaNaPagina: pageCanary.some((entry) => entry.includes(CANARY_IMAGE_URL)),
      imagemVistaNoConsole: consoleCanary.some((text) => text.includes(CANARY_IMAGE_URL)),
    }
    result.violations = pageBefore
    result.consoleViolations = consoleViolations.slice(0, consoleBefore)
    // `cspMeta` é diagnóstico: quem prova que a política está ativa é o
    // controle positivo (valeria também para uma CSP vinda por cabeçalho).
    result.ok =
      result.booted &&
      Object.values(result.probes ?? { vazio: 'sem sondas' }).every((value) => value === 'ok') &&
      Object.values(result.canary).every(Boolean) &&
      result.violations.length === 0 &&
      result.consoleViolations.length === 0
  } catch (error) {
    result.error = error?.message ? String(error.message) : String(error)
    result.consoleViolations = consoleViolations
  } finally {
    result.durationMs = Date.now() - startedAt
    if (attached) {
      try {
        contents.debugger.detach()
      } catch {
        // A janela vai ser destruída logo abaixo.
      }
    }
    contents.session?.webRequest?.onBeforeRequest(null)
    if (!win.isDestroyed()) win.destroy()
    // Respostas de invoke que já estavam a caminho ainda caem no filtro.
    await wait(100)
    console.error = originalConsoleError
  }

  return result
}

module.exports = {
  CANARY_IMAGE_URL,
  findExcalidrawChunks,
  isCspViolationMessage,
  runRendererCspSmoke,
}
