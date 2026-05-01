const {
  OrchestrationLimitError,
  createOrchestrationStore,
} = require('./orchestration-store.cjs')

class OrchestrationRunner {
  constructor(options = {}) {
    this.store = options.store ?? createOrchestrationStore(options.storeOptions)
    this.spawnAgent = options.spawnAgent ?? noopSpawnAgent
    this.invokeOrchestrator =
      options.invokeOrchestrator ?? noopInvokeOrchestrator
    this.sendChatEvent = options.sendChatEvent ?? (() => {})
    this.emitTerminalEvent = options.emitTerminalEvent ?? (() => {})
    this.createThreadId =
      options.createThreadId ??
      ((run, event) => `${run.runId}:${event.agentId}`)
    this.now = options.now ?? (() => new Date())
    this.runContexts = new Map()
    this.threadAgentJobs = new Map()
  }

  async handleOrchestrationEvent(event, context = {}) {
    if (!event || typeof event !== 'object') {
      return { handled: false, ok: false, message: 'Evento invalido.' }
    }

    if (event.type === 'spawn_agent') {
      return this.handleSpawnAgent(event, context)
    }

    if (event.type === 'awaiting_agents') {
      return this.handleAwaitingAgents(event, context)
    }

    if (event.type === 'final_answer') {
      return this.handleFinalAnswer(event, context)
    }

    return { handled: false, ok: true }
  }

  async handleSpawnAgent(event, context = {}) {
    let run = this.getOrCreateRun(event, context)

    try {
      this.assertRunNotTimedOut(run)
      run = this.store.createAgentJob(run.runId, {
        agentId: event.agentId,
        cliType: event.cliType,
        prompt: event.prompt,
      })

      const job = findAgentJob(run, event.agentId)
      const threadId = this.createThreadId(run, event)

      this.emitTerminalEvent({
        type: 'orchestration_agent_spawn',
        runId: run.runId,
        parentThreadId: run.parentThreadId,
        agentId: event.agentId,
        cliType: event.cliType,
        threadId,
      })

      const result = await this.spawnAgent({
        run,
        job,
        threadId,
        event,
        context: this.getRunContext(run.runId),
      })

      if (result?.ok === false) {
        run = this.store.failAgentJob(run.runId, event.agentId, {
          error: result.message ?? 'Falha ao iniciar sub-agente.',
        })
        return {
          handled: true,
          ok: false,
          run,
          message: result.message ?? 'Falha ao iniciar sub-agente.',
        }
      }

      const childThreadId = result?.threadId ?? threadId
      run = this.store.startAgentJob(run.runId, event.agentId, {
        threadId: childThreadId,
      })
      this.threadAgentJobs.set(childThreadId, {
        runId: run.runId,
        agentId: event.agentId,
      })

      return { handled: true, ok: true, run }
    } catch (error) {
      return this.failRunFromError(run?.runId, error, context)
    }
  }

  async handleAwaitingAgents(event, context = {}) {
    let run = this.getOrCreateRun(event, context)

    try {
      this.assertRunNotTimedOut(run)
      run = this.store.markWaitingForAgents(run.runId, event.agentIds)

      this.emitTerminalEvent({
        type: 'orchestration_waiting_agents',
        runId: run.runId,
        parentThreadId: run.parentThreadId,
        agentIds: event.agentIds,
      })

      if (areCurrentTurnJobsTerminal(run)) {
        return this.reinvokeOrchestrator(run.runId)
      }

      return { handled: true, ok: true, run }
    } catch (error) {
      return this.failRunFromError(run?.runId, error, context)
    }
  }

  async handleFinalAnswer(event, context = {}) {
    let run = this.getOrCreateRun(event, context)

    try {
      this.assertRunNotTimedOut(run)
      run = this.store.completeRun(run.runId, event.content)
      this.sendChatEvent({
        type: 'final_answer',
        content: event.content,
        sessionId: getResponseSessionId(run, context),
        threadId: run.parentThreadId,
        runId: run.runId,
      })
      this.runContexts.delete(run.runId)

      return { handled: true, ok: true, run }
    } catch (error) {
      return this.failRunFromError(run?.runId, error, context)
    }
  }

