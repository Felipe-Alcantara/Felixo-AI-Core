const {
  OrchestrationLimitError,
  createOrchestrationStore,
} = require('./orchestration-store.cjs')
const {
  ORCHESTRATOR_PROMPT_PRESETS,
} = require('./orchestrator-prompt-presets.cjs')
const {
  detectAvailabilityIssue,
} = require('../orchestrator/model-availability.cjs')
const {
  applyVariantDefaults,
  getFallbackOrderForCliType,
} = require('../orchestrator/spawn-model-selector.cjs')
const {
  requiresDelegation,
} = require('../orchestrator/delegation-policy.cjs')
const promptPresets = require('./orchestrator-prompt-presets.json')

const DEFAULT_MAX_AGENT_FALLBACK_ATTEMPTS = 2
// When several sub-agents fall back at the same time (e.g. a whole batch hits a
// rate-limit burst), avoid stampeding all of them onto the same provider. After
// this many redirects per cliType in a run, prefer the next provider in the
// fallback queue that still has spare capacity.
const DEFAULT_FALLBACK_LOAD_THRESHOLD = 2

class OrchestrationRunner {
  constructor(options = {}) {
    this.store = options.store ?? createOrchestrationStore(options.storeOptions)
    this.spawnAgent = options.spawnAgent ?? noopSpawnAgent
    this.invokeOrchestrator =
      options.invokeOrchestrator ?? noopInvokeOrchestrator
    this.validateSpawnAgent = options.validateSpawnAgent ?? noopValidateSpawnAgent
    this.sendChatEvent = options.sendChatEvent ?? (() => {})
    this.emitTerminalEvent = options.emitTerminalEvent ?? (() => {})
    this.createThreadId =
      options.createThreadId ??
      ((run, event) => `${run.runId}:${event.agentId}`)
    this.now = options.now ?? (() => new Date())
    this.runContexts = new Map()
    this.threadAgentJobs = new Map()
    this.maxAgentFallbackAttempts =
      options.maxAgentFallbackAttempts ?? DEFAULT_MAX_AGENT_FALLBACK_ATTEMPTS
    this.fallbackLoadThreshold =
      options.fallbackLoadThreshold ?? DEFAULT_FALLBACK_LOAD_THRESHOLD
    this.agentFallbackAttempts = new Map()
    this.cliTypeFallbackLoad = new Map()
    this.delegationGuardAttempts = new Map()
    this.maxDelegationGuardAttempts = options.maxDelegationGuardAttempts ?? 1
    this.availabilitySubscriptions = new WeakMap()
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
      const spawnValidation = this.validateSpawnAgent({
        run,
        event,
        context: this.getRunContext(run.runId),
      })

      if (spawnValidation?.ok === false) {
        throw new OrchestrationLimitError(
          spawnValidation.message ?? 'Modelo indisponivel para spawn.',
          spawnValidation.code ?? 'SPAWN_MODEL_UNAVAILABLE',
        )
      }

      const resolvedModel = spawnValidation?.selectedModel ?? null
      const resolvedCliType =
        resolvedModel?.cliType ??
        spawnValidation?.modelChoice?.selectedCliType ??
        event.cliType
      const resolvedEvent = resolvedModel
        ? {
            ...event,
            requestedCliType: event.cliType,
            cliType: resolvedCliType,
            selectedModel: resolvedModel,
          }
        : event

      run = this.store.createAgentJob(run.runId, {
        agentId: event.agentId,
        cliType: resolvedCliType,
        prompt: event.prompt,
      })

      const job = findAgentJob(run, event.agentId)
      const threadId = this.createThreadId(run, event)

      this.emitTerminalEvent({
        type: 'orchestration_agent_spawn',
        runId: run.runId,
        parentThreadId: run.parentThreadId,
        agentId: event.agentId,
        cliType: resolvedCliType,
        requestedCliType: event.cliType,
        threadId,
      })

      if (spawnValidation?.modelChoice) {
        this.emitTerminalEvent({
          type: 'orchestration_model_choice',
          runId: run.runId,
          parentThreadId: run.parentThreadId,
          agentId: event.agentId,
          requestedCliType: event.cliType,
          threadId,
          ...spawnValidation.modelChoice,
        })
      }

      const result = await this.spawnAgent({
        run,
        job,
        threadId,
        event: resolvedEvent,
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
      this.sendChatEvent({
        type: 'spawn_agent',
        agentId: event.agentId,
        cliType: resolvedCliType,
        prompt: event.prompt,
        sessionId: getResponseSessionId(run, this.getRunContext(run.runId)),
        threadId: run.parentThreadId,
        runId: run.runId,
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
      this.sendChatEvent({
        type: 'awaiting_agents',
        agentIds: event.agentIds,
        sessionId: getResponseSessionId(run, this.getRunContext(run.runId)),
        threadId: run.parentThreadId,
        runId: run.runId,
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

      const guardResult = await this.tryDelegationGuard({ run, context })
      if (guardResult?.rejected) {
        return guardResult
      }

      run = this.store.completeRun(run.runId, event.content)
      const runContext = this.getRunContext(run.runId)
      this.sendChatEvent({
        type: 'final_answer',
        content: event.content,
        sessionId: getResponseSessionId(run, runContext),
        threadId: context.threadId ?? run.parentThreadId,
        parentThreadId: run.parentThreadId,
        runId: run.runId,
      })
      this.forgetRunContext(run.runId)

      return { handled: true, ok: true, run }
    } catch (error) {
      return this.failRunFromError(run?.runId, error, context)
    }
  }

  async tryDelegationGuard({ run, context }) {
    if (!run || !Array.isArray(run.agentJobs) || run.agentJobs.length > 0) {
      return null
    }

    const originalPrompt = run.originalPrompt ?? context.originalPrompt ?? ''
    if (!requiresDelegation(originalPrompt)) {
      return null
    }

    const attempts = this.delegationGuardAttempts.get(run.runId) ?? 0
    if (attempts >= this.maxDelegationGuardAttempts) {
      // Already nudged once; let the orchestrator's final_answer through to
      // avoid infinite reinvoke loops if the LLM keeps refusing to delegate.
      return null
    }

    this.delegationGuardAttempts.set(run.runId, attempts + 1)

    this.emitTerminalEvent({
      type: 'orchestration_delegation_rejected',
      runId: run.runId,
      parentThreadId: run.parentThreadId,
      attempt: attempts + 1,
      originalPrompt,
    })

    const rejectionPrompt = promptPresets?.delegationGuard?.rejectionPrompt
    if (!rejectionPrompt) {
      return null
    }

    const result = await this.invokeOrchestrator({
      run,
      prompt: rejectionPrompt,
      context: this.getRunContext(run.runId),
    })

    if (result?.ok === false) {
      return this.failRunFromError(
        run.runId,
        new Error(result.message ?? 'Falha ao re-invocar orquestrador apos guard.'),
        this.getRunContext(run.runId),
      )
    }

    return { handled: true, ok: true, run, rejected: true }
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

      if (params.error) {
        const fallback = await this.tryMidTaskFallback({
          run,
          locatedJob,
          error: params.error,
          partialOutput: params.partialOutput ?? params.result ?? '',
        })

        if (fallback?.respawned) {
          return { handled: true, ok: true, run: fallback.run, respawned: true }
        }
      }

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
        result: params.error ? null : params.result ?? '',
        error: params.error ?? null,
      })

      if (!areCurrentTurnJobsTerminal(run)) {
        return { handled: true, ok: true, run }
      }

      return this.reinvokeOrchestrator(run.runId)
    } catch (error) {
      return this.failRunFromError(run?.runId, error, this.getRunContext(run?.runId))
    }
  }

  async tryMidTaskFallback({ run, locatedJob, error, partialOutput }) {
    const errorMessage = stringifyAgentError(error)
    if (!errorMessage) {
      return null
    }

    const issue = detectAvailabilityIssue({
      message: errorMessage,
      cliType: locatedJob.cliType,
    })

    if (!issue) {
      return null
    }

    const attemptKey = `${locatedJob.runId}:${locatedJob.agentId}`
    const attempts = this.agentFallbackAttempts.get(attemptKey) ?? 0
    if (attempts >= this.maxAgentFallbackAttempts) {
      return null
    }

    const runContext = this.getRunContext(locatedJob.runId)
    const job = findAgentJob(run, locatedJob.agentId)
    if (!job) {
      return null
    }

    if (runContext.modelAvailabilityRegistry?.recordError) {
      runContext.modelAvailabilityRegistry.recordError({
        message: errorMessage,
        cliType: job.cliType,
      })
    }

    const continuationPrompt = buildContinuationPrompt({
      originalPrompt: job.prompt,
      partialOutput,
      previousCliType: job.cliType,
      previousModelName: null,
    })

    const continuationEvent = {
      type: 'spawn_agent',
      agentId: locatedJob.agentId,
      cliType: job.cliType,
      prompt: continuationPrompt,
    }

    const validation = this.validateSpawnAgent({
      run,
      event: continuationEvent,
      context: runContext,
    })

    if (!validation || validation.ok === false) {
      return null
    }

    const validatedModel = validation.selectedModel ?? null
    const validatedCliType = validatedModel?.cliType ?? job.cliType
    const newSelectionRule = validation.modelChoice?.selectionRule

    // If the selector could only offer the same cliType that just failed AND no
    // alternative was found via fallback rules, abort to avoid a noop respawn.
    if (validatedCliType === job.cliType && newSelectionRule !== 'last-resort') {
      const sameType = validatedModel?.cliType === job.cliType
      const noAlternative = !validation.modelChoice?.fallbackFromCliType
      if (sameType && noAlternative) {
        return null
      }
    }

    // Distribute simultaneous fallbacks across providers when possible. If the
    // cliType the selector picked is already saturated by recent re-spawns in
    // this run, walk the fallback queue for a less loaded alternative.
    const spreadChoice = this.pickSpreadFallbackModel({
      run,
      runContext,
      job,
      validatedModel,
      validatedCliType,
    })
    const newModel = spreadChoice.model
    const newCliType = newModel?.cliType ?? validatedCliType

    this.bumpFallbackLoad(run.runId, newCliType)

    this.agentFallbackAttempts.set(attemptKey, attempts + 1)

    this.emitTerminalEvent({
      type: 'orchestration_agent_fallback',
      runId: run.runId,
      parentThreadId: run.parentThreadId,
      agentId: locatedJob.agentId,
      previousCliType: job.cliType,
      nextCliType: newCliType,
      nextModelId: newModel?.id ?? null,
      reason: issue.reason ?? errorMessage,
      attempt: attempts + 1,
      spreadFromCliType: spreadChoice.spreadFromCliType ?? null,
    })

    const resolvedEvent = {
      ...continuationEvent,
      requestedCliType: continuationEvent.cliType,
      cliType: newCliType,
      selectedModel: newModel,
    }

    const spawnResult = await this.spawnAgent({
      run,
      job,
      threadId: job.threadId,
      event: resolvedEvent,
      context: runContext,
    })

    if (spawnResult?.ok === false) {
      return null
    }

    return { respawned: true, run }
  }

  pickSpreadFallbackModel({ run, runContext, job, validatedModel, validatedCliType }) {
    const validatedLoad = this.getFallbackLoad(run.runId, validatedCliType)

    if (validatedLoad < this.fallbackLoadThreshold) {
      return { model: applyVariantDefaults(validatedModel) }
    }

    // Selector's first choice is saturated; walk the precomputed fallback queue
    // looking for a less-loaded alternative on the same tier. We never pick a
    // worse tier (e.g. last-resort) just to spread load — quality stays first.
    const order = getFallbackOrderForCliType(job.cliType, runContext, {
      prompt: job.prompt,
    })
    const validatedTier = order.find(
      (entry) => entry.model.cliType === validatedCliType,
    )?.tier

    if (!validatedTier) {
      return { model: applyVariantDefaults(validatedModel) }
    }

    const sameTier = order.filter((entry) => entry.tier === validatedTier)
    const ranked = sameTier
      .map((entry) => ({
        entry,
        load: this.getFallbackLoad(run.runId, entry.model.cliType),
      }))
      .sort((left, right) => left.load - right.load)

    const best = ranked[0]
    if (!best || best.entry.model.cliType === validatedCliType) {
      return { model: applyVariantDefaults(validatedModel) }
    }

    return {
      model: applyVariantDefaults(best.entry.model),
      spreadFromCliType: validatedCliType,
    }
  }

  bumpFallbackLoad(runId, cliType) {
    if (!cliType) {
      return
    }
    const runLoads = this.cliTypeFallbackLoad.get(runId) ?? new Map()
    runLoads.set(cliType, (runLoads.get(cliType) ?? 0) + 1)
    this.cliTypeFallbackLoad.set(runId, runLoads)
  }

  getFallbackLoad(runId, cliType) {
    return this.cliTypeFallbackLoad.get(runId)?.get(cliType) ?? 0
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
      this.sendChatEvent({
        type: 'orchestration_status',
        status: 'running_orchestrator',
        sessionId: getResponseSessionId(run, this.getRunContext(run.runId)),
        threadId: run.parentThreadId,
        runId: run.runId,
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
      this.forgetRunContext(failedRun.runId)
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

  getRunByThreadId(threadId) {
    const runId = this.runContexts.get(threadId)?.runId

    return runId ? this.store.get(runId) : null
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
    runContext.responseSessionId =
      runContext.responseSessionId ??
      context.responseSessionId ??
      context.streamSessionId ??
      context.sessionId

    this.runContexts.set(run.runId, runContext)
    this.runContexts.set(run.parentThreadId, runContext)

    if (context.threadId) {
      this.runContexts.set(context.threadId, runContext)
    }

    this.subscribeAvailabilityChanges(run, runContext)
  }

  subscribeAvailabilityChanges(run, runContext) {
    const registry = runContext.modelAvailabilityRegistry
    if (!registry || typeof registry.subscribe !== 'function') {
      return
    }

    if (this.availabilitySubscriptions.has(registry)) {
      return
    }

    const unsubscribe = registry.subscribe((event) => {
      this.emitTerminalEvent({
        ...event,
        type: 'orchestration_model_availability',
        availabilityType: event.type,
        runId: run.runId,
        parentThreadId: run.parentThreadId,
      })
    })

    this.availabilitySubscriptions.set(registry, unsubscribe)
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
    this.forgetRunContext(run.runId)

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

  resetThread(threadId) {
    const runIds = new Set()

    for (const run of this.store.list()) {
      if (
        run.parentThreadId === threadId ||
        run.agentJobs.some((job) => job.threadId === threadId)
      ) {
        runIds.add(run.runId)
      }
    }

    for (const context of this.runContexts.values()) {
      if (context?.parentThreadId === threadId || context?.threadId === threadId) {
        runIds.add(context.runId)
      }
    }

    for (const [jobThreadId, agentJob] of this.threadAgentJobs) {
      if (jobThreadId === threadId) {
        runIds.add(agentJob.runId)
      }
    }

    const failedRunIds = []

    for (const runId of runIds) {
      const run = this.store.get(runId)

      if (run && run.status !== 'completed' && run.status !== 'failed') {
        this.store.failRun(runId, 'Thread resetada pelo usuario.')
        failedRunIds.push(runId)
      }

      this.forgetRunContext(runId)
    }

    return {
      runIds: [...runIds],
      failedRunIds,
    }
  }

  forgetRunContext(runId) {
    for (const [key, value] of this.runContexts) {
      if (value?.runId === runId) {
        this.runContexts.delete(key)
      }
    }

    for (const [threadId, agentJob] of this.threadAgentJobs) {
      if (agentJob?.runId === runId) {
        this.threadAgentJobs.delete(threadId)
      }
    }

    this.cliTypeFallbackLoad.delete(runId)
    this.delegationGuardAttempts.delete(runId)
    for (const key of this.agentFallbackAttempts.keys()) {
      if (key.startsWith(`${runId}:`)) {
        this.agentFallbackAttempts.delete(key)
      }
    }
  }
}

function createOrchestrationRunner(options) {
  return new OrchestrationRunner(options)
}

function createAgentResultsPrompt(run) {
  const { agentResults } = ORCHESTRATOR_PROMPT_PRESETS
  const jobs = getCurrentTurnJobs(run)
  const sections = jobs.map((job) => {
    const status =
      job.status === 'completed'
        ? agentResults.completedStatus
        : agentResults.errorStatus
    const content =
      job.status === 'completed'
        ? job.result || agentResults.missingResult
        : job.error || agentResults.missingError

    return [
      `--- Agente ${job.agentId} (${job.cliType}) ---`,
      agentResults.agentQuestionHeading,
      job.prompt || agentResults.missingQuestion,
      `Status: ${status}`,
      job.status === 'completed'
        ? agentResults.completedContentHeading
        : agentResults.errorContentHeading,
      content,
    ].join('\n')
  })

  return [
    agentResults.continueFromOriginal,
    '',
    agentResults.finalInstructionsHeading,
    ...agentResults.finalAnswerRules,
    '',
    agentResults.originalObjectiveHeading,
    run.originalPrompt,
    '',
    agentResults.agentResultsHeading,
    '',
    sections.join('\n\n') || agentResults.noAgentResults,
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

function stringifyAgentError(error) {
  if (!error) {
    return ''
  }

  if (typeof error === 'string') {
    return error
  }

  if (typeof error === 'object') {
    return String(error.message ?? error.reason ?? '').trim()
  }

  return String(error)
}

function buildContinuationPrompt({
  originalPrompt,
  partialOutput,
  previousCliType,
  previousModelName,
}) {
  const previousLabel = previousModelName
    ? `${previousModelName} (${previousCliType})`
    : previousCliType
  const partial = String(partialOutput ?? '').trim()
  const partialBlock = partial
    ? `\n\nProgresso parcial do agente anterior antes da interrupção:\n"""\n${partial}\n"""`
    : ''

  return [
    `Tarefa original do sub-agente:\n"""\n${String(originalPrompt ?? '').trim()}\n"""`,
    `O modelo anterior (${previousLabel}) interrompeu por limite de uso ou autenticação. Continue a tarefa a partir do ponto em que ele parou. Se o progresso parcial estiver disponível, use-o como contexto; caso contrário, recomece da etapa que entender mais segura.${partialBlock}`,
  ].join('\n\n')
}

function getResponseSessionId(run, context = {}) {
  return (
    context.responseSessionId ??
    context.streamSessionId ??
    context.sessionId ??
    run.runId
  )
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

function noopValidateSpawnAgent() {
  return { ok: true }
}

module.exports = {
  OrchestrationRunner,
  areCurrentTurnJobsTerminal,
  createAgentResultsPrompt,
  createOrchestrationRunner,
}
