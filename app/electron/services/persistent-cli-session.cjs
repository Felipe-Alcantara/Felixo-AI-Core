// Gerencia o ciclo de vida de processos CLI persistentes (spawn, reuso,
// entrega de prompt, timers de idle/timeout e encerramento). O estado das
// sessões vive dentro do factory; integrações com o restante do main process
// (envio de eventos, disponibilidade de modelos, kill de processos) chegam
// por injeção de dependência.
const {
  choosePersistentPrompt,
  normalizePersistentInput,
} = require('./orchestrator/cli-execution-planner.cjs')
const { createJsonlLineReader } = require('./jsonl-line-reader.cjs')
const { createJsonlOutputGuard } = require('./jsonl-output-guard.cjs')
const { logQaEvent } = require('./qa-logger.cjs')
const {
  createErrorTerminalEvent,
  createStartTerminalEvent,
  createStderrTerminalEvent,
  createTerminalEvents,
} = require('./terminal-event-formatter.cjs')
const {
  DEFERRED_PROMPT_FALLBACK_MS,
  FIRST_VISIBLE_OUTPUT_TIMEOUT_MS,
  PERSISTENT_SESSION_IDLE_TIMEOUT_MS,
  createChunkDetails,
  createExitErrorMessage,
  createModelSessionKey,
  createNoVisibleOutputMessage,
  createNonJsonStdoutMessage,
  createTextPreview,
  createToolLoopLimitMessage,
  createToolLoopProgressState,
  formatAdapterStderr,
  getAdapterStderrLevel,
  getPersistentCloseLogLevel,
  handleOrchestrationPromise,
  isVisibleCliActivity,
  parseAdapterLine,
  shouldAbortForToolLoop,
  shouldAbortOnAdapterStderr,
  shouldSuppressAdapterStderr,
  shouldSuppressPersistentTrailingOutput,
} = require('./cli-event-utils.cjs')

