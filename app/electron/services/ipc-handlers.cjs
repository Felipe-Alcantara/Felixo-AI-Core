const { app, ipcMain } = require('electron')
const { CliProcessManager } = require('./cli-process-manager.cjs')
const { createJsonlLineReader } = require('./jsonl-line-reader.cjs')
const { createJsonlOutputGuard } = require('./jsonl-output-guard.cjs')
const { logQaEvent } = require('./qa-logger.cjs')

const adapters = {
  claude: require('./adapters/claude-adapter.cjs'),
  codex: require('./adapters/codex-adapter.cjs'),
  gemini: require('./adapters/gemini-adapter.cjs'),
}

const cliManager = new CliProcessManager()
const stoppedSessions = new Set()
const FIRST_VISIBLE_OUTPUT_TIMEOUT_MS = 120000

function registerCliIpcHandlers(getMainWindow) {
  ipcMain.handle('cli:send', (event, params) => {
    const sessionId = getRequiredString(params?.sessionId)
    const prompt = getRequiredString(params?.prompt)
    const model = params?.model
    const projectCwd = typeof params?.cwd === 'string' && params.cwd ? params.cwd : null
    const cliType = model?.cliType
    const adapter = adapters[cliType]
    const targetWebContents = getTargetWebContents(getMainWindow, event.sender)

    if (!sessionId || !prompt) {
      logQaEvent({
        level: 'warn',
        scope: 'cli:send',
        sessionId,
        message: 'Rejected send request with invalid prompt or session.',
      })
      return { ok: false, message: 'Prompt ou sessão inválidos.' }
    }

    if (!adapter) {
      logQaEvent({
        level: 'error',
        scope: 'cli:send',
        sessionId,
        message: 'No adapter configured for model.',
        details: {
          cliType,
          modelName: model?.name,
          command: model?.command,
        },
      })
      sendCliEvent(targetWebContents, {
        type: 'error',
        message: 'Modelo sem CLI compatível configurada.',
        sessionId,
      })
      return { ok: false, message: 'Modelo sem CLI compatível configurada.' }
    }

    stoppedSessions.delete(sessionId)

    const cwd = projectCwd ?? resolveCliCwd(cliType)
    const { command, args } = adapter.getSpawnArgs(prompt, { cwd, model })
    let didComplete = false
    let didEmitVisibleOutput = false
    let stderrOutput = ''
    let firstVisibleOutputTimer = null

    try {
      logQaEvent({
        level: 'info',
        scope: 'cli:spawn',
        sessionId,
        message: `Starting ${command}.`,
        details: {
          cliType,
          modelName: model?.name,
          command,
          args,
          cwd,
          promptPreview: createTextPreview(prompt),
        },
      })
      const childProcess = cliManager.spawn(sessionId, command, args, cwd)
      firstVisibleOutputTimer = setTimeout(() => {
        if (didComplete || didEmitVisibleOutput) {
          return
        }

        didComplete = true
        logQaEvent({
          level: 'warn',
          scope: 'cli:timeout',
          sessionId,
          message: `${command} produced no visible output in time.`,
          details: {
            timeoutMs: FIRST_VISIBLE_OUTPUT_TIMEOUT_MS,
          },
        })
        sendCliEvent(targetWebContents, {
          type: 'error',
          message: createNoVisibleOutputMessage(
            command,
            FIRST_VISIBLE_OUTPUT_TIMEOUT_MS,
          ),
          sessionId,
        })
        cliManager.kill(sessionId)
      }, FIRST_VISIBLE_OUTPUT_TIMEOUT_MS)
      logQaEvent({
        level: 'info',
        scope: 'cli:process',
        sessionId,
        message: `Spawned ${command}.`,
        details: {
          pid: childProcess.pid,
        },
      })
      const stdoutReader = createJsonlLineReader((line) => {
        logQaEvent({
          level: 'debug',
          scope: 'cli:jsonl',
          sessionId,
          message: `Parsed JSONL line from ${command}.`,
          details: {
            preview: createTextPreview(line, 500),
          },
        })
        const cliEvent = parseAdapterLine(adapter, line)

        if (!cliEvent) {
          return
        }

        if (cliEvent.type === 'done') {
          didComplete = true
          clearFirstVisibleOutputTimer()
        }

        if (cliEvent.type === 'text' && cliEvent.text.trim()) {
          didEmitVisibleOutput = true
          clearFirstVisibleOutputTimer()
        }

        sendCliEvent(targetWebContents, {
          ...cliEvent,
          sessionId,
        })
      })
      const flushStdout = () => stdoutReader.flush()
      const stdoutGuard = createJsonlOutputGuard(
        (chunk) => {
          logQaEvent({
            level: 'debug',
            scope: 'cli:stdout',
            sessionId,
            message: `stdout from ${command}.`,
            details: createChunkDetails(chunk),
          })
          stdoutReader.push(chunk)
        },
        (output) => {
          didComplete = true
          clearFirstVisibleOutputTimer()
          logQaEvent({
            level: 'warn',
            scope: 'cli:stdout',
            sessionId,
            message: `${command} produced non-JSON stdout.`,
            details: createChunkDetails(output),
          })
          sendCliEvent(targetWebContents, {
            type: 'error',
            message: createNonJsonStdoutMessage(command, output),
            sessionId,
          })
          cliManager.kill(sessionId)
        },
      )

      childProcess.stdout.setEncoding('utf8')
      childProcess.stdout.on('data', (chunk) => {
        stdoutGuard.push(chunk)
        sendRawOutput(targetWebContents, {
          sessionId,
          source: 'stdout',
          chunk: String(chunk),
        })
      })
      childProcess.stdout.on('end', flushStdout)

      childProcess.stderr.setEncoding('utf8')
      childProcess.stderr.on('data', (chunk) => {
        stderrOutput = `${stderrOutput}${chunk}`.slice(-4000)
        sendRawOutput(targetWebContents, {
          sessionId,
          source: 'stderr',
          chunk: String(chunk),
        })
        logQaEvent({
          level: 'warn',
          scope: 'cli:stderr',
          sessionId,
          message: `stderr from ${command}.`,
          details: createChunkDetails(chunk),
        })
      })

      childProcess.on('error', (error) => {
        didComplete = true
        clearFirstVisibleOutputTimer()
        logQaEvent({
          level: 'error',
          scope: 'cli:error',
          sessionId,
          message: `${command} process error.`,
          details: {
            message: error.message,
          },
        })
        sendCliEvent(targetWebContents, {
          type: 'error',
          message: error.message,
          sessionId,
        })
      })

      childProcess.on('close', (code, signal) => {
        clearFirstVisibleOutputTimer()
        flushStdout()
        logQaEvent({
          level: code && code !== 0 ? 'error' : 'info',
          scope: 'cli:close',
          sessionId,
          message: `${command} closed.`,
          details: {
            pid: childProcess.pid,
            code,
            signal,
            didComplete,
            stderrPreview: createTextPreview(stderrOutput),
          },
        })

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
      clearFirstVisibleOutputTimer()
      const message =
        error instanceof Error ? error.message : 'Falha ao iniciar processo CLI.'
      logQaEvent({
        level: 'error',
        scope: 'cli:spawn',
        sessionId,
        message: `Failed to start ${command}.`,
        details: {
          message,
        },
      })
      sendCliEvent(targetWebContents, {
        type: 'error',
        message,
        sessionId,
      })
      return { ok: false, message }
    }

    function clearFirstVisibleOutputTimer() {
      if (!firstVisibleOutputTimer) {
        return
      }

      clearTimeout(firstVisibleOutputTimer)
      firstVisibleOutputTimer = null
    }
  })

  ipcMain.handle('cli:stop', (event, params) => {
    const sessionId = getRequiredString(params?.sessionId)

    if (!sessionId) {
      logQaEvent({
        level: 'warn',
        scope: 'cli:stop',
        message: 'Rejected stop request with invalid session.',
      })
      return { ok: false, message: 'Sessão inválida.' }
    }

    stoppedSessions.add(sessionId)
    const killed = cliManager.kill(sessionId)
    const targetWebContents = getTargetWebContents(getMainWindow, event.sender)
    logQaEvent({
      level: killed ? 'info' : 'warn',
      scope: 'cli:stop',
      sessionId,
      message: killed ? 'Stop signal sent.' : 'No process found to stop.',
    })

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
    logQaEvent({
      level: 'info',
      scope: 'app',
      message: 'before-quit: killing all CLI processes.',
    })
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

function sendRawOutput(webContents, event) {
  if (!webContents || webContents.isDestroyed()) {
    return
  }

  webContents.send('cli:raw-output', event)
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

function createNonJsonStdoutMessage(command, chunk) {
  const output = String(chunk).trim().slice(0, 500)

  if (!output) {
    return `${command} retornou uma saída inesperada fora do formato JSON.`
  }

  return `${command} retornou uma saída inesperada fora do formato JSON: ${output}`
}

function createNoVisibleOutputMessage(command, timeoutMs) {
  const timeoutSeconds = Math.round(timeoutMs / 1000)

  return `${command} não gerou resposta textual em ${timeoutSeconds}s. A execução foi interrompida.`
}

function createChunkDetails(chunk) {
  const text = String(chunk)

  return {
    bytes: Buffer.byteLength(text),
    preview: createTextPreview(text),
  }
}

function createTextPreview(value, maxLength = 1000) {
  const text = String(value ?? '')

  if (text.length <= maxLength) {
    return text
  }

  return `${text.slice(0, maxLength)}...`
}

module.exports = {
  registerCliIpcHandlers,
}
