const { app, ipcMain } = require('electron')
const { CliProcessManager } = require('./cli-process-manager.cjs')
const {
  choosePersistentPrompt,
  createCliExecutionPlan,
  getAdapterSpawnArgs,
  normalizePersistentInput,
} = require('./orchestrator/cli-execution-planner.cjs')
const {
  getTerminalAdapter,
} = require('./providers/terminal-adapter-registry.cjs')
const { createJsonlLineReader } = require('./jsonl-line-reader.cjs')
const { createJsonlOutputGuard } = require('./jsonl-output-guard.cjs')
const { logQaEvent } = require('./qa-logger.cjs')
const {
  createErrorTerminalEvent,
  createStartTerminalEvent,
  createStderrTerminalEvent,
  createTerminalEvents,
} = require('./terminal-event-formatter.cjs')

const cliManager = new CliProcessManager()
const stoppedSessions = new Set()
const cliThreadSessions = new Map()
const persistentCliSessions = new Map()
const FIRST_VISIBLE_OUTPUT_TIMEOUT_MS = 120000
const PERSISTENT_SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000

function registerCliIpcHandlers(getMainWindow) {
  ipcMain.handle('cli:send', (event, params) => {
    const streamSessionId = getRequiredString(params?.sessionId)
    const threadId = getRequiredString(params?.threadId) || streamSessionId
    const prompt = getRequiredString(params?.prompt)
    const resumePrompt = getRequiredString(params?.resumePrompt)
    const model = params?.model
    const projectCwd = typeof params?.cwd === 'string' && params.cwd ? params.cwd : null
    const cliType = model?.cliType
    const adapter = getTerminalAdapter(cliType)
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
        threadId,
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
    const executionPlan = createCliExecutionPlan({
      adapter,
      context: spawnContext,
      prompt,
      resumePrompt,
    })

    if (executionPlan.usesPersistentProcess) {
      return sendPersistentCliRequest({
        adapter,
        targetWebContents,
        streamSessionId,
        threadId,
        prompt,
        resumePrompt,
        context: spawnContext,
        threadSession,
        cliType,
        model,
        cwd,
      })
    }

    spawnContext.usesNativeResume = executionPlan.usesNativeResume
    const usesNativeResume = executionPlan.usesNativeResume
    const spawnPrompt = executionPlan.spawnPrompt
    const { command, args } = getAdapterSpawnArgs(adapter, spawnPrompt, spawnContext)
    let didComplete = false
    let didEmitVisibleOutput = false
    let stderrOutput = ''
    let firstVisibleOutputTimer = null
    const processStartedAt = Date.now()

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
          usesNativeResume,
          providerSessionId: spawnContext.providerSessionId,
          promptPreview: createTextPreview(spawnPrompt),
        },
      })
      sendTerminalEvents(targetWebContents, threadId, [
        createStartTerminalEvent({
          command,
          cliType,
          modelName: model?.name,
          cwd,
          isContinuation: spawnContext.isContinuation,
          usesNativeResume,
          providerSessionId: spawnContext.providerSessionId,
        }),
      ])
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
        sendTerminalEvents(targetWebContents, threadId, [
          createErrorTerminalEvent(
            createNoVisibleOutputMessage(command, FIRST_VISIBLE_OUTPUT_TIMEOUT_MS),
          ),
        ])
        sendCliEvent(targetWebContents, {
          type: 'error',
          message: createNoVisibleOutputMessage(
            command,
            FIRST_VISIBLE_OUTPUT_TIMEOUT_MS,
          ),
          sessionId: streamSessionId,
          threadId,
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
        sendTerminalEvents(
          targetWebContents,
          threadId,
          createTerminalEvents({
            command,
            line,
            cliEvent,
            durationMs: Date.now() - processStartedAt,
          }),
        )

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
          threadId,
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
          sendTerminalEvents(targetWebContents, threadId, [
            createErrorTerminalEvent(createNonJsonStdoutMessage(command, output)),
          ])
          sendCliEvent(targetWebContents, {
            type: 'error',
            message: createNonJsonStdoutMessage(command, output),
            sessionId: streamSessionId,
            threadId,
          })
          cliManager.kill(threadId)
        },
      )

      childProcess.stdout.setEncoding('utf8')
      childProcess.stdout.on('data', (chunk) => {
        stdoutGuard.push(chunk)
      })
      childProcess.stdout.on('end', flushStdout)

      childProcess.stderr.setEncoding('utf8')
      childProcess.stderr.on('data', (chunk) => {
        if (shouldSuppressAdapterStderr(adapter, chunk)) {
          return
        }

        const stderrLevel = getAdapterStderrLevel(adapter, chunk)
        stderrOutput = `${stderrOutput}${chunk}`.slice(-4000)
        const formattedStderr = formatAdapterStderr(adapter, chunk)
        sendTerminalEvents(targetWebContents, threadId, [
          createStderrTerminalEvent(formattedStderr, stderrLevel),
        ])
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

        if (shouldAbortOnAdapterStderr(adapter, chunk) && !didComplete) {
          didComplete = true
          clearFirstVisibleOutputTimer()
          sendCliEvent(targetWebContents, {
            type: 'error',
            message: formattedStderr,
            sessionId: streamSessionId,
            threadId,
          })
          cliManager.kill(threadId)
        }
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
        sendTerminalEvents(targetWebContents, threadId, [
          createErrorTerminalEvent(error.message),
        ])
        sendCliEvent(targetWebContents, {
          type: 'error',
          message: error.message,
          sessionId: streamSessionId,
          threadId,
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
          sendTerminalEvents(targetWebContents, threadId, [
            createErrorTerminalEvent(
              createExitErrorMessage(command, code, signal, stderrOutput),
            ),
          ])
          sendCliEvent(targetWebContents, {
            type: 'error',
            message: createExitErrorMessage(command, code, signal, stderrOutput),
            sessionId: streamSessionId,
            threadId,
          })
          return
        }

        const elapsedMs = Date.now() - processStartedAt
        sendTerminalEvents(targetWebContents, threadId, [
          {
            source: 'system',
            kind: 'metrics',
            severity: 'info',
            title: 'Concluído',
            chunk: `Tempo: ${formatDuration(elapsedMs)}`,
            metadata: {
              durationMs: elapsedMs,
            },
          },
        ])
        sendCliEvent(targetWebContents, {
          type: 'done',
          sessionId: streamSessionId,
          threadId,
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
      sendTerminalEvents(targetWebContents, threadId, [
        createErrorTerminalEvent(message),
      ])
      sendCliEvent(targetWebContents, {
        type: 'error',
        message,
        sessionId: streamSessionId,
        threadId,
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
      sendTerminalEvents(targetWebContents, threadId, [
        {
          source: 'system',
          kind: 'lifecycle',
          severity: 'warn',
          title: 'Interrompido',
          chunk: 'Execução interrompida pelo usuário.',
        },
      ])
      sendCliEvent(targetWebContents, {
        type: 'done',
        sessionId: streamSessionId,
        threadId,
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
    cliManager.killAll({ force: true })
  })
}

function sendPersistentCliRequest({
  adapter,
  targetWebContents,
  streamSessionId,
  threadId,
  prompt,
  resumePrompt,
  context,
  threadSession,
  cliType,
  model,
  cwd,
}) {
  const existingSession = getReusablePersistentSession(threadId, model, cwd)
  const isReusingProcess = Boolean(existingSession)
  const spawnPrompt = choosePersistentPrompt({
    adapter,
    isReusingProcess,
    context,
    prompt,
    resumePrompt,
  })
  let persistentSession = existingSession

  if (persistentSession?.activeRun) {
    return { ok: false, message: 'A CLI ainda está processando esta conversa.' }
  }

  try {
    if (!persistentSession) {
      persistentSession = startPersistentCliSession({
        adapter,
        targetWebContents,
        threadId,
        context,
        threadSession,
        cliType,
        model,
        cwd,
        streamSessionId,
      })
    } else {
      persistentSession.targetWebContents = targetWebContents
      persistentSession.threadSession = threadSession
      clearPersistentIdleTimer(persistentSession)
    }

    const { command } = persistentSession
    const processStartedAt = Date.now()
    const run = {
      streamSessionId,
      startedAt: processStartedAt,
      prompt: spawnPrompt,
      context,
      didStartSession: false,
      didSendPrompt: false,
      didComplete: false,
      didEmitVisibleOutput: false,
      firstVisibleOutputTimer: null,
      stderrOutput: '',
    }

    persistentSession.activeRun = run

    logQaEvent({
      level: 'info',
      scope: isReusingProcess ? 'cli:persistent-write' : 'cli:persistent-spawn',
      sessionId: threadId,
      message: isReusingProcess
        ? `Sending prompt to persistent ${command}.`
        : `Starting persistent ${command}.`,
      details: {
        streamSessionId,
        cliType,
        modelName: model?.name,
        command,
        args: persistentSession.args,
        cwd,
        isContinuation: context.isContinuation,
        isReusingProcess,
        providerSessionId: context.providerSessionId,
        promptPreview: createTextPreview(spawnPrompt),
      },
    })

    sendTerminalEvents(targetWebContents, threadId, [
      createStartTerminalEvent({
        command,
        cliType,
        modelName: model?.name,
        cwd,
        isContinuation: context.isContinuation,
        usesPersistentProcess: true,
        reusedProcess: isReusingProcess,
        providerSessionId: context.providerSessionId,
      }),
    ])

    run.firstVisibleOutputTimer = setTimeout(() => {
      if (run.didComplete || run.didEmitVisibleOutput) {
        return
      }

      failPersistentRun(
        persistentSession,
        createNoVisibleOutputMessage(command, FIRST_VISIBLE_OUTPUT_TIMEOUT_MS),
        {
          logScope: 'cli:timeout',
          level: 'warn',
          details: {
            streamSessionId,
            timeoutMs: FIRST_VISIBLE_OUTPUT_TIMEOUT_MS,
          },
        },
      )
      closePersistentSession(threadId)
    }, FIRST_VISIBLE_OUTPUT_TIMEOUT_MS)

    const persistentInput = normalizePersistentInput(adapter.createPersistentInput(spawnPrompt, {
      ...context,
      isReusingProcess,
      streamSessionId,
      persistentPhase: 'initial',
    }))
    run.didStartSession = persistentInput.didStartSession
    run.didSendPrompt = persistentInput.didSendPrompt

    if (!cliManager.write(threadId, persistentInput.input)) {
      failPersistentRun(persistentSession, `${command} não aceitou entrada via stdin.`)
      closePersistentSession(threadId)
      return { ok: false, message: 'Falha ao enviar prompt para a CLI persistente.' }
    }

    threadSession.hasStarted = true
    return { ok: true }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Falha ao iniciar processo CLI persistente.'

    logQaEvent({
      level: 'error',
      scope: 'cli:persistent-spawn',
      sessionId: threadId,
      message: 'Failed to use persistent CLI process.',
      details: {
        streamSessionId,
        message,
      },
    })
    sendTerminalEvents(targetWebContents, threadId, [
      createErrorTerminalEvent(message),
    ])
    sendCliEvent(targetWebContents, {
      type: 'error',
      message,
      sessionId: streamSessionId,
      threadId,
    })
    closePersistentSession(threadId, { force: true })
    return { ok: false, message }
  }
}

function startPersistentCliSession({
  adapter,
  targetWebContents,
  threadId,
  context,
  threadSession,
  cliType,
  model,
  cwd,
  streamSessionId,
}) {
  const { command, args } = adapter.getPersistentSpawnArgs(context)
  const childProcess = cliManager.spawn(threadId, command, args, cwd, {
    openStdin: true,
  })
  const persistentSession = {
    adapter,
    args,
    childProcess,
    cliType,
    command,
    cwd,
    idleTimer: null,
    modelKey: createModelSessionKey(model),
    modelName: model?.name,
    targetWebContents,
    threadId,
    threadSession,
    activeRun: null,
  }

  persistentCliSessions.set(threadId, persistentSession)

  logQaEvent({
    level: 'info',
    scope: 'cli:process',
    sessionId: threadId,
    message: `Spawned persistent ${command}.`,
    details: {
      streamSessionId,
      pid: childProcess.pid,
    },
  })

  const stdoutReader = createJsonlLineReader((line) => {
    handlePersistentStdoutLine(persistentSession, line)
  })
  const stdoutGuard = createJsonlOutputGuard(
    (chunk) => {
      logQaEvent({
        level: 'debug',
        scope: 'cli:stdout',
        sessionId: threadId,
        message: `stdout from persistent ${command}.`,
        details: createChunkDetails(chunk),
      })
      stdoutReader.push(chunk)
    },
    (output) => {
      failPersistentRun(
        persistentSession,
        createNonJsonStdoutMessage(command, output),
        {
          logScope: 'cli:stdout',
          level: 'warn',
          details: createChunkDetails(output),
        },
      )
      closePersistentSession(threadId)
    },
  )

  childProcess.stdout.setEncoding('utf8')
  childProcess.stdout.on('data', (chunk) => {
    stdoutGuard.push(chunk)
  })
  childProcess.stdout.on('end', () => stdoutReader.flush())

  childProcess.stderr.setEncoding('utf8')
  childProcess.stderr.on('data', (chunk) => {
    handlePersistentStderr(persistentSession, chunk)
  })

  childProcess.on('error', (error) => {
    failPersistentRun(
      persistentSession,
      error instanceof Error ? error.message : 'Falha no processo CLI persistente.',
      {
        logScope: 'cli:error',
        level: 'error',
        details: {
          message: error instanceof Error ? error.message : String(error),
        },
      },
    )
    closePersistentSession(threadId, { force: true })
  })

  childProcess.on('close', (code, signal) => {
    stdoutReader.flush()
    handlePersistentClose(persistentSession, code, signal)
  })

  return persistentSession
}

function handlePersistentStdoutLine(persistentSession, line) {
  const { adapter, command, threadId, threadSession } = persistentSession
  const activeRun = persistentSession.activeRun
  const streamSessionId = activeRun?.streamSessionId
  const durationMs = Date.now() - (activeRun?.startedAt ?? Date.now())

  logQaEvent({
    level: 'debug',
    scope: 'cli:jsonl',
    sessionId: threadId,
    message: `Parsed JSONL line from persistent ${command}.`,
    details: {
      streamSessionId,
      preview: createTextPreview(line, 500),
    },
  })

  const cliEvent = parseAdapterLine(adapter, line)
  sendTerminalEvents(
    persistentSession.targetWebContents,
    threadId,
    createTerminalEvents({
      command,
      line,
      cliEvent,
      durationMs,
    }),
  )

  if (!cliEvent) {
    return
  }

  if (cliEvent.responseInput) {
    cliManager.write(threadId, cliEvent.responseInput)
  }

  if (cliEvent.readyForSession && activeRun && !activeRun.didStartSession) {
    writeNextPersistentInput(persistentSession, activeRun, {
      persistentPhase: 'session',
    })
    return
  }

  if (cliEvent.providerSessionId) {
    threadSession.providerSessionId = cliEvent.providerSessionId
  }

  if (cliEvent.readyForPrompt && activeRun && !activeRun.didSendPrompt) {
    writeNextPersistentInput(persistentSession, activeRun, {
      providerSessionId: threadSession.providerSessionId,
      persistentPhase: 'prompt',
    })
  }

  if (cliEvent.type === 'session') {
    return
  }

  if (cliEvent.type === 'control') {
    return
  }

  if (!activeRun) {
    logQaEvent({
      level: 'warn',
      scope: 'cli:persistent-orphan-output',
      sessionId: threadId,
      message: `Persistent ${command} emitted output without an active request.`,
      details: {
        cliEventType: cliEvent.type,
      },
    })
    return
  }

  if (cliEvent.type === 'text' && cliEvent.text.trim()) {
    activeRun.didEmitVisibleOutput = true
    clearPersistentRunTimer(activeRun)
  }

  if (cliEvent.type === 'done') {
    activeRun.didComplete = true
    clearPersistentRunTimer(activeRun)
  }

  if (cliEvent.type === 'error') {
    activeRun.didComplete = true
    clearPersistentRunTimer(activeRun)
  }

  sendCliEvent(persistentSession.targetWebContents, {
    ...cliEvent,
    sessionId: activeRun.streamSessionId,
    threadId,
  })

  if (cliEvent.type === 'done') {
    persistentSession.activeRun = null
    schedulePersistentIdleTimer(persistentSession)
    return
  }

  if (cliEvent.type === 'error') {
    persistentSession.activeRun = null
    closePersistentSession(threadId)
  }
}

function writeNextPersistentInput(persistentSession, activeRun, contextOverrides = {}) {
  const { adapter, command, threadId } = persistentSession
  const nextInput = normalizePersistentInput(adapter.createPersistentInput(
    activeRun.prompt,
    {
      ...activeRun.context,
      ...contextOverrides,
      isReusingProcess: true,
      streamSessionId: activeRun.streamSessionId,
    },
  ))

  activeRun.didStartSession = activeRun.didStartSession || nextInput.didStartSession
  activeRun.didSendPrompt = activeRun.didSendPrompt || nextInput.didSendPrompt

  if (cliManager.write(threadId, nextInput.input)) {
    return true
  }

  failPersistentRun(persistentSession, `${command} não aceitou entrada via stdin.`)
  closePersistentSession(threadId)
  return false
}

function handlePersistentStderr(persistentSession, chunk) {
  const { adapter, command, threadId } = persistentSession

  if (shouldSuppressAdapterStderr(adapter, chunk)) {
    return
  }

  const stderrLevel = getAdapterStderrLevel(adapter, chunk)
  const formattedStderr = formatAdapterStderr(adapter, chunk)
  const activeRun = persistentSession.activeRun

  if (activeRun) {
    activeRun.stderrOutput = `${activeRun.stderrOutput}${chunk}`.slice(-4000)
  }

  sendTerminalEvents(persistentSession.targetWebContents, threadId, [
    createStderrTerminalEvent(formattedStderr, stderrLevel),
  ])
  logQaEvent({
    level: stderrLevel,
    scope: 'cli:stderr',
    sessionId: threadId,
    message: `stderr from persistent ${command}.`,
    details: createChunkDetails(chunk),
  })

  if (shouldAbortOnAdapterStderr(adapter, chunk) && activeRun && !activeRun.didComplete) {
    failPersistentRun(persistentSession, formattedStderr)
    closePersistentSession(threadId)
  }
}

function handlePersistentClose(persistentSession, code, signal) {
  const { command, threadId } = persistentSession
  const activeRun = persistentSession.activeRun

  clearPersistentIdleTimer(persistentSession)
  if (persistentCliSessions.get(threadId) === persistentSession) {
    persistentCliSessions.delete(threadId)
  }
  logQaEvent({
    level: code && code !== 0 ? 'error' : 'info',
    scope: 'cli:close',
    sessionId: threadId,
    message: `Persistent ${command} closed.`,
    details: {
      pid: persistentSession.childProcess.pid,
      code,
      signal,
      didComplete: activeRun?.didComplete ?? true,
      stderrPreview: createTextPreview(activeRun?.stderrOutput ?? ''),
    },
  })

  if (stoppedSessions.delete(threadId)) {
    clearPersistentRunTimer(activeRun)
    persistentSession.activeRun = null
    return
  }

  if (!activeRun || activeRun.didComplete) {
    return
  }

  clearPersistentRunTimer(activeRun)
  const message =
    code && code !== 0
      ? createExitErrorMessage(command, code, signal, activeRun.stderrOutput)
      : `${command} encerrou antes de concluir a resposta.`

  sendTerminalEvents(persistentSession.targetWebContents, threadId, [
    createErrorTerminalEvent(message),
  ])
  sendCliEvent(persistentSession.targetWebContents, {
    type: 'error',
    message,
    sessionId: activeRun.streamSessionId,
    threadId,
  })
  persistentSession.activeRun = null
}

function failPersistentRun(persistentSession, message, options = {}) {
  const { command, threadId } = persistentSession
  const activeRun = persistentSession.activeRun
  const streamSessionId = activeRun?.streamSessionId

  if (activeRun) {
    activeRun.didComplete = true
    clearPersistentRunTimer(activeRun)
  }

  logQaEvent({
    level: options.level ?? 'error',
    scope: options.logScope ?? 'cli:persistent',
    sessionId: threadId,
    message: `${command} persistent request failed.`,
    details: {
      streamSessionId,
      ...(options.details ?? {}),
    },
  })
  sendTerminalEvents(persistentSession.targetWebContents, threadId, [
    createErrorTerminalEvent(message),
  ])

  if (streamSessionId) {
    sendCliEvent(persistentSession.targetWebContents, {
      type: 'error',
      message,
      sessionId: streamSessionId,
      threadId,
    })
  }

  persistentSession.activeRun = null
}

function getReusablePersistentSession(threadId, model, cwd) {
  const persistentSession = persistentCliSessions.get(threadId)

  if (!persistentSession) {
    return null
  }

  if (!cliManager.has(threadId)) {
    persistentCliSessions.delete(threadId)
    return null
  }

  if (
    persistentSession.modelKey !== createModelSessionKey(model) ||
    persistentSession.cwd !== cwd
  ) {
    closePersistentSession(threadId, { force: true })
    return null
  }

  return persistentSession
}

function schedulePersistentIdleTimer(persistentSession) {
  clearPersistentIdleTimer(persistentSession)
  persistentSession.idleTimer = setTimeout(() => {
    logQaEvent({
      level: 'info',
      scope: 'cli:persistent-idle',
      sessionId: persistentSession.threadId,
      message: `Closing idle persistent ${persistentSession.command}.`,
      details: {
        idleTimeoutMs: PERSISTENT_SESSION_IDLE_TIMEOUT_MS,
      },
    })
    closePersistentSession(persistentSession.threadId)
  }, PERSISTENT_SESSION_IDLE_TIMEOUT_MS)
}

function clearPersistentIdleTimer(persistentSession) {
  if (!persistentSession?.idleTimer) {
    return
  }

  clearTimeout(persistentSession.idleTimer)
  persistentSession.idleTimer = null
}

function clearPersistentRunTimer(run) {
  if (!run?.firstVisibleOutputTimer) {
    return
  }

  clearTimeout(run.firstVisibleOutputTimer)
  run.firstVisibleOutputTimer = null
}

function closePersistentSession(threadId, options = {}) {
  const persistentSession = persistentCliSessions.get(threadId)

  if (persistentSession) {
    clearPersistentIdleTimer(persistentSession)
    clearPersistentRunTimer(persistentSession.activeRun)
    persistentCliSessions.delete(threadId)
  }

  return cliManager.kill(threadId, options)
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

function getAdapterStderrLevel(adapter, chunk) {
  if (typeof adapter.classifyStderr !== 'function') {
    return 'warn'
  }

  const level = adapter.classifyStderr(chunk)

  return ['debug', 'info', 'warn', 'error'].includes(level) ? level : 'warn'
}

function shouldSuppressAdapterStderr(adapter, chunk) {
  return (
    typeof adapter.shouldSuppressStderr === 'function' &&
    adapter.shouldSuppressStderr(chunk)
  )
}

function shouldAbortOnAdapterStderr(adapter, chunk) {
  return (
    typeof adapter.shouldAbortOnStderr === 'function' &&
    adapter.shouldAbortOnStderr(chunk)
  )
}

function formatAdapterStderr(adapter, chunk) {
  if (typeof adapter.formatStderr !== 'function') {
    return String(chunk)
  }

  return String(adapter.formatStderr(chunk))
}

function sendTerminalEvents(webContents, sessionId, events) {
  for (const event of events) {
    sendTerminalOutput(webContents, {
      sessionId,
      ...event,
    })
  }
}

function sendTerminalOutput(webContents, event) {
  if (!webContents || webContents.isDestroyed()) {
    return
  }

  webContents.send('cli:terminal-output', event)
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

function formatDuration(durationMs) {
  if (durationMs < 1000) {
    return `${Math.round(durationMs)} ms`
  }

  return `${(durationMs / 1000).toFixed(1)} s`
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
  getAdapterSpawnArgs,
  registerCliIpcHandlers,
}