  async onAgentJobCompleted(params = {}) {
    const locatedJob =
      params.runId && params.agentId
        ? { runId: params.runId, agentId: params.agentId }
        : this.threadAgentJobs.get(params.threadId)

    if (!locatedJob) {
      return {
        handled: false,
        ok: false,
        message: 'Agent job nao encontrado para a thread.',
      }
    }

    let run = this.store.get(locatedJob.runId)

    try {
      this.assertRunNotTimedOut(run)
      run = params.error
        ? this.store.failAgentJob(locatedJob.runId, locatedJob.agentId, {
            error: params.error,
          })
        : this.store.completeAgentJob(locatedJob.runId, locatedJob.agentId, {
            result: params.result ?? '',
          })

      this.emitTerminalEvent({
        type: 'orchestration_agent_result',
        runId: run.runId,
        parentThreadId: run.parentThreadId,
        agentId: locatedJob.agentId,
        status: params.error ? 'error' : 'completed',
      })

      if (!areCurrentTurnJobsTerminal(run)) {
        return { handled: true, ok: true, run }
      }

      return this.reinvokeOrchestrator(run.runId)
    } catch (error) {
      return this.failRunFromError(run?.runId, error, this.getRunContext(run?.runId))
    }
  }

  async reinvokeOrchestrator(runId) {
    let run = this.store.get(runId)

    try {
      this.assertRunNotTimedOut(run)
      const prompt = createAgentResultsPrompt(run)
      run = this.store.advanceTurn(run.runId)

      this.emitTerminalEvent({
        type: 'orchestration_reinvoke',
        runId: run.runId,
        parentThreadId: run.parentThreadId,
        turn: run.currentTurn,
      })

      const result = await this.invokeOrchestrator({
        run,
        prompt,
        context: this.getRunContext(run.runId),
      })

      if (result?.ok === false) {
        return this.failRunFromError(
          run.runId,
          new Error(result.message ?? 'Falha ao re-invocar orquestrador.'),
          this.getRunContext(run.runId),
        )
      }

      return { handled: true, ok: true, run, prompt }
    } catch (error) {
      return this.failRunFromError(run?.runId, error, this.getRunContext(run?.runId))
    }
  }

  failExpiredRuns() {
    const failedRuns = []

    for (const run of this.store.list()) {
      if (run.status === 'completed' || run.status === 'failed') {
        continue
      }

      if (!this.isRunTimedOut(run)) {
        continue
      }

      const failedRun = this.store.failRun(
        run.runId,
        'Timeout de orquestracao atingido.',
      )
      failedRuns.push(failedRun)
      this.sendRunError(failedRun, 'Timeout de orquestracao atingido.')
    }

    return failedRuns
  }

  getRun(runId) {
    return this.store.get(runId)
  }

  listRuns() {
    return this.store.list()
  }

  getAgentJobByThreadId(threadId) {
    return this.threadAgentJobs.get(threadId) ?? null
  }

  getOrCreateRun(event, context = {}) {
    const existingRunId =
      context.runId ??
      this.runContexts.get(context.parentThreadId)?.runId ??
      this.runContexts.get(context.threadId)?.runId ??
      this.threadAgentJobs.get(context.threadId)?.runId

    if (existingRunId) {
      const existingRun = this.store.get(existingRunId)

      if (existingRun) {
        this.rememberRunContext(existingRun, context)
        return existingRun
      }
    }

    const parentThreadId =
      context.parentThreadId ?? context.threadId ?? event.threadId ?? event.sessionId
    const model = context.orchestratorModel ?? context.model ?? null
    const orchestratorCliType =
      context.orchestratorCliType ?? model?.cliType ?? context.cliType
    const run = this.store.create({
      runId: context.runId,
      parentThreadId,
      orchestratorCliType,
      orchestratorModel: model,
      originalPrompt: context.originalPrompt ?? context.prompt ?? '',
      limits: context.limits,
    })

    this.rememberRunContext(run, context)
    return run
  }

