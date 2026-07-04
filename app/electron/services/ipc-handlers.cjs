// Registra os handlers IPC do fluxo de CLIs (envio de prompts, stop, reset,
// catálogo oficial e orquestração) e implementa o caminho one-shot de spawn.
// O ciclo de vida de sessões persistentes vive em persistent-cli-session.cjs;
// helpers puros compartilhados vivem em cli-event-utils.cjs.
const { app, ipcMain } = require('electron')
const { CliProcessManager } = require('./cli-process-manager.cjs')
const {
  createCliExecutionPlan,
  getAdapterSpawnArgs,
} = require('./orchestrator/cli-execution-planner.cjs')
const {
  createModelAvailabilityRegistry,
} = require('./orchestrator/model-availability.cjs')
const {
  createOrchestrationModel,
  resolveOrchestrationSpawnModel,
  validateOrchestrationSpawnModel,
} = require('./orchestrator/spawn-model-selector.cjs')
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
const {
  FIRST_VISIBLE_OUTPUT_TIMEOUT_MS,
  collectThreadFamily,
  createChunkDetails,
  createExitErrorMessage,
  createModelSessionKey,
  createNoVisibleOutputMessage,
  createNonJsonStdoutMessage,
  createTextPreview,
  createToolLoopLimitMessage,
  createToolLoopProgressState,
  formatAdapterStderr,
  formatDuration,
  getAdapterStderrLevel,
  getPersistentCloseLogLevel,
  getRequiredString,
  handleOrchestrationPromise,
  isVisibleCliActivity,
  parseAdapterLine,
  shouldAbortForToolLoop,
  shouldAbortOnAdapterStderr,
  shouldSuppressAdapterStderr,
  shouldSuppressPersistentTrailingOutput,
  writeOneShotStdin,
} = require('./cli-event-utils.cjs')
const {
  createPersistentCliSessionManager,
} = require('./persistent-cli-session.cjs')

const cliManager = new CliProcessManager()
const stoppedSessions = new Set()
const cliThreadSessions = new Map()
const terminalSessionParents = new Map()
const modelAvailabilityRegistry = createModelAvailabilityRegistry()
const persistentSessions = createPersistentCliSessionManager({
  cliManager,
  stoppedSessions,
  sendTerminalEvents,
  sendCliEvent,
  recordModelAvailabilityEvent,
})

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
    abortStream: (sessionId) => {
      try {
        cliManager.kill(sessionId)
      } catch (error) {
        logQaEvent({
          level: 'warn',
          scope: 'cli:abort',
          sessionId,
          message: `Failed to abort orchestrator stream: ${
            error instanceof Error ? error.message : String(error)
          }`,
        })
      }
    },
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
      originalPrompt: orchestrationContext.originalPrompt ?? promptHint ?? prompt,
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
      return persistentSessions.sendPersistentCliRequest({
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
        persistentSessions.hasPersistentSession(resetThreadId) || hadPersistentSession
      stoppedSessions.add(resetThreadId)
      const didKill = persistentSessions.closePersistentSession(resetThreadId, {
        force: true,
      })

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

function spawnOrchestrationAgent({
  run,
  event,
  threadId,
  context,
  sendCliRequest,
}) {
  const resolvedModel = event.selectedModel
    ? { ok: true, model: event.selectedModel }
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
  spawnOrchestrationAgent,
  shouldAbortForToolLoop,
  shouldSuppressPersistentTrailingOutput,
}
