'use strict'

/**
 * Automação de uma instância de desenvolvimento isolada do Felixo.
 *
 * O comando é propositalmente Node puro: cada chamada abre uma conexão CDP,
 * executa uma ação e se desconecta. O Electron continua destacado, portanto um
 * agente não precisa manter REPL, tmux ou uma janela visível para testar UI.
 */

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const net = require('node:net')
const { spawn, execFileSync } = require('node:child_process')
const { randomUUID } = require('node:crypto')
const { getAppPaths } = require('../core/app-paths.cjs')
const { probeFelixoVite, waitForFelixoVite, APP_DIR } = require('../../scripts/dev-runner.cjs')

const STATE_DIR = path.join(os.tmpdir(), 'felixo-ai-core-devtools')
const STATE_FILE = path.join(STATE_DIR, 'session.json')
const DEFAULT_TIMEOUT = 15_000

const AJUDA_DEVTOOLS = `felixo devtools — dirige uma instância isolada e invisível do Felixo AI Core.

  felixo devtools launch [--visible] [--real-profile] [--port N] [--packaged <executável>]
  felixo devtools status | screenshot [--out arquivo] | buttons | windows | quit
  felixo devtools click <seletor> | click-text <texto> | type <texto> | press <tecla>
  felixo devtools text [seletor] | eval <expressão JavaScript> | main <expressão JavaScript>
  felixo devtools heap-snapshot <arquivo.heapsnapshot> | metrics

Por padrão a sessão usa um userData temporário e uma janela invisível, e sobe da fonte
(o mesmo \`electron .\` do \`npm run dev\`, contra o Vite dev server). --real-profile é
deliberadamente excepcional e é recusado se o perfil aparentar estar em uso.

--packaged <executável> dirige o BINÁRIO EMPACOTADO no lugar da fonte — sem servidor
Vite, carregando o \`dist\` real do instalador/CI. É o que prova UI clicada dentro do
artefato que a pessoa de fato instala, não de uma aproximação de desenvolvimento.`

function parseArgs(args) {
  const options = { visible: false, realProfile: false, port: null, out: '', packaged: '' }
  if (args[0] === '--help') return { command: 'help', positional: [], options }
  const positional = []
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index]
    if (value === '--visible') options.visible = true
    else if (value === '--real-profile') options.realProfile = true
    else if (value === '--port' || value === '--out' || value === '--packaged') {
      const next = args[++index]
      if (!next) throw new Error(`${value} exige um valor.`)
      if (value === '--port') options.port = Number(next)
      else if (value === '--out') options.out = next
      else options.packaged = next
    } else if (value.startsWith('--')) {
      throw new Error(`Opção desconhecida: ${value}`)
    } else positional.push(value)
  }
  return { command: positional.shift() ?? '', positional, options }
}

