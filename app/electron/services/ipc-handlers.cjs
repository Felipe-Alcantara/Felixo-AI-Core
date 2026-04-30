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
const cliThreadSessions = new Map()
const FIRST_VISIBLE_OUTPUT_TIMEOUT_MS = 120000

function registerCliIpcHandlers(getMainWindow) {
  ipcMain.handle('cli:send', (event, params) => {
    const streamSessionId = getRequiredString(params?.sessionId)
    const threadId = getRequiredString(params?.threadId) || streamSessionId
    const prompt = getRequiredString(params?.prompt)
    const model = params?.model
    const projectCwd = typeof params?.cwd === 'string' && params.cwd ? params.cwd : null
    const cliType = model?.cliType
    const adapter = adapters[cliType]
    const targetWebContents = getTargetWebContents(getMainWindow, event.sender)

    if (!streamSessionId || !threadId || !prompt) {
      logQaEvent({
        level: 'warn',
        scope: 'cli:send',
        sessionId: threadId || streamSessionId,
        message: 'Rejected send request with invalid prompt or session.',
      })
      return { ok: false, message: 'Prompt ou sessão inválidos.' }
    }

    if (!adapter) {
      logQaEvent({
        level: 'error',
        scope: 'cli:send',
        sessionId: threadId,
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
        sessionId: streamSessionId,
      })
      return { ok: false, message: 'Modelo sem CLI compatível configurada.' }
    }

    stoppedSessions.delete(threadId)

    const cwd = projectCwd ?? resolveCliCwd(cliType)
    const threadSession = getCliThreadSession(threadId, model)
    const spawnContext = {
      cwd,
      model,
      threadId,
      providerSessionId: threadSession.providerSessionId,
      isContinuation: threadSession.hasStarted,
    }
    const { command, args } = getAdapterSpawnArgs(adapter, prompt, spawnContext)
    let didComplete = false
    let didEmitVisibleOutput = false
    let stderrOutput = ''
    let firstVisibleOutputTimer = null

    try {
      logQaEvent({
        level: 'info',
        scope: 'cli:spawn',
        sessionId: threadId,
        message: `Starting ${command}.`,
        details: {
          streamSessionId,
          cliType,
          modelName: model?.name,
          command,
          args,
          cwd,
          isContinuation: spawnContext.isContinuation,
          providerSessionId: spawnContext.providerSessionId,
          promptPreview: createTextPreview(prompt),
        },
      })
      const childProcess = cliManager.spawn(threadId, command, args, cwd)
      threadSession.hasStarted = true
      firstVisibleOutputTimer = setTimeout(() => {
        if (didComplete || didEmitVisibleOutput) {
          return
        }

        didComplete = true
        logQaEvent({
          level: 'warn',
          scope: 'cli:timeout',
          sessionId: threadId,
          message: `${command} produced no visible output in time.`,
          details: {
            streamSessionId,
            timeoutMs: FIRST_VISIBLE_OUTPUT_TIMEOUT_MS,
          },
        })
        sendCliEvent(targetWebContents, {
          type: 'error',
          message: createNoVisibleOutputMessage(
            command,
            FIRST_VISIBLE_OUTPUT_TIMEOUT_MS,
          ),
          sessionId: streamSessionId,
        })
        cliManager.kill(threadId)
      }, FIRST_VISIBLE_OUTPUT_TIMEOUT_MS)
      logQaEvent({
        level: 'info',
        scope: 'cli:process',
        sessionId: threadId,
        message: `Spawned ${command}.`,
        details: {
          streamSessionId,
          pid: childProcess.pid,
        },
      })
      const stdoutReader = createJsonlLineReader((line) => {
        logQaEvent({
          level: 'debug',
          scope: 'cli:jsonl',
          sessionId: threadId,
          message: `Parsed JSONL line from ${command}.`,
          details: {
            streamSessionId,
            preview: createTextPreview(line, 500),
          },
        })
        const cliEvent = parseAdapterLine(adapter, line)

        if (!cliEvent) {
          return
        }

        if (cliEvent.providerSessionId) {
          threadSession.providerSessionId = cliEvent.providerSessionId
        }

        if (cliEvent.type === 'session') {
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
          sessionId: streamSessionId,
        })
      })
      const flushStdout = () => stdoutReader.flush()
      const stdoutGuard = createJsonlOutputGuard(
        (chunk) => {
          logQaEvent({
            level: 'debug',
            scope: 'cli:stdout',
            sessionId: threadId,
            message: `stdout from ${command}.`,
            details: {
              streamSessionId,
              ...createChunkDetails(chunk),
            },
          })
          stdoutReader.push(chunk)
        },
        (output) => {
          didComplete = true
          clearFirstVisibleOutputTimer()
          logQaEvent({
            level: 'warn',
            scope: 'cli:stdout',
            sessionId: threadId,
            message: `${command} produced non-JSON stdout.`,
            details: {
              streamSessionId,
              ...createChunkDetails(output),
            },
          })
          sendCliEvent(targetWebContents, {
            type: 'error',
            message: createNonJsonStdoutMessage(command, output),
            sessionId: streamSessionId,
          })
          cliManager.kill(threadId)
        },
      )

      childProcess.stdout.setEncoding('utf8')
      childProcess.stdout.on('data', (chunk) => {
        stdoutGuard.push(chunk)
        sendRawOutput(targetWebContents, {
          sessionId: threadId,
          source: 'stdout',
          chunk: String(chunk),
        })
      })
      childProcess.stdout.on('end', flushStdout)

      childProcess.stderr.setEncoding('utf8')
      childProcess.stderr.on('data', (chunk) => {
        const stderrLevel = getAdapterStderrLevel(adapter, chunk)
        stderrOutput = `${stderrOutput}${chunk}`.slice(-4000)
        sendRawOutput(targetWebContents, {
          sessionId: threadId,
          source: 'stderr',
          chunk: String(chunk),
          severity: stderrLevel,
        })
        logQaEvent({
          level: stderrLevel,
          scope: 'cli:stderr',
          sessionId: threadId,
          message: `stderr from ${command}.`,
          details: {
            streamSessionId,
            ...createChunkDetails(chunk),
          },
        })
      })

      childProcess.on('error', (error) => {
        didComplete = true
        clearFirstVisibleOutputTimer()
        logQaEvent({
          level: 'error',
          scope: 'cli:error',
          sessionId: threadId,
          message: `${command} process error.`,
          details: {
            streamSessionId,
            message: error.message,
          },
        })
        sendCliEvent(targetWebContents, {
          type: 'error',
          message: error.message,
          sessionId: streamSessionId,
        })
      })

      childProcess.on('close', (code, signal) => {
        clearFirstVisibleOutputTimer()
        flushStdout()
        logQaEvent({
          level: code && code !== 0 ? 'error' : 'info',
          scope: 'cli:close',
          sessionId: threadId,
          message: `${command} closed.`,
          details: {
            streamSessionId,
            pid: childProcess.pid,
            code,
            signal,
            didComplete,
            stderrPreview: createTextPreview(stderrOutput),
          },
        })

        if (stoppedSessions.delete(threadId)) {
          return
        }

        if (didComplete) {
          return
        }

        if (code && code !== 0) {
          sendCliEvent(targetWebContents, {
            type: 'error',
            message: createExitErrorMessage(command, code, signal, stderrOutput),
            sessionId: streamSessionId,
          })
          return
        }

        sendCliEvent(targetWebContents, {
          type: 'done',
          sessionId: streamSessionId,
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
        sessionId: threadId,
        message: `Failed to start ${command}.`,
        details: {
          streamSessionId,
          message,
        },
      })
      sendCliEvent(targetWebContents, {
        type: 'error',
        message,
        sessionId: streamSessionId,
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
    const streamSessionId = getRequiredString(params?.sessionId)
    const threadId = getRequiredString(params?.threadId) || streamSessionId

    if (!streamSessionId || !threadId) {
      logQaEvent({
        level: 'warn',
        scope: 'cli:stop',
        message: 'Rejected stop request with invalid session.',
      })
      return { ok: false, message: 'Sessão inválida.' }
    }

    stoppedSessions.add(threadId)
    const killed = cliManager.kill(threadId)
    const targetWebContents = getTargetWebContents(getMainWindow, event.sender)
    logQaEvent({
      level: killed ? 'info' : 'warn',
      scope: 'cli:stop',
      sessionId: threadId,
      message: killed ? 'Stop signal sent.' : 'No process found to stop.',
      details: {
        streamSessionId,
      },
    })

    if (killed) {
      sendCliEvent(targetWebContents, {
        type: 'done',
        sessionId: streamSessionId,
        stopped: true,
      })
    } else {
      stoppedSessions.delete(threadId)
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

function getCliThreadSession(threadId, model) {
  const modelKey = createModelSessionKey(model)
  const currentSession = cliThreadSessions.get(threadId)

  if (currentSession?.modelKey === modelKey) {
    return currentSession
  }

  const nextSession = {
    modelKey,
    providerSessionId: null,
    hasStarted: false,
  }
  cliThreadSessions.set(threadId, nextSession)
  return nextSession
}

function getAdapterSpawnArgs(adapter, prompt, context) {
  if (
    context.isContinuation &&
    typeof adapter.getResumeArgs === 'function'
  ) {
    return adapter.getResumeArgs(prompt, context)
  }

  return adapter.getSpawnArgs(prompt, context)
}

function getAdapterStderrLevel(adapter, chunk) {
  if (typeof adapter.classifyStderr !== 'function') {
    return 'warn'
  }

  const level = adapter.classifyStderr(chunk)

  return ['debug', 'info', 'warn', 'error'].includes(level) ? level : 'warn'
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

function createModelSessionKey(model) {
  return [
    model?.cliType ?? 'unknown',
    model?.command ?? '',
    model?.id ?? '',
  ].join(':')
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
