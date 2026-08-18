#!/usr/bin/env node

/**
 * Orquestra o modo de desenvolvimento sem deixar o Vite órfão.
 *
 * O marcador HTTP é a fronteira de segurança: um processo só pode ser
 * reaproveitado ou encerrado depois que a porta responde exatamente como o
 * Vite deste projeto. Uma porta ocupada sem o marcador continua sendo de
 * outro programa e nunca é morta automaticamente.
 */

const http = require('node:http')
const path = require('node:path')
const { execFileSync, spawn } = require('node:child_process')

const HOST = '127.0.0.1'
const PORT = 5173
const MARKER_PATH = '/__felixo_dev_marker'
const EXPECTED_MARKER = 'felixo-ai-core'
const TIMEOUT_MS = 60_000
const POLL_INTERVAL_MS = 300
const SHUTDOWN_TIMEOUT_MS = 5_000

const APP_DIR = path.join(__dirname, '..')
const VITE_ENTRY = path.join(APP_DIR, 'node_modules', 'vite', 'bin', 'vite.js')
const ELECTRON_ENTRY = path.join(__dirname, 'start-electron.cjs')

function fetchMarker({ httpGet = http.get } = {}) {
  return new Promise((resolve, reject) => {
    const request = httpGet(
      { host: HOST, port: PORT, path: MARKER_PATH, timeout: 2_000 },
      (response) => {
        let body = ''
        response.setEncoding?.('utf8')
        response.on('data', (chunk) => {
          body += chunk
        })
        response.on('end', () => {
          resolve({ status: response.statusCode, body })
        })
      },
    )

    request.on('error', reject)
    request.on('timeout', () => {
      request.destroy(new Error('request timed out'))
    })
  })
}

async function probeFelixoVite({ fetch = fetchMarker } = {}) {
  let result
  try {
    result = await fetch()
  } catch (error) {
    return { status: 'down', error }
  }

  if (result.status === 200 && result.body.trim() === EXPECTED_MARKER) {
    return { status: 'felixo' }
  }

  return { status: 'foreign', httpStatus: result.status }
}

function decidirAcaoDoVite(probe) {
  if (probe.status === 'felixo') return 'limpar-e-iniciar'
  if (probe.status === 'foreign') return 'recusar'
  return 'iniciar'
}

async function waitForFelixoVite({
  probe = probeFelixoVite,
  timeoutMs = TIMEOUT_MS,
  pollIntervalMs = POLL_INTERVAL_MS,
  sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay)),
} = {}) {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const result = await probe()
    if (result.status === 'felixo') return result

    if (result.status === 'foreign') {
      throw new Error(
        `A porta ${PORT} está ocupada por outro processo; o marcador do Felixo não respondeu.`,
      )
    }

    await sleep(pollIntervalMs)
  }

  throw new Error(
    `Timeout esperando o Vite do Felixo em http://${HOST}:${PORT}${MARKER_PATH}.`,
  )
}

function parseListeningPids(output, platformName = process.platform) {
  if (platformName === 'win32') {
    const pids = new Set()
    for (const line of String(output).split(/\r?\n/)) {
      const fields = line.trim().split(/\s+/)
      if (fields.length < 5 || fields[0].toUpperCase() !== 'TCP') continue
      const address = fields[1]
      const state = fields[3].toUpperCase()
      const pid = Number(fields[4])
      if (
        state === 'LISTENING' &&
        address.endsWith(`:${PORT}`) &&
        Number.isInteger(pid) &&
        pid > 0
      ) {
        pids.add(pid)
      }
    }
    return [...pids]
  }

  return [...new Set(
    String(output)
      .split(/\s+/)
      .map((value) => Number(value))
      .filter((pid) => Number.isInteger(pid) && pid > 0),
  )]
}

function findListeningPids({
  platformName = process.platform,
  execFileSyncImpl = execFileSync,
} = {}) {
  try {
    if (platformName === 'win32') {
      const output = execFileSyncImpl('netstat', ['-ano', '-p', 'tcp'], {
        encoding: 'utf8',
      })
      return parseListeningPids(output, platformName)
    }

    const output = execFileSyncImpl(
      'lsof',
      ['-nP', `-iTCP:${PORT}`, '-sTCP:LISTEN', '-t'],
      { encoding: 'utf8' },
    )
    return parseListeningPids(output, platformName)
  } catch {
    return []
  }
}

function terminatePid(
  pid,
  {
    platformName = process.platform,
    execFileSyncImpl = execFileSync,
    killImpl = process.kill,
    force = false,
  } = {},
) {
  try {
    if (platformName === 'win32') {
      execFileSyncImpl(
        'taskkill',
        ['/PID', String(pid), '/T', '/F'],
        { stdio: 'ignore' },
      )
    } else {
      killImpl(pid, force ? 'SIGKILL' : 'SIGTERM')
    }
    return true
  } catch {
    return false
  }
}

async function stopFelixoVite({
  probe = probeFelixoVite,
  findPids = findListeningPids,
  terminate = (pid, options) => terminatePid(pid, options),
  sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay)),
  now = () => Date.now(),
  timeoutMs = SHUTDOWN_TIMEOUT_MS,
  log = console.log,
  error = console.error,
} = {}) {
  // Never turn a valid marker check into permission to kill an unrelated
  // server that took over the port after the first probe.
  const current = await probe()
  if (current.status !== 'felixo') {
    return { stopped: false, reason: current.status, pids: [] }
  }

  const pids = findPids()
  if (pids.length === 0) {
    error(
      `[felixo] O Vite foi confirmado, mas não foi possível identificar o processo na porta ${PORT}.`,
    )
    error('[felixo] Verifique a porta com lsof/netstat antes de iniciar novamente.')
    return { stopped: false, reason: 'pids-not-found', pids: [] }
  }

  log(`[felixo] Encerrando Vite do Felixo na porta ${PORT} (PID ${pids.join(', ')}).`)
  for (const pid of pids) terminate(pid)

  const deadline = now() + timeoutMs
  while (now() < deadline) {
    const state = await probe()
    if (state.status !== 'felixo') {
      return { stopped: true, reason: state.status, pids }
    }
    await sleep(100)
  }

  const stillListening = findPids()
  for (const pid of stillListening) terminate(pid, { force: true })

  const finalState = await probe()
  if (finalState.status === 'felixo') {
    error(
      `[felixo] O Vite continua na porta ${PORT}; encerre o PID ${stillListening.join(', ') || 'desconhecido'} manualmente.`,
    )
    return { stopped: false, reason: 'still-running', pids: stillListening }
  }

  return { stopped: true, reason: finalState.status, pids }
}