  rememberRunContext(run, context = {}) {
    const runContext = {
      ...this.getRunContext(run.runId),
      ...context,
      runId: run.runId,
      parentThreadId: run.parentThreadId,
      orchestratorCliType: run.orchestratorCliType,
      orchestratorModel: run.orchestratorModel,
      originalPrompt: run.originalPrompt,
    }

    this.runContexts.set(run.runId, runContext)
    this.runContexts.set(run.parentThreadId, runContext)
  }

  getRunContext(runId) {
    if (!runId) {
      return {}
    }

    return this.runContexts.get(runId) ?? {}
  }

  assertRunNotTimedOut(run) {
    if (this.isRunTimedOut(run)) {
      throw new OrchestrationLimitError(
        'Timeout de orquestracao atingido.',
        'MAX_RUNTIME_REACHED',
      )
    }
  }

  isRunTimedOut(run) {
    if (!run?.createdAt || !run.maxRuntimeMinutes) {
      return false
    }

    const createdAtMs = Date.parse(run.createdAt)
    const nowMs = getTimeMs(this.now())

    return nowMs - createdAtMs > run.maxRuntimeMinutes * 60 * 1000
  }

  failRunFromError(runId, error, context = {}) {
    const message =
      error instanceof Error ? error.message : 'Falha na orquestracao.'

    if (!runId) {
      this.sendChatEvent({
        type: 'error',
        message,
        sessionId: context.streamSessionId ?? context.sessionId ?? '',
        threadId: context.parentThreadId ?? context.threadId,
      })

      return { handled: true, ok: false, message }
    }

    const run = this.store.failRun(runId, message)
    this.sendRunError(run, message, context)

    return { handled: true, ok: false, run, message }
  }

  sendRunError(run, message, context = {}) {
    this.sendChatEvent({
      type: 'error',
      message,
      sessionId: getResponseSessionId(run, context),
      threadId: run.parentThreadId,
      runId: run.runId,
    })
  }
}

function createOrchestrationRunner(options) {
  return new OrchestrationRunner(options)
}

function createAgentResultsPrompt(run) {
  const jobs = getCurrentTurnJobs(run)
  const sections = jobs.map((job) => {
    const status = job.status === 'completed' ? 'concluido' : 'erro'
    const content =
      job.status === 'completed'
        ? job.result || 'Sem resultado textual.'
        : job.error || 'Erro sem mensagem.'

    return [
      `--- Agente ${job.agentId} (${job.cliType}) ---`,
      `Status: ${status}`,
      job.status === 'completed' ? 'Resultado:' : 'Mensagem:',
      content,
    ].join('\n')
  })

  return [
    'Continue a orquestracao a partir do objetivo original.',
    '',
    'Objetivo original:',
    run.originalPrompt,
    '',
    'Resultados dos sub-agentes solicitados:',
    '',
    sections.join('\n\n') || 'Nenhum sub-agente retornou resultado.',
  ].join('\n')
}

function areCurrentTurnJobsTerminal(run) {
  const jobs = getCurrentTurnJobs(run)

  return (
    jobs.length > 0 &&
    jobs.every((job) => job.status === 'completed' || job.status === 'error')
  )
}

function getCurrentTurnJobs(run) {
  return run.agentJobs.filter((job) => job.turn === run.currentTurn)
}

function findAgentJob(run, agentId) {
  return run.agentJobs.find((job) => job.agentId === agentId) ?? null
}

function getResponseSessionId(run, context = {}) {
  return context.streamSessionId ?? context.sessionId ?? run.runId
}

function getTimeMs(value) {
  if (value instanceof Date) {
    return value.getTime()
  }

  return new Date(value).getTime()
}

async function noopSpawnAgent() {
  return { ok: true }
}

async function noopInvokeOrchestrator() {
  return { ok: true }
}

module.exports = {
  OrchestrationRunner,
  areCurrentTurnJobsTerminal,
  createAgentResultsPrompt,
  createOrchestrationRunner,
}
