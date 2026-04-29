const { app, ipcMain } = require('electron')
const { CliProcessManager } = require('./cli-process-manager.cjs')
const { createJsonlLineReader } = require('./jsonl-line-reader.cjs')

const adapters = {
  claude: require('./adapters/claude-adapter.cjs'),
  codex: require('./adapters/codex-adapter.cjs'),
  gemini: require('./adapters/gemini-adapter.cjs'),
}

const cliManager = new CliProcessManager()
const stoppedSessions = new Set()

function registerCliIpcHandlers(getMainWindow) {
  ipcMain.handle('cli:send', (event, params) => {
    const sessionId = getRequiredString(params?.sessionId)
    const prompt = getRequiredString(params?.prompt)
    const model = params?.model
    const cliType = model?.cliType
    const adapter = adapters[cliType]
    const targetWebContents = getTargetWebContents(getMainWindow, event.sender)

    if (!sessionId || !prompt) {
      return { ok: false, message: 'Prompt ou sessão inválidos.' }
    }

    if (!adapter) {
      sendCliEvent(targetWebContents, {
        type: 'error',
        message: 'Modelo sem CLI compatível configurada.',
        sessionId,
      })
      return { ok: false, message: 'Modelo sem CLI compatível configurada.' }
    }

    stoppedSessions.delete(sessionId)

    const cwd = resolveCliCwd(cliType)
    const { command, args } = adapter.getSpawnArgs(prompt, { cwd, model })
    let didComplete = false
    let didInspectStdout = false
    let stderrOutput = ''

    try {
      const childProcess = cliManager.spawn(sessionId, command, args, cwd)
      const stdoutReader = createJsonlLineReader((line) => {
        const cliEvent = parseAdapterLine(adapter, line)

        if (!cliEvent) {
          return
        }

        if (cliEvent.type === 'done') {
          didComplete = true
        }

        sendCliEvent(targetWebContents, {
          ...cliEvent,
          sessionId,
        })
      })
      const flushStdout = () => stdoutReader.flush()

      childProcess.stdout.setEncoding('utf8')
      childProcess.stdout.on('data', (chunk) => {
        if (!didInspectStdout) {
          didInspectStdout = true

          if (!isJsonlStdoutChunk(chunk)) {
            didComplete = true
            sendCliEvent(targetWebContents, {
              type: 'error',
              message: createNonJsonStdoutMessage(command, chunk),
              sessionId,
            })
            cliManager.kill(sessionId)
            return
          }
        }

        stdoutReader.push(chunk)
      })
      childProcess.stdout.on('end', flushStdout)

      childProcess.stderr.setEncoding('utf8')
      childProcess.stderr.on('data', (chunk) => {
        stderrOutput = `${stderrOutput}${chunk}`.slice(-4000)
      })

      childProcess.on('error', (error) => {
        didComplete = true
        sendCliEvent(targetWebContents, {
          type: 'error',
          message: error.message,
          sessionId,
        })
      })

      childProcess.on('close', (code, signal) => {
        flushStdout()

        if (stoppedSessions.delete(sessionId)) {
          return
        }

        if (didComplete) {
          return
        }

        if (code && code !== 0) {
          sendCliEvent(targetWebContents, {
            type: 'error',
            message: createExitErrorMessage(command, code, signal, stderrOutput),
            sessionId,
          })
          return
        }

        sendCliEvent(targetWebContents, {
          type: 'done',
          sessionId,
        })
      })

      return { ok: true }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Falha ao iniciar processo CLI.'
      sendCliEvent(targetWebContents, {
        type: 'error',
        message,
        sessionId,
      })
      return { ok: false, message }
    }
  })

  ipcMain.handle('cli:stop', (event, params) => {
    const sessionId = getRequiredString(params?.sessionId)

    if (!sessionId) {
      return { ok: false, message: 'Sessão inválida.' }
    }

    stoppedSessions.add(sessionId)
    const killed = cliManager.kill(sessionId)
    const targetWebContents = getTargetWebContents(getMainWindow, event.sender)

    if (killed) {
      sendCliEvent(targetWebContents, {
        type: 'done',
        sessionId,
        stopped: true,
      })
    } else {
      stoppedSessions.delete(sessionId)
    }

    return { ok: killed }
  })

  app.once('before-quit', () => {
    cliManager.killAll()
  })
}

function parseAdapterLine(adapter, line) {
  try {
    return adapter.parseLine(line)
  } catch (error) {
    return {
      type: 'error',
      message:
        error instanceof Error
          ? `Falha ao interpretar saída da CLI: ${error.message}`
          : 'Falha ao interpretar saída da CLI.',
    }
  }
}

function sendCliEvent(webContents, event) {
  if (!webContents || webContents.isDestroyed()) {
    return
  }

  webContents.send('cli:stream', event)
}

function getTargetWebContents(getMainWindow, fallbackWebContents) {
  const mainWindow =
    typeof getMainWindow === 'function' ? getMainWindow() : getMainWindow

  if (mainWindow?.webContents && !mainWindow.webContents.isDestroyed()) {
    return mainWindow.webContents
  }

  return fallbackWebContents
}

function resolveCliCwd(cliType) {
  if (cliType === 'codex') {
    return process.env.HOME || process.cwd()
  }

  return process.env.HOME || process.cwd()
}

function getRequiredString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function createExitErrorMessage(command, code, signal, stderrOutput) {
  const detail = stderrOutput.trim()
  const status = signal ? `sinal ${signal}` : `código ${code}`

  if (!detail) {
    return `${command} encerrou com ${status}.`
  }

  return `${command} encerrou com ${status}: ${detail}`
}

function isJsonlStdoutChunk(chunk) {
  const output = String(chunk).replace(/^\uFEFF/, '').trimStart()

  return !output || output.startsWith('{')
}

function createNonJsonStdoutMessage(command, chunk) {
  const output = String(chunk).trim().slice(0, 500)

  if (!output) {
    return `${command} retornou uma saída inesperada fora do formato JSON.`
  }

  return `${command} retornou uma saída inesperada fora do formato JSON: ${output}`
}

module.exports = {
  registerCliIpcHandlers,
}
