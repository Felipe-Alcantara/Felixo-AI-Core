'use strict'

/**
 * Processo principal mínimo (NÃO é o app) que o teste `excalidraw-embeds.test.cjs`
 * sobe com o binário do Electron do projeto: serve uma página "do app" com a
 * CSP do build e monta três frames com um script que tenta alcançar o pai.
 * Imprime `RESULT:<json>` e sai.
 */

const http = require('node:http')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { app, BrowserWindow } = require('electron')
const { ISOLATED_EMBED_SANDBOX, buildRendererCsp } = require('../renderer-csp.cjs')

const PROBE = `(function () {
  var r = {}
  function t(k, f) { try { r[k] = String(f()) } catch (e) { r[k] = 'ERR:' + e.name } }
  t('origin', function () { return location.origin })
  t('parentDocument', function () { return parent.document.title })
  t('parentOrigin', function () { return parent.location.origin })
  t('parentStorage', function () { return parent.localStorage.length })
  t('ownStorage', function () { return localStorage.length })
  try { top.location.href = '/hijacked' } catch (e) {}
  parent.postMessage({ mode: window.name, r: r }, '*')
})()`

const PAGE_JS = `
window.__results = {}
var SANDBOX = ${JSON.stringify(ISOLATED_EMBED_SANDBOX)}
var SRCDOC = '<html><body><script src="/probe.js"></script></body></html>'
window.addEventListener('message', function (e) { window.__results[e.data.mode] = e.data.r })
function frame(mode, sandbox, attrs) {
  var f = document.createElement('iframe')
  f.name = mode
  f.setAttribute('sandbox', sandbox)
  Object.keys(attrs).forEach(function (k) { f.setAttribute(k, attrs[k]) })
  document.body.appendChild(f)
}
frame('isolated-srcdoc', SANDBOX, { srcdoc: SRCDOC })
frame('control-same-origin-srcdoc', SANDBOX + ' allow-same-origin', { srcdoc: SRCDOC })
frame('isolated-cross-origin', SANDBOX, { src: window.__embedOrigin + '/' })
`

// Perfil descartável e rede no processo principal: não toca o perfil de ninguém.
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-embed-')))
app.commandLine.appendSwitch('enable-features', 'NetworkServiceInProcess')
app.disableHardwareAcceleration()
app.commandLine.appendSwitch('disable-gpu')
// Se o Chromium travar ao subir (rede/GPU em máquina ocupada), sai para o teste tentar de novo.
setTimeout(() => {
  process.stderr.write('watchdog: sem resultado em 25 s\n')
  process.exit(3)
}, 25000).unref()

async function main() {
  let hijacks = 0
  const embed = http.createServer((_req, res) => {
    res.setHeader('content-type', 'text/html')
    res.end(`<html><body><script>${PROBE}</script></body></html>`)
  })
  await new Promise((resolve) => embed.listen(0, '127.0.0.1', resolve))
  const embedOrigin = `http://127.0.0.1:${embed.address().port}`

  const html = '<!doctype html><html><head><meta charset="utf-8" /></head><body><script src="/page.js"></script></body></html>'
  const policy = buildRendererCsp(html).policy.replace(/frame-src [^;]*/, `frame-src ${embedOrigin}`)
  const server = http.createServer((req, res) => {
    if (req.url === '/hijacked') hijacks += 1
    const send = (type, body) => {
      res.setHeader('content-type', type)
      res.end(body)
    }
    if (req.url === '/probe.js') return send('text/javascript', PROBE)
    if (req.url === '/page.js') return send('text/javascript', `window.__embedOrigin = ${JSON.stringify(embedOrigin)}\n${PAGE_JS}`)
    return send(
      'text/html',
      html.replace('<head>', `<head><meta http-equiv="Content-Security-Policy" content="${policy}" />`),
    )
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const appOrigin = `http://127.0.0.1:${server.address().port}`

  if (!app.isReady()) await new Promise((resolve) => app.once('ready', resolve))
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
  const consoleLines = []
  win.webContents.on('console-message', (_e, ...a) => consoleLines.push(JSON.stringify(a).slice(0, 300)))
  await win.loadURL(`${appOrigin}/`)
  const deadline = Date.now() + 15000
  let results = {}
  while (Date.now() < deadline) {
    results = await win.webContents.executeJavaScript('window.__results')
    if (Object.keys(results).length === 3) break
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  await new Promise((resolve) => setTimeout(resolve, 500))
  const out = { appOrigin, embedOrigin, results, hijacks, windowUrl: win.webContents.getURL(), consoleLines }
  process.stdout.write(`RESULT:${JSON.stringify(out)}\n`)
  app.exit(0)
  process.exit(0)
}

main().catch((error) => {
  process.stderr.write(`${error && error.stack}\n`)
  app.exit(2)
})
