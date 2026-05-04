const { app, ipcMain } = require('electron')
const { CliProcessManager } = require('./cli-process-manager.cjs')
const {
  choosePersistentPrompt,
  createCliExecutionPlan,
  getAdapterSpawnArgs,
  normalizePersistentInput,
} = require('./orchestrator/cli-execution-planner.cjs')
const {
  createModelAvailabilityRegistry,
} = require('./orchestrator/model-availability.cjs')
const {
  getTerminalAdapter,
} = require('./providers/terminal-adapter-registry.cjs')
const { createJsonlLineReader } = require('./jsonl-line-reader.cjs')
const { createJsonlOutputGuard } = require('./jsonl-output-guard.cjs')
const { logQaEvent } = require('./qa-logger.cjs')
const {
  createOrchestrationIpcBridge,
} = require('./orchestration/orchestration-ipc-bridge.cjs')
const {
  createOrchestrationRunner,
} = require('./orchestration/orchestration-runner.cjs')
const {
  createErrorTerminalEvent,
  createOrchestrationTerminalEvent,
  createStartTerminalEvent,
  createStderrTerminalEvent,
  createTerminalEvents,
} = require('./terminal-event-formatter.cjs')
const {
  getOfficialCliAccountStatus,
  installOfficialCli,
  listOfficialCliCatalog,
  openOfficialCliLogin,
  switchOfficialCliAccount,
} = require('./official-cli-service.cjs')

const cliManager = new CliProcessManager()
const stoppedSessions = new Set()
const cliThreadSessions = new Map()
const persistentCliSessions = new Map()
const terminalSessionParents = new Map()
const modelAvailabilityRegistry = createModelAvailabilityRegistry()
const FIRST_VISIBLE_OUTPUT_TIMEOUT_MS = 120000
const MAX_TOOL_USES_WITHOUT_TEXT = 20
const PERSISTENT_SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000
const PERSISTENT_TRAILING_OUTPUT_GRACE_MS = 5000

