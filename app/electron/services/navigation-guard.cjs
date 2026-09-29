'use strict'

const { EXTERNAL_WEB_SCHEMES, classifyExternalUrl } = require('./external-url-policy.cjs')

/**
 * Barreiras de navegação que não dependem do renderer se comportar.
 *
 * A janela principal só mostra o próprio app: o preload expõe a API do app
 * (PTY, arquivos, IPC) a qualquer página carregada nela, então uma navegação
 * para fora — um `<a href>` sem `target`, um `location.href =` vindo de
 * conteúdo injetado — entregaria essa API a um site. Os webviews do bloco
 * "Página Web" nascem só em página web, e nunca com preload ou Node, não
 * importa o que o atributo `webpreferences` peça.
 *
 * O limite, dito com todas as letras: "nascem" é só o endereço inicial. Depois
 * do attach, o renderer principal ainda pode chamar `webview.loadURL('file:///...')`
 * — uma navegação iniciada pelo processo principal, que o Chromium não filtra
 * como filtra a que o próprio site pede, e que não passa por `will-navigate`.
 * Explorar isso exige JS arbitrário no renderer principal, e quem tem isso já
 * tem a ponte do preload (PTY, arquivos): não abre nada que já não estivesse
 * aberto. O que o site dentro do webview pede sozinho o Chromium barra.
 */

/**
 * O destino é o próprio app? Em produção o app é um arquivo (`file://` do
 * build): só o mesmo arquivo conta, com qualquer query ou âncora. Em
 * desenvolvimento é o servidor do Vite: a mesma origem conta.
 *
 * Só origem http(s) vale como referência. `about:blank`, `data:` e a página de
 * erro do Chromium (`chrome-error://`) têm origem opaca, que o `URL` escreve
 * "null" — e "null" === "null" aceitaria qualquer outro destino opaco, como
 * `data:text/html,...`. Com o documento atual (`getURL()`) servindo de
 * referência, a janela pode estar numa dessas quando a guarda roda.
 *
 * @param {string} targetUrl
 * @param {string} appUrl
 */
function isAppDocument(targetUrl, appUrl) {
  try {
    const target = new URL(targetUrl)
    const app = new URL(appUrl)
    if (app.protocol === 'file:') {
      return target.protocol === 'file:' && target.host === app.host && target.pathname === app.pathname
    }
    if (app.protocol !== 'http:' && app.protocol !== 'https:') return false
    return target.origin === app.origin
  } catch {
    return false
  }
}

/**
 * Nega toda navegação da janela principal para fora do app. Um link web que
 * chegou até aqui (sem `target="_blank"`) sai pelo opener, que aplica a
 * política; redirecionamento nunca sai, porque ninguém o pediu.
 *
 * "O app" é o documento segundo o `appUrl` configurado OU segundo a URL que o
 * Chromium de fato carregou (`webContents.getURL()`). Só o `appUrl` não basta:
 * em produção ele é `pathToFileURL(rendererBuildPath)`, e o Chromium escreve o
 * mesmo arquivo de outro jeito quando o caminho chega com unidade minúscula
 * (`f:\`) ou nome 8.3 (`PESSOA~1`, que o Chromium deixa cru e o
 * `pathToFileURL` codifica como `%7E`) — a guarda bloquearia a navegação do
 * próprio app. O `getURL()` é confiável como referência porque `will-navigate`
 * não dispara no `loadFile`/`loadURL` inicial (a doc do evento: "will not emit
 * when the navigation is started programmatically"): quando a guarda roda, a
 * janela já está no app, e a URL é a do documento atual, não a do destino.
 *
 * @param {Pick<import('electron').WebContents, 'on' | 'getURL'>} webContents
 * @param {{ appUrl: string, openExternal: (url: string) => Promise<void> }} options
 */
function registerMainWindowNavigationGuard(webContents, { appUrl, openExternal }) {
  const isApp = (target) => isAppDocument(target, appUrl) || isAppDocument(target, webContents.getURL())

  webContents.on('will-navigate', (event, url) => {
    const target = navigationUrl(event, url)
    if (isApp(target)) return

    event.preventDefault()
    openExternal(target).catch(() => {})
  })

  webContents.on('will-redirect', (event, url) => {
    if (isApp(navigationUrl(event, url))) return
    event.preventDefault()
  })
}

/**
 * Força o isolamento de todo `<webview>` que o renderer tentar anexar, e
 * troca por `about:blank` o endereço inicial que não é página web. Sem isto
 * quem escreve no DOM do renderer escolhe `webpreferences="nodeIntegration=yes"`
 * ou um `preload`.
 *
 * Trocar o `src` em vez de cancelar o attach: `event.preventDefault()` destrói
 * o guest ("Calling `event.preventDefault()` will destroy the guest page", doc
 * de `will-attach-webview` em electron.d.ts), e o `<webview>` fica sem guest
 * para sempre. Era o que acontecia ao remontar um bloco "Página Web" cuja URL
 * salva a política recusa (âncora acima do limite, `usuário:senha@`): o bloco
 * morria, e digitar outra URL depois lançava erro síncrono no `loadURL` do
 * elemento. Mudar `params` é o caminho previsto pela mesma doc: "This object
 * can be modified to adjust the parameters of the guest page".
 *
 * @param {Record<string, unknown>} webPreferences - mutado no lugar, como o Electron pede
 * @param {{ src?: unknown }} params - mutado no lugar: `src` recusado vira `about:blank`
 */
function hardenWebviewAttach(webPreferences, params) {
  delete webPreferences.preload
  delete webPreferences.preloadURL
  webPreferences.nodeIntegration = false
  webPreferences.nodeIntegrationInSubFrames = false
  webPreferences.nodeIntegrationInWorker = false
  webPreferences.contextIsolation = true
  webPreferences.sandbox = true
  webPreferences.webSecurity = true
  webPreferences.allowRunningInsecureContent = false
  webPreferences.experimentalFeatures = false

  if (params && !isWebviewDestination(params.src)) params.src = 'about:blank'
}

/**
 * Onde um webview pode estar: página web, ou `about:blank` — enquanto um popup
 * de login ainda não recebeu endereço, ou no lugar de um endereço inicial
 * recusado.
 *
 * @param {unknown} url
 */
function isWebviewDestination(url) {
  if (url === 'about:blank') return true
  return classifyExternalUrl(url, EXTERNAL_WEB_SCHEMES).ok
}

/**
 * @param {import('electron').BrowserWindow} mainWindow
 */
function registerWebviewAttachGuard(mainWindow) {
  // Nunca `event.preventDefault()`: destruiria o guest (ver `hardenWebviewAttach`).
  mainWindow.webContents.on('will-attach-webview', (_event, webPreferences, params) => {
    hardenWebviewAttach(webPreferences, params)
  })
}

/**
 * O Electron passa a URL como segundo argumento e, desde a v25, também em
 * `event.url`. Lê os dois para não depender da versão.
 */
function navigationUrl(event, url) {
  if (typeof url === 'string') return url
  return typeof event?.url === 'string' ? event.url : ''
}

module.exports = {
  hardenWebviewAttach,
  isAppDocument,
  isWebviewDestination,
  registerMainWindowNavigationGuard,
  registerWebviewAttachGuard,
}