function statePath(deps = {}) { return deps.stateFile ?? STATE_FILE }
function readState(deps = {}) {
  try { return JSON.parse((deps.fs ?? fs).readFileSync(statePath(deps), 'utf8')) } catch { return null }
}
function writeState(state, deps = {}) {
  const fileSystem = deps.fs ?? fs
  const file = statePath(deps)
  fileSystem.mkdirSync(path.dirname(file), { recursive: true })
  fileSystem.writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
}
function removeState(deps = {}) {
  try { (deps.fs ?? fs).rmSync(statePath(deps), { force: true }) } catch {}
}
async function removeIsolatedProfile(userData, deps = {}) {
  const fileSystem = deps.fs ?? fs
  const exists = deps.existsSync ?? ((value) => fileSystem.existsSync(value))
  const sleep = deps.sleep ?? ((delay) => new Promise((resolve) => setTimeout(resolve, delay)))
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try { fileSystem.rmSync(userData, { recursive: true, force: true }) } catch {}
    if (!exists(userData)) return true
    await sleep(100)
  }
  return false
}
function isProcessAlive(pid, deps = {}) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try { (deps.kill ?? process.kill)(pid, 0); return true } catch { return false }
}
function profileLooksInUse(userData, deps = {}) {
  const exists = deps.existsSync ?? fs.existsSync
  return ['SingletonLock', 'SingletonSocket', 'SingletonCookie'].some((name) => exists(path.join(userData, name)))
}
function findFreePort({ listen = net.createServer, host = '127.0.0.1' } = {}) {
  return new Promise((resolve, reject) => {
    const server = listen()
    server.once('error', reject)
    server.listen(0, host, () => {
      const address = server.address()
      server.close((error) => error ? reject(error) : resolve(address.port))
    })
  })
}
function assertPortAvailable(port, { listen = net.createServer, host = '127.0.0.1' } = {}) {
  return new Promise((resolve, reject) => {
    const server = listen()
    let settled = false
    const finish = (error) => {
      if (settled) return
      settled = true
      if (server.listening) {
        server.close(() => error ? reject(error) : resolve())
      } else if (error) {
        reject(error)
      } else {
        resolve()
      }
    }
    server.once('error', () => finish(new Error(`A porta ${port} do DevTools j\u00e1 est\u00e1 em uso.`)))
    server.listen(port, host, () => finish())
  })
}
function requirePort(port) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('A porta deve estar entre 1 e 65535.')
  return port
}
async function waitForCdp(port, { fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const deadline = Date.now() + timeoutMs
  let lastError = null
  while (Date.now() < deadline) {
    const controller = new AbortController()
    const requestTimeout = setTimeout(() => controller.abort(), Math.min(1_000, deadline - Date.now()))
    try {
      const response = await fetchImpl(`http://127.0.0.1:${port}/json/version`, { signal: controller.signal })
      if (response.ok) return
    } catch (error) { lastError = error }
    finally { clearTimeout(requestTimeout) }
    await sleep(Math.min(150, Math.max(0, deadline - Date.now())))
  }
  throw new Error(`O Electron não abriu CDP na porta ${port}. ${lastError?.message ?? ''}`.trim())
}
function createDetached(command, args, options, deps = {}) {
  const child = (deps.spawn ?? spawn)(command, args, {
    ...options,
    detached: true,
    stdio: 'ignore',
    windowsHide: options.windowsHide ?? true,
  })
  child.unref?.()
  return child
}
async function ensureVite(deps = {}) {
  const probe = deps.probeVite ?? probeFelixoVite
  const current = await probe()
  if (current.status === 'felixo') return { pid: null, reused: true }
  if (current.status === 'foreign') throw new Error('A porta do Vite está ocupada por outro processo; o DevTools não vai encerrá-lo.')
  const child = deps.spawnVite
    ? deps.spawnVite()
    : createDetached(process.execPath, [path.join(APP_DIR, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1'], { cwd: APP_DIR, env: process.env }, deps)
  await (deps.waitForVite ?? waitForFelixoVite)({ probe })
  return { pid: child.pid ?? null, reused: false }
}
function electronPath() { return require('electron') }
/**
 * Confere que o caminho aponta para um executável de verdade antes de tentar
 * abrir a sessão — sem isso, um caminho errado só falharia depois, no timeout
 * de `waitForCdp`, sem dizer o motivo real (executável ausente/errado).
 */
function requirePackagedExecutable(execPath, deps = {}) {
  const fileSystem = deps.fs ?? fs
  let stats
  try {
    stats = fileSystem.statSync(execPath)
  } catch {
    throw new Error(`--packaged: executável não encontrado em "${execPath}".`)
  }
  if (!stats.isFile() && !stats.isDirectory()) {
    throw new Error(`--packaged: "${execPath}" não é um arquivo executável.`)
  }
  return execPath
}
async function launch(options, deps = {}) {
  const old = readState(deps)
  if (old?.pid && isProcessAlive(old.pid, deps)) throw new Error('Já existe uma sessão DevTools ativa. Use `felixo devtools status` ou `quit`.')
  if (old) removeState(deps)
  if (old && !old.realProfile && old.userData) await removeIsolatedProfile(old.userData, deps)
  const port = options.port === null ? await (deps.findFreePort ?? findFreePort)() : requirePort(options.port)
  if (options.port !== null) await (deps.assertPortAvailable ?? assertPortAvailable)(port)
  const realUserData = (deps.getAppPaths ?? getAppPaths)().userData
  if (options.realProfile && (deps.profileLooksInUse ?? profileLooksInUse)(realUserData, deps)) {
    throw new Error('O perfil real parece estar em uso por outra instância. Feche o app antes de usar --real-profile.')
  }
  const userData = options.realProfile ? realUserData : path.join(STATE_DIR, `profile-${randomUUID()}`)
  const packaged = options.packaged ? requirePackagedExecutable(options.packaged, deps) : ''

  // --packaged dirige o binário real: sem Vite (o dist já está dentro do
  // pacote) e sem VITE_DEV_SERVER_URL (a flag que o main process usa para
  // saber se está em modo desenvolvimento — presente, ele tentaria abrir o
  // dev server que não existe ali).
  const vite = packaged ? { pid: null, reused: true } : await ensureVite(deps)
  const vitePid = packaged ? null : (vite.pid ?? (old?.vitePid && isProcessAlive(old.vitePid, deps) ? old.vitePid : null))
  const env = {
    ...process.env,
    ...(deps.env ?? {}),
    ...(packaged ? {} : { VITE_DEV_SERVER_URL: 'http://127.0.0.1:5173' }),
    FELIXO_DEVTOOLS_PORT: String(port),
    FELIXO_USER_DATA_DIR: userData,
    FELIXO_DEVTOOLS_HEADLESS: options.visible ? '0' : '1',
  }
  delete env.ELECTRON_RUN_AS_NODE
  const child = packaged
    ? createDetached(packaged, [], { cwd: deps.appDir ?? APP_DIR, env, windowsHide: !options.visible }, deps)
    : createDetached(deps.electronPath ?? electronPath(), ['.'], { cwd: deps.appDir ?? APP_DIR, env, windowsHide: !options.visible }, deps)
  const state = { pid: child.pid, port, userData, realProfile: options.realProfile, packaged: packaged || null, vitePid, createdAt: new Date().toISOString() }
  writeState(state, deps)
  try {
    await (deps.waitForCdp ?? waitForCdp)(port)
  } catch (error) {
    killTree(child.pid, deps)
    if (vitePid) killTree(vitePid, deps)
    if (!options.realProfile) {
      await removeIsolatedProfile(userData, deps)
    }
    removeState(deps)
    throw error
  }
  return state
}
async function connect(state, deps = {}) {
  if (!state?.port || !isProcessAlive(state.pid, deps)) throw new Error('Nenhuma sessão DevTools ativa. Rode `felixo devtools launch`.')
  let chromium
  try { ({ chromium } = deps.playwright ?? require('playwright-core')) } catch { throw new Error('playwright-core não está instalado. Rode `npm install` dentro de app/.') }
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${state.port}`)
  const pages = browser.contexts().flatMap((context) => context.pages()).filter((page) => !page.url().startsWith('devtools://'))
  const page = pages[0]
  if (!page) { await browser.close(); throw new Error('A sessão não expôs uma página do Felixo.') }
  return { browser, page }
}
async function withPage(deps, action) { const state = readState(deps); const { browser, page } = await connect(state, deps); try { return await action(page, state) } finally { await browser.close() } }

/**
 * Achata a lista `{name, value}[]` do CDP `Performance.getMetrics` num objeto
 * simples — mais fácil de comparar entre snapshots (JSON.stringify de listas
 * ordena por posição, não por nome, e dificulta o diff manual).
 */
function metricsListToObject(list) {
  const result = {}
  for (const entry of list ?? []) {
    if (entry && typeof entry.name === 'string') result[entry.name] = entry.value
  }
  return result
}

/**
 * Captura um heap snapshot real via CDP (`HeapProfiler.takeHeapSnapshot`) e
 * grava no formato `.heapsnapshot` que o DevTools do Chrome abre nativamente
 * — os chunks chegam via evento e precisam ser concatenados na ordem em que
 * chegam, o protocolo não os numera.
 */
async function captureHeapSnapshot(page, outputPath, deps = {}) {
  const session = await (deps.newCDPSession ?? ((p) => p.context().newCDPSession(p)))(page)
  const chunks = []
  session.on('HeapProfiler.addHeapSnapshotChunk', (event) => chunks.push(event.chunk))
  try {
    await session.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false, captureNumericValue: true })
  } finally {
    await session.detach().catch(() => {})
  }
  const fileSystem = deps.fs ?? fs
  fileSystem.mkdirSync(path.dirname(outputPath), { recursive: true })
  fileSystem.writeFileSync(outputPath, chunks.join(''), 'utf8')
  return { arquivo: outputPath, bytes: Buffer.byteLength(chunks.join('')) }
}
function killTree(pid, deps = {}) {
  if (!isProcessAlive(pid, deps)) return false
  try {
    if ((deps.platform ?? process.platform) === 'win32') (deps.execFileSync ?? execFileSync)('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' })
    else (deps.kill ?? process.kill)(pid, 'SIGTERM')
    return true
  } catch { return false }
}
function formatState(state, alive) { return [`sessão: ${alive ? 'ativa' : 'encerrada'}`, `pid: ${state.pid}`, `porta CDP: ${state.port}`, `perfil: ${state.realProfile ? 'real (explícito)' : 'isolado'}`, `origem: ${state.packaged ? `empacotado (${state.packaged})` : 'fonte (dev)'}`, `iniciada: ${state.createdAt}`].join('\n') }
async function executarDevtools(args, deps = {}) {
  let parsed
  try { parsed = parseArgs(args) } catch (error) { return { saida: '', erro: error.message, codigo: 2 } }
  const { command, positional, options } = parsed
  try {
    if (!command || command === 'help' || command === '--help') return { saida: AJUDA_DEVTOOLS, codigo: 0 }
    if (command === 'launch') { const state = await launch(options, deps); return { saida: `Sessão DevTools ativa na porta ${state.port}.\nPerfil: ${state.realProfile ? 'real (explícito)' : 'isolado'}.\nOrigem: ${state.packaged ? `empacotado (${state.packaged})` : 'fonte (dev)'}.`, codigo: 0 } }
    const state = readState(deps)
    if (command === 'status') return state ? { saida: formatState(state, isProcessAlive(state.pid, deps)), codigo: isProcessAlive(state.pid, deps) ? 0 : 1 } : { saida: 'Nenhuma sessão DevTools registrada.', codigo: 1 }
    if (command === 'quit') {
      if (!state) return { saida: 'Nenhuma sessão DevTools registrada.', codigo: 0 }
      killTree(state.pid, deps); if (state.vitePid) killTree(state.vitePid, deps)
      if (!state.realProfile) await removeIsolatedProfile(state.userData, deps)
      removeState(deps); return { saida: 'Sessão DevTools encerrada.', codigo: 0 }
    }
    if (command === 'screenshot') { const output = options.out ? path.resolve(options.out) : path.resolve('felixo-devtools.png'); await withPage(deps, async (page) => { const dataUrl = await page.evaluate(() => window.felixo?.devtools?.capturePage()); if (!dataUrl?.startsWith('data:image/png;base64,')) throw new Error('A captura nativa DevTools não está disponível. Reinicie a sessão.'); (deps.fs ?? fs).mkdirSync(path.dirname(output), { recursive: true }); (deps.fs ?? fs).writeFileSync(output, Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64')) }); return { saida: output, codigo: 0 } }
    if (command === 'buttons') { const value = await withPage(deps, (page) => page.locator('button').allTextContents()); return { saida: value.map((item, i) => `${i + 1}. ${item.trim()}`).join('\n'), codigo: 0 } }
    if (command === 'windows') { const value = await withPage(deps, (page) => page.evaluate(() => ({ title: document.title, url: location.href }))); return { saida: JSON.stringify([value], null, 2), codigo: 0 } }
    if (command === 'click') { if (!positional.length) throw new Error('click exige um seletor.'); await withPage(deps, (page) => page.locator(positional.join(' ')).first().click()); return { saida: 'Clique executado.', codigo: 0 } }
    if (command === 'click-text') { if (!positional.length) throw new Error('click-text exige um texto.'); await withPage(deps, (page) => page.getByText(positional.join(' '), { exact: true }).first().click()); return { saida: 'Clique executado.', codigo: 0 } }
    if (command === 'type') { if (!positional.length) throw new Error('type exige um texto.'); await withPage(deps, (page) => page.keyboard.type(positional.join(' '))); return { saida: 'Texto digitado.', codigo: 0 } }
    if (command === 'press') { if (positional.length !== 1) throw new Error('press exige uma tecla.'); await withPage(deps, (page) => page.keyboard.press(positional[0])); return { saida: 'Tecla enviada.', codigo: 0 } }
    if (command === 'text') { const selector = positional.join(' ') || 'body'; const value = await withPage(deps, (page) => page.locator(selector).first().innerText()); return { saida: value, codigo: 0 } }
    if (command === 'eval') { if (!positional.length) throw new Error('eval exige uma expressão JavaScript.'); const value = await withPage(deps, (page) => page.evaluate(positional.join(' '))); return { saida: typeof value === 'string' ? value : JSON.stringify(value, null, 2), codigo: 0 } }
    if (command === 'main') { if (!positional.length) throw new Error('main exige uma expressão JavaScript.'); const expression = positional.join(' '); const value = await withPage(deps, (page) => page.evaluate((source) => window.felixo?.devtools?.mainEval(source), expression)); return { saida: typeof value === 'string' ? value : JSON.stringify(value, null, 2), codigo: 0 } }
    if (command === 'heap-snapshot') { if (!positional.length) throw new Error('heap-snapshot exige um arquivo de saída.'); const output = path.resolve(positional.join(' ')); const result = await withPage(deps, (page) => captureHeapSnapshot(page, output, deps)); return { saida: `${result.arquivo} (${result.bytes} bytes)`, codigo: 0 } }
    if (command === 'metrics') { const value = await withPage(deps, async (page) => { const session = await (deps.newCDPSession ?? ((p) => p.context().newCDPSession(p)))(page); try { await session.send('Performance.enable'); const { metrics } = await session.send('Performance.getMetrics'); return metricsListToObject(metrics) } finally { await session.detach().catch(() => {}) } }); return { saida: JSON.stringify(value, null, 2), codigo: 0 } }
    return { saida: AJUDA_DEVTOOLS, erro: `Comando DevTools desconhecido: ${command}`, codigo: 2 }
  } catch (error) { return { saida: '', erro: error?.message ?? 'Falha no DevTools.', codigo: 1 } }
}

module.exports = { AJUDA_DEVTOOLS, STATE_FILE, assertPortAvailable, captureHeapSnapshot, connect, executarDevtools, findFreePort, formatState, isProcessAlive, metricsListToObject, parseArgs, profileLooksInUse, readState, requirePackagedExecutable, waitForCdp, writeState }