function registerCliIpcHandlers(getMainWindow) {
  ipcMain.handle('cli:send', (event, params) => {
    const targetWebContents = getTargetWebContents(getMainWindow, event.sender)

    return sendCliRequest(params, targetWebContents)
  })

  ipcMain.handle('cli:list-official', async () => {
    try {
      const clis = await listOfficialCliCatalog()
      return { ok: true, clis }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Falha ao listar CLIs oficiais.'

      logQaEvent({
        level: 'error',
        scope: 'cli:list-official',
        message,
      })

      return { ok: false, message, clis: [] }
    }
  })

  ipcMain.handle('cli:install-official', async (_event, params) => {
    const id = getRequiredString(params?.id)

    if (!id) {
      return { ok: false, message: 'CLI oficial invalida.' }
    }

    logQaEvent({
      level: 'info',
      scope: 'cli:install-official',
      message: `Installing official CLI ${id}.`,
    })

    return installOfficialCli(id)
  })

  ipcMain.handle('cli:open-official-login', (_event, params) => {
    const id = getRequiredString(params?.id)

    if (!id) {
      return { ok: false, message: 'CLI oficial invalida.' }
    }

    const result = openOfficialCliLogin(id)
    logQaEvent({
      level: result.ok ? 'info' : 'warn',
      scope: 'cli:open-official-login',
      message: result.message ?? `Login command requested for ${id}.`,
      details: {
        id,
        command: result.command,
        args: result.args,
        manualCommand: result.manualCommand,
      },
    })

    return result
  })

  ipcMain.handle('cli:official-account-status', async (_event, params) => {
    const id = getRequiredString(params?.id)

    if (!id) {
      return { ok: false, message: 'CLI oficial invalida.' }
    }

    const result = await getOfficialCliAccountStatus(id)
    logQaEvent({
      level: result.ok ? 'info' : 'warn',
      scope: 'cli:official-account-status',
      message: result.message ?? `Account status requested for ${id}.`,
      details: {
        id,
        authStatus: result.authStatus,
      },
    })

    return result
  })

  ipcMain.handle('cli:switch-official-account', async (_event, params) => {
    const id = getRequiredString(params?.id)

    if (!id) {
      return { ok: false, message: 'CLI oficial invalida.' }
    }

    const result = await switchOfficialCliAccount(id)
    logQaEvent({
      level: result.ok ? 'info' : 'warn',
      scope: 'cli:switch-official-account',
      message: result.message ?? `Account switch requested for ${id}.`,
      details: {
        id,
        command: result.command,
        args: result.args,
      },
    })

    return result
  })

  const orchestrationRunner = createOrchestrationRunner({
    validateSpawnAgent: ({ event, context }) =>
      validateOrchestrationSpawnModel(event, context),
    spawnAgent: ({ run, event, threadId, context }) =>
      spawnOrchestrationAgent({
        run,
        event,
        threadId,
        context,
        sendCliRequest,
      }),
    invokeOrchestrator: ({ run, prompt, context }) => {
      const threadId = `${run.runId}:orchestrator-turn-${run.currentTurn}`

      return sendCliRequest(
        {
          sessionId: threadId,
          threadId,
          prompt,
          promptHint: run.originalPrompt,
          model: run.orchestratorModel,
          cwd: context.cwd,
          availableModels: context.availableModels,
          orchestratorSettings: context.orchestratorSettings,
        },
        context.targetWebContents,
        {
          role: 'orchestrator',
          runId: run.runId,
          parentThreadId: run.parentThreadId,
          originalPrompt: run.originalPrompt,
          promptHint: run.originalPrompt,
          orchestratorCliType: run.orchestratorCliType,
          orchestratorModel: run.orchestratorModel,
          availableModels: context.availableModels,
          orchestratorSettings: context.orchestratorSettings,
          limits: context.limits,
        },
      )
    },
    sendChatEvent: (event) => {
      const context = orchestrationRunner.getRunContext(event.runId)
      sendCliEvent(context.targetWebContents, event)
    },
    emitTerminalEvent: (event) => {
      const context = orchestrationRunner.getRunContext(event.runId)
      sendTerminalEvents(context.targetWebContents, event.parentThreadId, [
        createOrchestrationTerminalEvent(event),
      ])
    },
  })
  const orchestrationBridge = createOrchestrationIpcBridge({
    runner: orchestrationRunner,
  })

  function sendCliRequest(params, targetWebContents, orchestrationContext = {}) {
    const streamSessionId = getRequiredString(params?.sessionId)
    const threadId = getRequiredString(params?.threadId) || streamSessionId
    const prompt = getRequiredString(params?.prompt)
    const resumePrompt = getRequiredString(params?.resumePrompt)
    const promptHint = getRequiredString(params?.promptHint)
    const model = params?.model
    const projectCwd = typeof params?.cwd === 'string' && params.cwd ? params.cwd : null
    const cliType = model?.cliType
    const adapter = getTerminalAdapter(cliType)
    const availableModels = normalizeAvailableModels(
      params?.availableModels ?? orchestrationContext.availableModels,
    )
    const orchestratorSettings = normalizeOrchestrationSettings(
      params?.orchestratorSettings ?? orchestrationContext.orchestratorSettings,
    )

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
    const requestOrchestrationContext = {
      ...orchestrationContext,
      targetWebContents,
      streamSessionId,
      threadId,
      parentThreadId: orchestrationContext.parentThreadId ?? threadId,
      orchestratorCliType:
        orchestrationContext.orchestratorCliType ?? cliType,
      orchestratorModel: orchestrationContext.orchestratorModel ?? model,
      originalPrompt: orchestrationContext.originalPrompt ?? prompt,
      promptHint: orchestrationContext.promptHint ?? promptHint,
      availableModels,
      orchestratorSettings,
      modelAvailabilityRegistry,
      limits:
        orchestrationContext.limits ??
        createOrchestrationLimits(orchestratorSettings),
      model,
      cwd,
    }

    if (requestOrchestrationContext.parentThreadId !== threadId) {
      terminalSessionParents.set(threadId, requestOrchestrationContext.parentThreadId)
    }

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
        orchestrationBridge,
        orchestrationContext: requestOrchestrationContext,
      })
    }

    spawnContext.usesNativeResume = executionPlan.usesNativeResume
    const usesNativeResume = executionPlan.usesNativeResume
    const spawnPrompt = executionPlan.spawnPrompt
    const { command, args, stdinInput } =
      getAdapterSpawnArgs(adapter, spawnPrompt, spawnContext)
    let didComplete = false
    let didEmitVisibleOutput = false
    let stderrOutput = ''
    let firstVisibleOutputTimer = null
    const toolLoopProgress = createToolLoopProgressState()
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
          providerModel: model?.providerModel,
          reasoningEffort: model?.reasoningEffort,
          command,
          args,
          stdin: Boolean(stdinInput),
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
          promptHint: requestOrchestrationContext.promptHint ?? spawnPrompt,
        }),
      ])
      const childProcess = cliManager.spawn(threadId, command, args, cwd, {
        openStdin: Boolean(stdinInput),
      })
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
        dispatchCliEvent({
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

        recordModelAvailabilityEvent({
          cliEvent,
          cliType,
          model,
          targetWebContents,
          threadId,
        })

        if (cliEvent.type === 'session') {
          return
        }

        if (cliEvent.type === 'done') {
          didComplete = true
          clearFirstVisibleOutputTimer()
        }

        if (shouldAbortForToolLoop(toolLoopProgress, cliEvent)) {
          abortForToolLoopGuard()
          return
        }

        if (isVisibleCliActivity(cliEvent)) {
          didEmitVisibleOutput = true
          clearFirstVisibleOutputTimer()
        }

        const orchestrationResult = orchestrationBridge.handleCliEvent({
          cliEvent,
          streamSessionId,
          threadId,
          context: requestOrchestrationContext,
        })
        handleOrchestrationPromise(orchestrationResult.promise)

        if (orchestrationResult.handled) {
          if (cliEvent.type === 'awaiting_agents' || cliEvent.type === 'final_answer') {
            didComplete = true
          }

          didEmitVisibleOutput = true
          clearFirstVisibleOutputTimer()
          return
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
          dispatchCliEvent({
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
        dispatchCliEvent({
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
          dispatchCliEvent({
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
        const doneEvent = {
          type: 'done',
          sessionId: streamSessionId,
          threadId,
        }
        const orchestrationResult = orchestrationBridge.handleCliEvent({
          cliEvent: doneEvent,
          streamSessionId,
          threadId,
          context: requestOrchestrationContext,
        })
        handleOrchestrationPromise(orchestrationResult.promise)

        if (!orchestrationResult.handled) {
          sendCliEvent(targetWebContents, doneEvent)
        }
      })

      if (stdinInput && !writeOneShotStdin(childProcess, stdinInput)) {
        didComplete = true
        clearFirstVisibleOutputTimer()
        sendTerminalEvents(targetWebContents, threadId, [
          createErrorTerminalEvent(`${command} não aceitou entrada via stdin.`),
        ])
        dispatchCliEvent({
          type: 'error',
          message: `${command} não aceitou entrada via stdin.`,
          sessionId: streamSessionId,
          threadId,
        })
        cliManager.kill(threadId)
        return { ok: false, message: 'Falha ao enviar prompt para a CLI.' }
      }

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

    function dispatchCliEvent(cliEvent) {
      recordModelAvailabilityEvent({
        cliEvent,
        cliType,
        model,
        targetWebContents,
        threadId,
      })

      const orchestrationResult = orchestrationBridge.handleCliEvent({
        cliEvent,
        streamSessionId,
        threadId,
        context: requestOrchestrationContext,
      })
      handleOrchestrationPromise(orchestrationResult.promise)

      if (!orchestrationResult.handled) {
        sendCliEvent(targetWebContents, cliEvent)
      }
    }

    function abortForToolLoopGuard() {
      if (didComplete) {
        return
      }

      didComplete = true
      clearFirstVisibleOutputTimer()
      const message = createToolLoopLimitMessage(command, toolLoopProgress.limit)

      logQaEvent({
        level: 'warn',
        scope: 'cli:loop_guard',
        sessionId: threadId,
        message: `${command} exceeded the tool loop guard.`,
        details: {
          streamSessionId,
          toolUsesWithoutText: toolLoopProgress.toolUsesWithoutText,
          maxToolUsesWithoutText: toolLoopProgress.limit,
        },
      })
      sendTerminalEvents(targetWebContents, threadId, [
        createErrorTerminalEvent(message),
      ])
      dispatchCliEvent({
        type: 'error',
        message,
        sessionId: streamSessionId,
        threadId,
      })
      cliManager.kill(threadId)
    }
  }

  ipcMain.handle('cli:orchestration-status', (_event, params) =>
    createOrchestrationStatusResponse(orchestrationRunner, params),
  )

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

  ipcMain.handle('cli:reset-thread', (event, params) => {
    const threadId = getRequiredString(params?.threadId)

    if (!threadId) {
      logQaEvent({
        level: 'warn',
        scope: 'cli:reset-thread',
        message: 'Rejected reset request with invalid thread.',
      })
      return { ok: false, message: 'Thread invalida.' }
    }

    const threadIds = collectThreadFamily(threadId, terminalSessionParents)
    const orchestrationReset = orchestrationRunner.resetThread(threadId)
    let hadThreadSession = false
    let hadPersistentSession = false
    let killed = false
    const killedThreadIds = []

    for (const resetThreadId of threadIds) {
      hadThreadSession = cliThreadSessions.delete(resetThreadId) || hadThreadSession
      hadPersistentSession =
        persistentCliSessions.has(resetThreadId) || hadPersistentSession
      stoppedSessions.add(resetThreadId)
      const didKill = closePersistentSession(resetThreadId, { force: true })

      if (didKill) {
        killed = true
        killedThreadIds.push(resetThreadId)
      } else {
        stoppedSessions.delete(resetThreadId)
      }
    }

    for (const resetThreadId of threadIds) {
      terminalSessionParents.delete(resetThreadId)
    }

    for (const [childThreadId, parentThreadId] of terminalSessionParents) {
      if (threadIds.includes(parentThreadId)) {
        terminalSessionParents.delete(childThreadId)
      }
    }

    const targetWebContents = getTargetWebContents(getMainWindow, event.sender)
    logQaEvent({
      level: 'info',
      scope: 'cli:reset-thread',
      sessionId: threadId,
      message: 'Thread reset requested.',
      details: {
        hadThreadSession,
        hadPersistentSession,
        killed,
        threadIds,
        killedThreadIds,
        orchestrationRunIds: orchestrationReset.runIds,
        failedOrchestrationRunIds: orchestrationReset.failedRunIds,
      },
    })

    if (hadThreadSession || hadPersistentSession || killed) {
      sendTerminalEvents(targetWebContents, threadId, [
        {
          source: 'system',
          kind: 'lifecycle',
          severity: 'info',
          title: 'Thread reiniciada',
          chunk:
            threadIds.length > 1
              ? 'A thread anterior e suas sessoes filhas foram encerradas e nao serao reutilizadas.'
              : 'A thread anterior foi encerrada e nao sera reutilizada.',
        },
      ])
    }

    return { ok: true, killed, threadIds }
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
    writeNextPersistentInput(persistentSession, activeRun, {
      providerSessionId: threadSession.providerSessionId,
      persistentPhase: 'prompt',
    })
    return
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
  }

  if (cliEvent.type === 'error') {
    activeRun.didComplete = true
    clearPersistentRunTimer(activeRun)
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

function shouldSuppressPersistentTrailingOutput(
  lastRunFinalEvent,
  cliEvent,
  now = Date.now(),
) {
  if (!lastRunFinalEvent || !cliEvent || typeof cliEvent !== 'object') {
    return false
  }

  const ageMs = now - lastRunFinalEvent.endedAt

  if (ageMs < 0 || ageMs > PERSISTENT_TRAILING_OUTPUT_GRACE_MS) {
    return false
  }

  if (
    cliEvent.type === 'done' &&
    ['awaiting_agents', 'done', 'final_answer'].includes(lastRunFinalEvent.type)
  ) {
    return true
  }

  if (cliEvent.type !== 'error' || lastRunFinalEvent.type !== 'error') {
    return false
  }

  const previousMessage = normalizeCliEventMessage(lastRunFinalEvent.message)
  const nextMessage = normalizeCliEventMessage(cliEvent.message)

  return !previousMessage || !nextMessage || previousMessage === nextMessage
}

function normalizeCliEventMessage(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ')
}

function getPersistentCloseLogLevel({ code, didComplete }) {
  if (didComplete) {
    return 'info'
  }

  return code && code !== 0 ? 'error' : 'info'
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

function createToolLoopProgressState(limit = MAX_TOOL_USES_WITHOUT_TEXT) {
  return {
    limit,
    toolUsesWithoutText: 0,
  }
}

function shouldAbortForToolLoop(progress, cliEvent) {
  if (!progress || !cliEvent || typeof cliEvent !== 'object') {
    return false
  }

  if (isTextCliEvent(cliEvent)) {
    progress.toolUsesWithoutText = 0
    return false
  }

  if (cliEvent.type !== 'tool_use') {
    return false
  }

  progress.toolUsesWithoutText += 1
  return progress.toolUsesWithoutText >= progress.limit
}

function isVisibleCliActivity(cliEvent) {
  if (!cliEvent || typeof cliEvent !== 'object') {
    return false
  }

  if (isTextCliEvent(cliEvent)) {
    return true
  }

  return cliEvent.type === 'tool_use' || cliEvent.type === 'tool_result'
}

function isTextCliEvent(cliEvent) {
  return cliEvent.type === 'text' && Boolean(String(cliEvent.text ?? '').trim())
}

function handleOrchestrationPromise(promise) {
  if (!promise || typeof promise.catch !== 'function') {
    return
  }

  promise.catch((error) => {
    logQaEvent({
      level: 'error',
      scope: 'cli:orchestration',
      message: 'Unhandled orchestration error.',
      details: {
        message: error instanceof Error ? error.message : String(error),
      },
    })
  })
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

function writeOneShotStdin(childProcess, input) {
  const stdin = childProcess?.stdin

  if (!stdin || stdin.destroyed || stdin.writableEnded) {
    return false
  }

  try {
    stdin.end(input)
    return true
  } catch {
    return false
  }
}

function formatAdapterStderr(adapter, chunk) {
  if (typeof adapter.formatStderr !== 'function') {
    return String(chunk)
  }

  return String(adapter.formatStderr(chunk))
}

function recordModelAvailabilityEvent({
  cliEvent,
  cliType,
  model,
  targetWebContents,
  threadId,
}) {
  const issue = modelAvailabilityRegistry.recordCliEvent({
    cliEvent,
    cliType,
    model,
  })

  if (!issue) {
    return null
  }

  logQaEvent({
    level: issue.status === 'limit_reached' ? 'warn' : 'error',
    scope: 'model:availability',
    sessionId: threadId,
    message: `Model availability changed: ${issue.status}.`,
    details: {
      cliType: issue.cliType,
      modelId: issue.modelId,
      modelName: issue.modelName,
      resetLabel: issue.resetLabel,
      expiresAt: issue.expiresAt,
      reason: issue.reason,
    },
  })
  sendTerminalEvents(targetWebContents, threadId, [
    {
      source: 'system',
      kind: 'lifecycle',
      severity: issue.status === 'limit_reached' ? 'warn' : 'error',
      title:
        issue.status === 'limit_reached'
          ? 'Limite detectado'
          : 'Modelo indisponivel',
      chunk: formatAvailabilityIssue(issue),
      metadata: compactAvailabilityIssue(issue),
    },
  ])

  return issue
}

function formatAvailabilityIssue(issue) {
  const target = issue.modelName
    ? `${issue.modelName} (${issue.cliType})`
    : issue.cliType
  const details = [`${target} marcado como ${issue.status}.`, issue.reason]

  if (issue.resetLabel) {
    details.push(`Reset informado: ${issue.resetLabel}.`)
  }

  return details.filter(Boolean).join('\n')
}

function compactAvailabilityIssue(issue) {
  return {
    status: issue.status,
    cliType: issue.cliType,
    modelId: issue.modelId,
    modelName: issue.modelName,
    resetLabel: issue.resetLabel,
    expiresAt: issue.expiresAt,
  }
}

function sendTerminalEvents(webContents, sessionId, events) {
  const parentThreadId = terminalSessionParents.get(sessionId)

  for (const event of events) {
    sendTerminalOutput(webContents, {
      sessionId,
      parentThreadId,
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

function createOrchestrationModel(cliType) {
  return {
    id: `orchestration-${cliType}`,
    name: `Sub-agente ${cliType}`,
    command: cliType,
    source: 'orchestration',
    cliType,
  }
}

function spawnOrchestrationAgent({
  run,
  event,
  threadId,
  context,
  sendCliRequest,
}) {
  const resolvedModel = event.selectedModel
    ? {
        ok: true,
        model: event.selectedModel,
      }
    : resolveOrchestrationSpawnModel(event.cliType, context, event)

  if (resolvedModel.ok === false) {
    return resolvedModel
  }

  return sendCliRequest(
    {
      sessionId: threadId,
      threadId,
      prompt: event.prompt,
      promptHint: event.prompt,
      model: resolvedModel.model,
      cwd: context.cwd,
    },
    context.targetWebContents,
    {
      role: 'agent',
      runId: run.runId,
      agentId: event.agentId,
      parentThreadId: run.parentThreadId,
      originalPrompt: run.originalPrompt,
      promptHint: event.prompt,
      orchestratorCliType: run.orchestratorCliType,
      orchestratorModel: run.orchestratorModel,
      availableModels: context.availableModels,
      orchestratorSettings: context.orchestratorSettings,
      limits: context.limits,
    },
  )
}

function validateOrchestrationSpawnModel(eventOrCliType, context = {}) {
  const event =
    eventOrCliType && typeof eventOrCliType === 'object'
      ? eventOrCliType
      : { cliType: eventOrCliType }
  const result = resolveOrchestrationSpawnModel(event.cliType, context, event)

  return result.ok === false
    ? {
        ok: false,
        code: 'SPAWN_MODEL_UNAVAILABLE',
        message: result.message,
      }
    : { ok: true, modelChoice: result.modelChoice, selectedModel: result.model }
}

function resolveOrchestrationSpawnModel(cliType, context = {}, event = {}) {
  const availableModels = Array.isArray(context.availableModels)
    ? context.availableModels
    : null

  if (!availableModels) {
    const model = createOrchestrationModel(cliType)

    return {
      ok: true,
      model,
      modelChoice: createOrchestrationModelChoice({
        requestedCliType: cliType,
        model,
        reason:
          'Lista de modelos indisponivel no contexto; usando modelo leve padrao do cliType solicitado.',
        selectionRule: 'fallback-without-model-context',
      }),
    }
  }

  const settings = context.orchestratorSettings ?? {}
  const blockedModelIds = new Set(
    Array.isArray(settings.blockedModelIds) ? settings.blockedModelIds : [],
  )
  const preferredModelIds = Array.isArray(settings.preferredModelIds)
    ? settings.preferredModelIds
    : []
  const cliTypeModels = availableModels.filter((model) => model.cliType === cliType)
  const configuredCandidates = cliTypeModels.filter(
    (model) => !blockedModelIds.has(model.id),
  )
  const candidates = configuredCandidates.filter((model) =>
    isModelOperational(model, context.modelAvailabilityRegistry),
  )

  if (candidates.length > 0) {
    const selectedModel = selectBestSpawnModel(candidates, {
      preferredModelIds,
      requestedCliType: cliType,
      prompt: event.prompt,
    })
    const model = {
      ...createOrchestrationModel(cliType),
      ...selectedModel,
      cliType: selectedModel.cliType,
    }
    const selectionRule = preferredModelIds.includes(selectedModel.id)
      ? 'preferred-model'
      : 'best-available-model'
    const reason = preferredModelIds.includes(selectedModel.id)
      ? 'Modelo preferido pelo usuario para este cliType.'
      : 'Melhor modelo operacional para este cliType apos aplicar bloqueios e limites detectados.'

    return {
      ok: true,
      model,
      modelChoice: createOrchestrationModelChoice({
        requestedCliType: cliType,
        model,
        reason,
        selectionRule,
        candidateCount: candidates.length,
        blockedCount: cliTypeModels.length - configuredCandidates.length,
        unavailableCount: configuredCandidates.length - candidates.length,
      }),
    }
  }

  const fallbackCandidates = availableModels.filter(
    (model) =>
      !blockedModelIds.has(model.id) &&
      model.cliType !== cliType &&
      isModelOperational(model, context.modelAvailabilityRegistry),
  )

  if (fallbackCandidates.length > 0) {
    const selectedModel = selectBestSpawnModel(fallbackCandidates, {
      preferredModelIds,
      requestedCliType: cliType,
      prompt: event.prompt,
    })
    const model = {
      ...createOrchestrationModel(selectedModel.cliType),
      ...selectedModel,
      cliType: selectedModel.cliType,
    }
    const unavailableReason = createUnavailableReason(
      cliType,
      cliTypeModels,
      configuredCandidates,
      context.modelAvailabilityRegistry,
    )

    return {
      ok: true,
      model,
      modelChoice: createOrchestrationModelChoice({
        requestedCliType: cliType,
        model,
        reason: `${unavailableReason} Usando fallback operacional (${model.cliType}).`,
        selectionRule: 'provider-fallback',
        candidateCount: fallbackCandidates.length,
        blockedCount: cliTypeModels.length - configuredCandidates.length,
        unavailableCount: configuredCandidates.length - candidates.length,
        fallbackFromCliType: cliType,
        availabilityReason: unavailableReason,
      }),
    }
  }

  if (configuredCandidates.length === 0) {
    const reason =
      cliTypeModels.length === 0
        ? `Nenhum modelo cadastrado para cliType "${cliType}".`
        : `Todos os modelos cadastrados para cliType "${cliType}" estao bloqueados.`

    return {
      ok: false,
      message: `Nenhum modelo disponivel para spawn com cliType "${cliType}".`,
      modelChoice: createOrchestrationModelChoice({
        requestedCliType: cliType,
        model: null,
        reason,
        selectionRule: 'unavailable',
        candidateCount: 0,
        blockedCount: cliTypeModels.length,
        unavailableCount: 0,
      }),
    }
  }

  const reason = createUnavailableReason(
    cliType,
    cliTypeModels,
    configuredCandidates,
    context.modelAvailabilityRegistry,
  )

  return {
    ok: false,
    message: `Nenhum modelo operacional para spawn com cliType "${cliType}".`,
    modelChoice: createOrchestrationModelChoice({
      requestedCliType: cliType,
      model: null,
      reason,
      selectionRule: 'unavailable',
      candidateCount: 0,
      blockedCount: cliTypeModels.length - configuredCandidates.length,
      unavailableCount: configuredCandidates.length,
    }),
  }
}

function isModelOperational(model, registry) {
  if (!registry || typeof registry.getModelAvailability !== 'function') {
    return true
  }

  return registry.getModelAvailability(model).status === 'available'
}

function selectBestSpawnModel(candidates, options = {}) {
  return [...candidates].sort((left, right) => {
    const leftScore = scoreSpawnModel(left, options)
    const rightScore = scoreSpawnModel(right, options)

    if (leftScore !== rightScore) {
      return rightScore - leftScore
    }

    return String(left.name).localeCompare(String(right.name))
  })[0]
}

function scoreSpawnModel(model, { preferredModelIds = [], requestedCliType, prompt } = {}) {
  const preferredIndex = preferredModelIds.indexOf(model.id)
  const promptKind = classifySpawnPrompt(prompt)
  let score = 0

  if (preferredIndex >= 0) {
    score += 1000 - preferredIndex
  }

  if (model.cliType === requestedCliType) {
    score += 500
  }

  if (promptKind === 'code') {
    if (model.cliType === 'codex' || model.cliType === 'codex-app-server') {
      score += 90
    } else if (model.cliType === 'claude') {
      score += 75
    } else {
      score += 25
    }
  } else if (promptKind === 'long-context') {
    if (model.cliType === 'gemini' || model.cliType === 'gemini-acp') {
      score += 90
    } else if (model.cliType === 'claude') {
      score += 45
    } else {
      score += 35
    }
  } else {
    if (model.cliType === 'gemini' || model.cliType === 'gemini-acp') {
      score += 55
    } else if (model.cliType === 'codex' || model.cliType === 'codex-app-server') {
      score += 50
    } else {
      score += 45
    }
  }

  if (String(model.providerModel ?? '').toLowerCase().includes('lite')) {
    score += 10
  }

  if (String(model.providerModel ?? '').toLowerCase().includes('mini')) {
    score += 8
  }

  return score
}

function classifySpawnPrompt(prompt) {
  const normalizedPrompt = String(prompt ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

  if (
    /\b(codigo|code|arquivo|file|editar|implementar|corrigir|bug|teste|test|refactor|commit|diff|pr)\b/.test(
      normalizedPrompt,
    )
  ) {
    return 'code'
  }

  if (
    /\b(resum|sumari|contexto longo|long context|pesquis|analise extensa|documento grande)\b/.test(
      normalizedPrompt,
    )
  ) {
    return 'long-context'
  }

  return 'general'
}

function createUnavailableReason(
  cliType,
  cliTypeModels,
  configuredCandidates,
  registry,
) {
  if (cliTypeModels.length === 0) {
    return `Nenhum modelo cadastrado para cliType "${cliType}".`
  }

  if (configuredCandidates.length === 0) {
    return `Todos os modelos cadastrados para cliType "${cliType}" estao bloqueados.`
  }

  const availabilityReasons = configuredCandidates
    .map((model) => {
      const availability =
        registry && typeof registry.getModelAvailability === 'function'
          ? registry.getModelAvailability(model)
          : { status: 'available' }

      if (availability.status === 'available') {
        return null
      }

      const reset = availability.resetLabel ? ` reset ${availability.resetLabel}` : ''
      return `${model.name}: ${availability.status}${reset}`
    })
    .filter(Boolean)

  if (availabilityReasons.length === 0) {
    return `Nenhum modelo operacional para cliType "${cliType}".`
  }

  return `Modelos do cliType "${cliType}" indisponiveis: ${availabilityReasons.join('; ')}.`
}

function createOrchestrationModelChoice({
  requestedCliType,
  model,
  reason,
  selectionRule,
  candidateCount,
  blockedCount,
  unavailableCount,
  fallbackFromCliType,
  availabilityReason,
}) {
  return {
    requestedCliType,
    selectedModelId: model?.id,
    selectedModelName: model?.name,
    selectedCliType: model?.cliType ?? requestedCliType,
    providerModel: model?.providerModel,
    reasoningEffort: model?.reasoningEffort,
    reason,
    selectionRule,
    candidateCount,
    blockedCount,
    unavailableCount,
    fallbackFromCliType,
    availabilityReason,
  }
}

function normalizeAvailableModels(value) {
  if (!Array.isArray(value)) {
    return null
  }

  return value
    .map(normalizeAvailableModel)
    .filter((model) => model && model.cliType !== 'unknown')
}

function normalizeAvailableModel(value) {
  if (!value || typeof value !== 'object') {
    return null
  }

  const model = value

  if (
    typeof model.id !== 'string' ||
    typeof model.name !== 'string' ||
    typeof model.command !== 'string' ||
    typeof model.source !== 'string' ||
    !isValidOrchestrationCliType(model.cliType)
  ) {
    return null
  }

  return {
    id: model.id,
    name: model.name,
    command: model.command,
    source: model.source,
    cliType: model.cliType,
    providerModel:
      typeof model.providerModel === 'string' && model.providerModel.trim()
        ? model.providerModel.trim()
        : undefined,
    reasoningEffort:
      typeof model.reasoningEffort === 'string' && model.reasoningEffort.trim()
        ? model.reasoningEffort.trim()
        : undefined,
  }
}

function normalizeOrchestrationSettings(value) {
  if (!value || typeof value !== 'object') {
    return null
  }

  return {
    preferredModelIds: normalizeStringList(value.preferredModelIds),
    blockedModelIds: normalizeStringList(value.blockedModelIds),
    maxAgentsPerTurn: normalizePositiveInteger(value.maxAgentsPerTurn),
    maxTurns: normalizePositiveInteger(value.maxTurns),
    maxTotalAgents: normalizePositiveInteger(value.maxTotalAgents),
    maxRuntimeMinutes: normalizePositiveInteger(value.maxRuntimeMinutes),
  }
}

function createOrchestrationLimits(settings) {
  if (!settings) {
    return undefined
  }

  return {
    maxAgentsPerTurn: settings.maxAgentsPerTurn,
    maxTurns: settings.maxTurns,
    maxTotalAgents: settings.maxTotalAgents,
    maxRuntimeMinutes: settings.maxRuntimeMinutes,
  }
}

function normalizeStringList(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === 'string' && item.trim())
    : []
}

function normalizePositiveInteger(value) {
  return Number.isInteger(value) && value > 0 ? value : undefined
}

function isValidOrchestrationCliType(value) {
  return (
    value === 'claude' ||
    value === 'codex' ||
    value === 'codex-app-server' ||
    value === 'gemini' ||
    value === 'gemini-acp'
  )
}

function createOrchestrationStatusResponse(orchestrationRunner, params = {}) {
  const runId = getRequiredString(params?.runId)
  const threadId = getRequiredString(params?.threadId)

  if (runId) {
    const run = orchestrationRunner.getRun(runId)
    return run
      ? { ok: true, run }
      : { ok: false, message: 'Run de orquestracao nao encontrado.' }
  }

  if (threadId) {
    const run = orchestrationRunner.getRunByThreadId(threadId)
    return run
      ? { ok: true, run }
      : { ok: false, message: 'Run de orquestracao nao encontrado.' }
  }

  return {
    ok: true,
    runs: orchestrationRunner.listRuns(),
  }
}

function collectThreadFamily(rootThreadId, parentMap) {
  const root = getRequiredString(rootThreadId)

  if (!root) {
    return []
  }

  const threadIds = new Set([root])
  let didAddThread = true

  while (didAddThread) {
    didAddThread = false

    for (const [childThreadId, parentThreadId] of parentMap) {
      if (threadIds.has(parentThreadId) && !threadIds.has(childThreadId)) {
        threadIds.add(childThreadId)
        didAddThread = true
      }
    }
  }

  return [...threadIds]
}

function getRequiredString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function createModelSessionKey(model) {
  return [
    model?.cliType ?? 'unknown',
    model?.command ?? '',
    model?.id ?? '',
    model?.providerModel ?? '',
    model?.reasoningEffort ?? '',
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

function createToolLoopLimitMessage(command, maxToolUsesWithoutText) {
  return `${command} executou ${maxToolUsesWithoutText} ferramentas sem gerar resposta textual. A execução foi interrompida para evitar loop; tente reformular com um objetivo mais específico ou divida a tarefa em passos menores.`
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
  collectThreadFamily,
  createOrchestrationModel,
  createOrchestrationStatusResponse,
  createToolLoopLimitMessage,
  createToolLoopProgressState,
  getAdapterSpawnArgs,
  getPersistentCloseLogLevel,
  registerCliIpcHandlers,
  resolveOrchestrationSpawnModel,
  shouldAbortForToolLoop,
  shouldSuppressPersistentTrailingOutput,
}
