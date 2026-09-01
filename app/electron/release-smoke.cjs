'use strict'

/**
 * Production-bundle smoke used by the release matrix.
 *
 * This module is loaded only when the packaged application receives
 * `--release-smoke`. It deliberately exercises the same PTY manager used by
 * the canvas instead of replacing node-pty with a child-process approximation.
 */

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { PtyProcessManager } = require('./services/pty-process-manager.cjs')

const PTY_MARKER = 'FELIXO_RELEASE_PTY_OK'
const PTY_TIMEOUT_MS = 20_000

/**
 * Open a real PTY from the packaged main process and close it cleanly.
 *
 * @param {object} options
 * @param {object} options.app - Electron app instance.
 * @param {string} [options.statusFile] - Cross-process status file.
 * @param {typeof PtyProcessManager} [options.PtyManager] - Test seam.
 * @returns {Promise<object>}
 */
async function runPackagedReleaseSmoke({
  app,
  statusFile = process.env.FELIXO_RELEASE_SMOKE_STATUS_FILE,
  PtyManager = PtyProcessManager,
} = {}) {
  const status = {
    schemaVersion: 1,
    platform: process.platform,
    appVersion: typeof app?.getVersion === 'function' ? app.getVersion() : null,
    readyAt: null,
    userDataWritable: false,
    pty: null,
    error: null,
  }

  const writeStatus = () => writeSmokeStatus(statusFile, status)

  try {
    if (!app?.isPackaged) {
      throw new Error('O smoke de release exige o app empacotado.')
    }

    const userData = app.getPath('userData')
    fs.mkdirSync(userData, { recursive: true })
    fs.accessSync(userData, fs.constants.W_OK)
    status.userDataWritable = true
    status.readyAt = Date.now()
    writeStatus()

    const ptyCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-release-pty-'))
    const manager = new PtyManager()

    try {
      status.pty = await runRealPty({ manager, cwd: ptyCwd })
      writeStatus()
    } finally {
      manager.killAll({ force: true })
      removeTemporaryDirectory(ptyCwd)
    }

    return status
  } catch (error) {
    status.error = getErrorMessage(error)
    writeStatus()
    throw error
  }
}

/**
 * @param {object} options
 * @param {PtyProcessManager} options.manager
 * @param {string} options.cwd
 * @returns {Promise<{ ok: boolean, exitCode: number, marker: string, outputBytes: number }>}
 */
function runRealPty({ manager, cwd }) {
  return new Promise((resolve, reject) => {
    const sessionId = `release-smoke-${process.pid}`
    let output = ''
    let settled = false
    let timer = null

    const finish = (callback, value) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      callback(value)
    }

    const fail = (error) =>
      finish(reject, error instanceof Error ? error : new Error(String(error)))

    timer = setTimeout(() => {
      try {
        manager.kill(sessionId, { force: true })
      } catch {
        // The timeout error is the useful release diagnostic.
      }
      fail(new Error('O PTY empacotado nao encerrou dentro do tempo limite.'))
    }, PTY_TIMEOUT_MS)

    try {
      manager.spawn(sessionId, {
        cwd,
        onData: (data) => {
          output = `${output}${String(data)}`.slice(-20_000)
        },
        onExit: (event) => {
          if (event.exitCode !== 0) {
            fail(new Error(`O PTY empacotado encerrou com codigo ${event.exitCode}.`))
            return
          }

          if (!output.includes(PTY_MARKER)) {
            fail(new Error('O PTY empacotado nao devolveu o marcador esperado.'))
            return
          }

          finish(resolve, {
            ok: true,
            exitCode: event.exitCode,
            marker: PTY_MARKER,
            outputBytes: Buffer.byteLength(output),
          })
        },
      })

      const input = process.platform === 'win32'
        ? `echo ${PTY_MARKER}\r\nexit\r\n`
        : `printf '${PTY_MARKER}\\n'\nexit\n`
      const delivered = manager.write(sessionId, input)

      if (!delivered) {
        fail(new Error('O PTY empacotado recusou a escrita de smoke.'))
        return
      }

      Promise.resolve(manager.aguardarEscritas(sessionId)).catch(fail)
    } catch (error) {
      fail(error)
    }
  })
}

function writeSmokeStatus(statusFile, status) {
  if (!statusFile) return

  try {
    const directory = path.dirname(statusFile)
    fs.mkdirSync(directory, { recursive: true })
    const temporary = `${statusFile}.${process.pid}.tmp`
    fs.writeFileSync(temporary, `${JSON.stringify(status, null, 2)}\n`, 'utf8')
    fs.rmSync(statusFile, { force: true })
    fs.renameSync(temporary, statusFile)
  } catch {
    // The parent process still receives the process exit code and stderr.
  }
}

function removeTemporaryDirectory(directory) {
  try {
    fs.rmSync(directory, { recursive: true, force: true })
  } catch {
    // Best effort; the release job uses a disposable runner.
  }
}

function getErrorMessage(error) {
  return error?.message ? String(error.message) : String(error)
}

module.exports = {
  PTY_MARKER,
  runPackagedReleaseSmoke,
  runRealPty,
  writeSmokeStatus,
}
