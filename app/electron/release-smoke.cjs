'use strict'

/**
 * Production-bundle smoke used by the release matrix.
 *
 * This module is loaded only when the packaged application receives
 * `--release-smoke`. It deliberately exercises the same PTY manager used by
 * the canvas instead of replacing node-pty with a child-process approximation.
 */

const fs = require('node:fs')
const fsp = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const { PtyProcessManager } = require('./services/pty-process-manager.cjs')
const { getAppPaths } = require('./core/app-paths.cjs')
const { writeContextFile } = require('./services/context-files-ipc-handlers.cjs')
const { instalarComandoDoAgente } = require('./services/agent-command-install.cjs')
const { CONTEXT_FILE_PREFIX, CONTEXT_FILE_SUFFIX } = require('./core/context-file-contract.cjs')

const PTY_MARKER = 'FELIXO_RELEASE_PTY_OK'
const PTY_TIMEOUT_MS = 20_000
const CONTEXT_SMOKE_MARKER = 'FELIXO_RELEASE_CONTEXT_DONE'
const CONTEXT_SMOKE_TIMEOUT_MS = 20_000

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
    contextDelivery: null,
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

      status.contextDelivery = await runContextCatalogSmoke({ app, manager, cwd: ptyCwd })
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

/**
 * Prove, inside the packaged binary, that the whole context-catalog delivery
 * contract works end to end: the shim installed by THIS entrypoint resolves
 * an artifact written by THIS process's real IPC writer, and returns its
 * content byte-for-byte through a real PTY — not a dev build, not a mock.
 *
 * Two artifacts (not one) exercise the "combinação ordenada" the renderer
 * sends when several context parts are delivered together
 * (`buildContextFileReferences` in `context-file-delivery.ts`); a third,
 * intentionally absent name exercises the "artefato não encontrado" error
 * path from `context-command.cjs` with no dev-only shortcut.
 *
 * O botão Inserir/combinar e a submissão com exatamente um Enter são
 * comportamento do renderer (`terminal-session-store.ts`), fora do alcance
 * de um PTY isolado do processo principal — seguem cobertos só por unidade
 * (`terminal-session-store.test.ts`) e ficam registrados como limitação
 * explícita desta rodada, não escondidos.
 *
 * @param {object} options
 * @param {object} options.app - Electron app instance.
 * @param {PtyProcessManager} options.manager
 * @param {string} options.cwd
 * @returns {Promise<object>}
 */
async function runContextCatalogSmoke({ app, manager, cwd }) {
  const appPaths = getAppPaths({ electronApp: app })

  // Acentos, emoji, markdown e newline duplo: os quatro tipos de conteúdo que
  // a task pede para não truncar/corromper no caminho renderer → arquivo →
  // shim → PTY → agente.
  const fixtureBodies = [
    [
      '## Prompt individual — parte 1 da combinação',
      '',
      'Acentuação: ação, avaliação, coração, é, ê, ã, ç.',
      'Emoji: 🚀 ✅ 🧪',
      '',
      'Linha em branco acima prova que o corpo não foi colapsado.',
    ].join('\n'),
    [
      '## Segundo prompt — parte 2 da combinação',
      '',
      'Esta é a SEGUNDA parte; a ordem de leitura importa para a "combinação ordenada".',
    ].join('\n'),
  ]

  const writtenFiles = []
  for (const body of fixtureBodies) {
    const written = await writeContextFile(appPaths.contextFiles, {
      sessionId: 'release-smoke-context',
      kind: 'catalog-prompt',
      source: 'release-smoke',
      content: body,
    })
    writtenFiles.push({
      ...written,
      expectedContent: await fsp.readFile(written.path, 'utf8'),
    })
  }

  const missingName = `${CONTEXT_FILE_PREFIX}0-${crypto.randomUUID()}-catalog-prompt${CONTEXT_FILE_SUFFIX}`

  const install = instalarComandoDoAgente({
    binDir: appPaths.bin,
    execPath: process.execPath,
    entrypoint: path.join(__dirname, 'cli', 'felixo.cjs'),
    userData: appPaths.userData,
  })

  const output = await runContextReadsInPty({ manager, cwd, names: [...writtenFiles.map((f) => f.name), missingName] })
  // Um PTY POSIX (termios `onlcr`) e o ConPTY do Windows traduzem cada `\n`
  // que o processo filho escreve para `\r\n` na leitura — é a camada de
  // terminal, não o conteúdo. `writeContextFile` grava com `\n` puro, então
  // comparar sem normalizar reprovaria toda entrega de mais de uma linha,
  // mesmo com o corpo intacto. Medido ao vivo: os três SOs da matriz de
  // Release falharam aqui antes desta normalização.
  const normalizedOutput = output.replace(/\r\n/g, '\n')

  const perFile = writtenFiles.map((file) => ({
    kind: 'catalog-prompt',
    bytes: file.bytes,
    readExactly: normalizedOutput.includes(file.expectedContent),
  }))

  const missingArtifactReported =
    normalizedOutput.includes('Artefato de contexto não encontrado') && normalizedOutput.includes(missingName)

  if (perFile.some((file) => !file.readExactly)) {
    throw new Error('O shim empacotado não devolveu algum artefato byte a byte.')
  }
  if (!missingArtifactReported) {
    throw new Error('O shim empacotado não reportou o artefato ausente como esperado.')
  }

  return {
    ok: true,
    shimInstalled: install.caminho,
    files: perFile,
    missingArtifactReported,
  }
}

/**
 * Runs `felixo context read "<name>"` once per name, in order, inside a real
 * PTY — the same shell a canvas terminal would use — and returns everything
 * written to it.
 *
 * @param {object} options
 * @param {PtyProcessManager} options.manager
 * @param {string} options.cwd
 * @param {string[]} options.names
 * @returns {Promise<string>}
 */
function runContextReadsInPty({ manager, cwd, names }) {
  return new Promise((resolve, reject) => {
    const sessionId = `release-smoke-context-${process.pid}`
    let output = ''
    let settled = false
    let timer = null

    const finish = (callback, value) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      callback(value)
    }
    const fail = (error) => finish(reject, error instanceof Error ? error : new Error(String(error)))

    timer = setTimeout(() => {
      try {
        manager.kill(sessionId, { force: true })
      } catch {
        // The timeout error is the useful release diagnostic.
      }
      fail(new Error('O PTY do smoke de contexto não encerrou dentro do tempo limite.'))
    }, CONTEXT_SMOKE_TIMEOUT_MS)

    try {
      manager.spawn(sessionId, {
        cwd,
        onData: (data) => {
          output = `${output}${String(data)}`.slice(-200_000)
        },
        onExit: (event) => {
          if (!output.includes(CONTEXT_SMOKE_MARKER)) {
            fail(new Error('O PTY do smoke de contexto não devolveu o marcador de conclusão.'))
            return
          }
          finish(resolve, output)
        },
      })

      const newline = process.platform === 'win32' ? '\r\n' : '\n'
      const readCommands = names.map((name) => `felixo context read "${name}"`)
      const script = [...readCommands, `echo ${CONTEXT_SMOKE_MARKER}`, 'exit'].join(newline) + newline
      const delivered = manager.write(sessionId, script)

      if (!delivered) {
        fail(new Error('O PTY do smoke de contexto recusou a escrita.'))
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
  CONTEXT_SMOKE_MARKER,
  PTY_MARKER,
  runContextCatalogSmoke,
  runContextReadsInPty,
  runPackagedReleaseSmoke,
  runRealPty,
  writeSmokeStatus,
}