function spawnVite({ spawnImpl = spawn, env = process.env } = {}) {
  return spawnImpl(process.execPath, [VITE_ENTRY, '--host', HOST], {
    cwd: APP_DIR,
    env,
    stdio: 'inherit',
    windowsHide: false,
  })
}

function spawnElectron({ spawnImpl = spawn, env = process.env } = {}) {
  return spawnImpl(process.execPath, [ELECTRON_ENTRY, '--dev'], {
    cwd: APP_DIR,
    env,
    stdio: 'inherit',
    windowsHide: false,
  })
}

function waitForChild(child) {
  return new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (code, signal) => {
      resolve({ code: typeof code === 'number' ? code : 1, signal })
    })
  })
}

async function stopChild(child, { timeoutMs = SHUTDOWN_TIMEOUT_MS } = {}) {
  if (!child || child.exitCode !== null || child.signalCode) return

  try {
    child.kill('SIGTERM')
  } catch {
    return
  }

  if (child.exitCode !== null || child.signalCode) return

  await Promise.race([
    waitForChild(child),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ])

  if (child.exitCode === null && !child.signalCode) {
    try {
      child.kill('SIGKILL')
    } catch {
      // The child may have exited between the check and kill.
    }
  }
}

async function runDev({
  web = process.argv.includes('--web'),
  env = process.env,
  probe = probeFelixoVite,
  wait = waitForFelixoVite,
  spawnViteImpl = () => spawnVite({ env }),
  spawnElectronImpl = () => spawnElectron({ env }),
  stopServer = (options) => stopFelixoVite(options),
  log = console.log,
  error = console.error,
} = {}) {
  let viteChild = null
  let electronChild = null
  let shuttingDown = false
  let signalResult = null
  let signalResolve
  const signalExit = new Promise((resolve) => {
    signalResolve = resolve
  })
  const onSignal = (signal) => {
    if (shuttingDown) return
    shuttingDown = true
    signalResult = { source: 'signal', code: signal === 'SIGINT' ? 130 : 143, signal }
    signalResolve(signalResult)
  }
  process.once('SIGINT', onSignal)
  process.once('SIGTERM', onSignal)

  try {
    const initialResult = await Promise.race([
      probe().then((result) => ({ source: 'probe', result })),
      signalExit,
    ])
    if (initialResult.source === 'signal') return initialResult.code

    const action = decidirAcaoDoVite(initialResult.result)
    if (action === 'recusar') {
      throw new Error(
        `[felixo] A porta ${PORT} está ocupada por outro processo. Feche-o ou escolha outra porta antes de iniciar.`,
      )
    }

    if (action === 'limpar-e-iniciar') {
      log(`[felixo] Instância antiga do Felixo confirmada na porta ${PORT}; liberando antes de iniciar.`)
      const cleanup = await stopServer({ probe })
      if (!cleanup.stopped) {
        throw new Error(
          `[felixo] Não foi possível liberar a instância antiga do Felixo na porta ${PORT}.`,
        )
      }
    }

    if (shuttingDown) return signalResult.code

    log(`[felixo] Iniciando Vite do Felixo em http://${HOST}:${PORT}/...`)
    viteChild = spawnViteImpl()
    const startup = await Promise.race([
      wait({ probe }).then(() => ({ source: 'startup' })),
      signalExit,
    ])
    if (startup.source === 'signal') return startup.code

    if (web) {
      const result = await Promise.race([waitForChild(viteChild), signalExit])
      return result.code
    }

    electronChild = spawnElectronImpl()
    const electronExit = waitForChild(electronChild).then((result) => ({
      source: 'electron',
      ...result,
    }))
    const viteExit = viteChild
      ? waitForChild(viteChild).then((result) => ({ source: 'vite', ...result }))
      : new Promise(() => {})
    const result = await Promise.race([electronExit, viteExit, signalExit])

    if (result.source === 'vite' && !shuttingDown) {
      error('[felixo] O Vite encerrou antes do Electron; o app não será aberto.')
      if (electronChild) await stopChild(electronChild)
      return result.code || 1
    }

    return result.code
  } finally {
    shuttingDown = true
    if (electronChild) await stopChild(electronChild)
    if (viteChild) await stopChild(viteChild)
    process.removeListener('SIGINT', onSignal)
    process.removeListener('SIGTERM', onSignal)
  }
}

async function main() {
  try {
    process.exitCode = await runDev()
  } catch (error) {
    console.error(`[felixo] ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}

if (require.main === module) {
  void main()
}

module.exports = {
  APP_DIR,
  EXPECTED_MARKER,
  HOST,
  MARKER_PATH,
  PORT,
  decidirAcaoDoVite,
  fetchMarker,
  findListeningPids,
  parseListeningPids,
  probeFelixoVite,
  runDev,
  spawnElectron,
  spawnVite,
  stopFelixoVite,
  terminatePid,
  waitForFelixoVite,
}