function createPersistentCliSessionManager({
  cliManager,
  stoppedSessions,
  sendTerminalEvents,
  sendCliEvent,
  recordModelAvailabilityEvent,
}) {
  const persistentCliSessions = new Map()

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
    orchestrationBridge,
    orchestrationContext,
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
        toolLoopProgress: createToolLoopProgressState(),
        stderrOutput: '',
        orchestrationContext,
        orchestrationBridge,
      }

      persistentSession.activeRun = run
      persistentSession.lastRunFinalEvent = null

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
          providerModel: model?.providerModel,
          reasoningEffort: model?.reasoningEffort,
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
          promptHint: orchestrationContext.promptHint ?? spawnPrompt,
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
      lastRunFinalEvent: null,
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

    if (!cliEvent) {
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
      return
    }

    if (cliEvent.providerSessionId) {
      threadSession.providerSessionId = cliEvent.providerSessionId
    }

    recordModelAvailabilityEvent({
      cliEvent,
      cliType: persistentSession.cliType,
      model: activeRun?.context?.model,
      targetWebContents: persistentSession.targetWebContents,
      threadId,
    })

    if (cliEvent.type === 'session') {
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

    if (cliEvent.readyForPrompt && activeRun && !activeRun.didSendPrompt) {
      clearDeferredPromptFallback(activeRun)
      writeNextPersistentInput(persistentSession, activeRun, {
        providerSessionId: threadSession.providerSessionId,
        persistentPhase: 'prompt',
      })
      return
    }

    // Fallback: if the CLI emits stdout but never sends system/init
    // (e.g. --print mode), schedule a deferred prompt delivery so we
    // don't deadlock waiting for an event that will never arrive.
    if (activeRun && !activeRun.didSendPrompt && !activeRun.deferredPromptFallbackTimer) {
      activeRun.deferredPromptFallbackTimer = setTimeout(() => {
        activeRun.deferredPromptFallbackTimer = null
        if (!activeRun.didSendPrompt && !activeRun.didComplete) {
          logQaEvent({
            level: 'info',
            scope: 'cli:deferred-prompt-fallback',
            sessionId: threadId,
            message: `Sending deferred prompt via fallback (no system/init received within ${DEFERRED_PROMPT_FALLBACK_MS}ms).`,
            details: { streamSessionId },
          })
          writeNextPersistentInput(persistentSession, activeRun, {
            providerSessionId: threadSession.providerSessionId,
            persistentPhase: 'prompt',
          })
        }
      }, DEFERRED_PROMPT_FALLBACK_MS)
    }

    if (cliEvent.type === 'control' || cliEvent.type === 'session') {
      return
    }

    if (!activeRun) {
      if (shouldSuppressPersistentTrailingOutput(
        persistentSession.lastRunFinalEvent,
        cliEvent,
      )) {
        logQaEvent({
          level: 'debug',
          scope: 'cli:persistent-trailing-output',
          sessionId: threadId,
          message: `Persistent ${command} emitted a trailing final event after request completion.`,
          details: {
            cliEventType: cliEvent.type,
          },
        })
        return
      }

      logQaEvent({
        level: 'warn',
        scope: 'cli:persistent-orphan-output',
        sessionId: threadId,
        message: `Persistent ${command} emitted output without an active request.`,
        details: {
          cliEventType: cliEvent.type,
        },
      })
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
      return
    }

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

    if (isVisibleCliActivity(cliEvent)) {
      activeRun.didEmitVisibleOutput = true
      clearPersistentRunTimer(activeRun)
    }

    if (cliEvent.type === 'done') {
      activeRun.didComplete = true
      clearPersistentRunTimer(activeRun)
      clearDeferredPromptFallback(activeRun)
    }

    if (cliEvent.type === 'error') {
      activeRun.didComplete = true
      clearPersistentRunTimer(activeRun)
      clearDeferredPromptFallback(activeRun)
    }

    if (shouldAbortForToolLoop(activeRun.toolLoopProgress, cliEvent)) {
      failPersistentRun(
        persistentSession,
        createToolLoopLimitMessage(command, activeRun.toolLoopProgress.limit),
        {
          logScope: 'cli:loop_guard',
          level: 'warn',
          details: {
            streamSessionId,
            toolUsesWithoutText: activeRun.toolLoopProgress.toolUsesWithoutText,
            maxToolUsesWithoutText: activeRun.toolLoopProgress.limit,
          },
        },
      )
      closePersistentSession(threadId)
      return
    }

    const orchestrationResult = activeRun.orchestrationBridge?.handleCliEvent({
      cliEvent,
      streamSessionId: activeRun.streamSessionId,
      threadId,
      context: activeRun.orchestrationContext,
    })
    handleOrchestrationPromise(orchestrationResult?.promise)

    if (orchestrationResult?.handled) {
      if (
        cliEvent.type === 'awaiting_agents' ||
        cliEvent.type === 'final_answer' ||
        cliEvent.type === 'done'
      ) {
        activeRun.didComplete = true
        clearPersistentRunTimer(activeRun)
        clearDeferredPromptFallback(activeRun)
        rememberPersistentFinalEvent(persistentSession, activeRun, cliEvent)
        persistentSession.activeRun = null
        schedulePersistentIdleTimer(persistentSession)
      }

      return
    }

    sendCliEvent(persistentSession.targetWebContents, {
      ...cliEvent,
      sessionId: activeRun.streamSessionId,
      threadId,
    })

    if (cliEvent.type === 'done') {
      rememberPersistentFinalEvent(persistentSession, activeRun, cliEvent)
      persistentSession.activeRun = null
      schedulePersistentIdleTimer(persistentSession)
      return
    }

    if (cliEvent.type === 'error') {
      rememberPersistentFinalEvent(persistentSession, activeRun, cliEvent)
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
    const didComplete = activeRun?.didComplete ?? true

    clearPersistentIdleTimer(persistentSession)
    if (persistentCliSessions.get(threadId) === persistentSession) {
      persistentCliSessions.delete(threadId)
    }
    logQaEvent({
      level: getPersistentCloseLogLevel({ code, didComplete }),
      scope: 'cli:close',
      sessionId: threadId,
      message: `Persistent ${command} closed.`,
      details: {
        pid: persistentSession.childProcess.pid,
        code,
        signal,
        didComplete,
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
    dispatchPersistentCliEvent(persistentSession, {
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
      clearDeferredPromptFallback(activeRun)
      rememberPersistentFinalEvent(persistentSession, activeRun, {
        type: 'error',
        message,
      })
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
      dispatchPersistentCliEvent(persistentSession, {
        type: 'error',
        message,
        sessionId: streamSessionId,
        threadId,
      })
    }

    persistentSession.activeRun = null
  }

  function rememberPersistentFinalEvent(persistentSession, activeRun, cliEvent) {
    if (!persistentSession || !activeRun || !cliEvent) {
      return
    }

    persistentSession.lastRunFinalEvent = {
      type: cliEvent.type,
      message: typeof cliEvent.message === 'string' ? cliEvent.message : '',
      streamSessionId: activeRun.streamSessionId,
      endedAt: Date.now(),
    }
  }

  function dispatchPersistentCliEvent(persistentSession, cliEvent) {
    const { threadId } = persistentSession
    const activeRun = persistentSession.activeRun

    recordModelAvailabilityEvent({
      cliEvent,
      cliType: persistentSession.cliType,
      model: activeRun?.context?.model,
      targetWebContents: persistentSession.targetWebContents,
      threadId,
    })

    if (!activeRun) {
      sendCliEvent(persistentSession.targetWebContents, cliEvent)
      return
    }

    const orchestrationResult = activeRun.orchestrationBridge?.handleCliEvent({
      cliEvent,
      streamSessionId: activeRun.streamSessionId,
      threadId,
      context: activeRun.orchestrationContext,
    })
    handleOrchestrationPromise(orchestrationResult?.promise)

    if (!orchestrationResult?.handled) {
      sendCliEvent(persistentSession.targetWebContents, cliEvent)
    }
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

  function clearDeferredPromptFallback(run) {
    if (!run?.deferredPromptFallbackTimer) {
      return
    }

    clearTimeout(run.deferredPromptFallbackTimer)
    run.deferredPromptFallbackTimer = null
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

  function hasPersistentSession(threadId) {
    return persistentCliSessions.has(threadId)
  }

  return {
    closePersistentSession,
    hasPersistentSession,
    sendPersistentCliRequest,
  }
}

module.exports = {
  createPersistentCliSessionManager,
}
