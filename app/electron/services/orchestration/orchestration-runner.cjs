const { randomUUID } = require('node:crypto')
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
  getProviderFamily,
  requiresProviderSwitchConfirmation,
} = require('../orchestrator/spawn-model-selector.cjs')
const { redactSecrets } = require('../official-cli-account-status.cjs')
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
// Prazo para a pessoa responder se o sub-agente pode trocar de provedor. Sem
// resposta, conta como recusa (decisão do dono). Não há timer próprio: quem
// vence as decisões é a varredura de `failExpiredRuns`, que já roda a cada
// 60 s (`expired-runs-sweeper.cjs`).
const PROVIDER_SWITCH_TIMEOUT_MS = 10 * 60 * 1000
// O motivo mostrado no card e gravado no registro de trocas vem do texto de
// erro da CLI: vai redigido e curto (o registro aceita até 400 caracteres).
const PROVIDER_SWITCH_REASON_MAX_CHARS = 300
const PROVIDER_SWITCH_OUTCOMES = Object.freeze({
  accepted: 'accepted',
  refused: 'refused',
  expired: 'expired',
  cancelled: 'cancelled',
  runFinished: 'run_finished',
  superseded: 'superseded',
})

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
    this.createDecisionId = options.createDecisionId ?? (() => randomUUID())
    this.recordSwitchDecision = options.recordSwitchDecision ?? (() => {})
    this.providerSwitchTimeoutMs =
      options.providerSwitchTimeoutMs ?? PROVIDER_SWITCH_TIMEOUT_MS
    // Decisões de troca de provedor esperando a pessoa. Em memória, como o
    // store: um reinício do app apaga a pergunta sem executar nada.
    this.pendingProviderSwitches = new Map()
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
      const { resolvedModel, resolvedCliType, resolvedEvent, modelChoice } =
        this.resolveSpawnTarget(run, event)

      run = this.store.createAgentJob(run.runId, {
        agentId: event.agentId,
        cliType: resolvedCliType,
        prompt: event.prompt,
      })

      const threadId = this.createThreadId(run, event)

      if (requiresProviderSwitchConfirmation(event.cliType, resolvedCliType)) {
        // O job fica `pending` enquanto a pessoa decide: o turno não fecha
        // (`areCurrentTurnJobsTerminal`) e o run espera, sem bloquear nada.
        this.emitModelChoice({ run, event, threadId, modelChoice })
        this.requestProviderSwitch({
          kind: 'initial',
          run,
          agentId: event.agentId,
          fromCliType: event.cliType,
          toCliType: resolvedCliType,
          toModel: resolvedModel,
          rule: modelChoice?.selectionRule,
          reason: modelChoice?.reason,
          payload: { event, threadId },
        })

        return {
          handled: true,
          ok: true,
          run: this.store.get(run.runId),
          awaitingConfirmation: true,
        }
      }

      return await this.startSpawnedJob({
        run,
        event,
        resolvedEvent,
        resolvedCliType,
        threadId,
        modelChoice,
      })
    } catch (error) {
      return this.failRunFromError(run?.runId, error, context)
    }
  }

  /**
   * Resolve em que modelo/cliType o sub-agente rodaria. Lança quando nenhum
   * modelo serve, como o spawn sempre fez.
   */
  resolveSpawnTarget(run, event) {
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

    return {
      resolvedModel,
      resolvedCliType,
      resolvedEvent,
      modelChoice: spawnValidation?.modelChoice,
    }
  }

  /**
   * Inicia o processo do sub-agente de um job já criado. Usado no spawn direto
   * e no aceite de uma troca de provedor.
   */
  async startSpawnedJob({ run, event, resolvedEvent, resolvedCliType, threadId, modelChoice }) {
    const job = findAgentJob(run, event.agentId)

    if (job && job.cliType !== resolvedCliType) {
      // A revalidação no aceite pode ter escolhido outro cliType da mesma
      // família (ou o provedor original de volta).
      run = this.store.updateAgentJob(run.runId, event.agentId, (draft, now) => {
        draft.cliType = resolvedCliType
        draft.updatedAt = now
      })
    }

    this.emitTerminalEvent({
      type: 'orchestration_agent_spawn',
      runId: run.runId,
      parentThreadId: run.parentThreadId,
      agentId: event.agentId,
      cliType: resolvedCliType,
      requestedCliType: event.cliType,
      threadId,
    })

    this.emitModelChoice({ run, event, threadId, modelChoice })

    const result = await this.spawnAgent({
      run,
      job: findAgentJob(run, event.agentId),
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
  }

  emitModelChoice({ run, event, threadId, modelChoice }) {
    if (!modelChoice) {
      return
    }

    this.emitTerminalEvent({
      type: 'orchestration_model_choice',
      runId: run.runId,
      parentThreadId: run.parentThreadId,
      agentId: event.agentId,
      requestedCliType: event.cliType,
      threadId,
      ...modelChoice,
    })
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

  async checkOrchestratorDoneWithoutSpawn({ threadId, context = {} } = {}) {
    // Called by the bridge when the orchestrator stream finishes (cliEvent
    // type=done) on the orchestrator thread. If no agent was spawned during
    // this turn AND the original prompt required delegation, the orchestrator
    // tried to answer directly with free text — re-invoke with the rejection
    // prompt to force delegation on the next turn.
    const run =
      this.getRunByThreadId(threadId) ??
      (context.originalPrompt
        ? this.getOrCreateRun(
            { type: 'final_answer' },
            { ...context, threadId },
          )
        : null)

    if (!run) {
      return null
    }

    return this.tryDelegationGuard({ run, context })
  }

  shouldGuardOrchestratorDoneWithoutSpawn({ threadId, context = {} } = {}) {
    const run = this.getRunByThreadId(threadId)
    const originalPrompt = run?.originalPrompt ?? context.originalPrompt ?? ''

    if (!requiresDelegation(originalPrompt)) {
      return false
    }

    if (run?.agentJobs?.length > 0) {
      return false
    }

    const runId =
      run?.runId ??
      context.runId ??
      this.runContexts.get(context.parentThreadId)?.runId ??
      this.runContexts.get(context.threadId)?.runId
    const attempts = runId
      ? this.delegationGuardAttempts.get(runId) ?? 0
      : 0

    return attempts < this.maxDelegationGuardAttempts
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

        // Esperando a pessoa decidir a troca de provedor: como num respawn, o
        // job segue `running` e não falha agora.
        if (fallback?.awaitingConfirmation) {
          return {
            handled: true,
            ok: true,
            run: fallback.run,
            respawned: false,
            awaitingConfirmation: true,
          }
        }
      }

      return await this.finishAgentJob({
        runId: locatedJob.runId,
        agentId: locatedJob.agentId,
        error: params.error,
        result: params.result,
      })
    } catch (error) {
      return this.failRunFromError(run?.runId, error, this.getRunContext(run?.runId))
    }
  }

  /**
   * Fecha o job com resultado ou erro e, se o turno inteiro terminou,
   * reinvoca o orquestrador com os resultados.
   *
   * @param {{ reinvoke?: boolean }} params - `reinvoke: false` fecha sem
   *   chamar o orquestrador (execução interrompida pela pessoa).
   */
  async finishAgentJob({ runId, agentId, error, result, reinvoke = true }) {
    const run = error
      ? this.store.failAgentJob(runId, agentId, { error })
      : this.store.completeAgentJob(runId, agentId, { result: result ?? '' })

    this.emitTerminalEvent({
      type: 'orchestration_agent_result',
      runId: run.runId,
      parentThreadId: run.parentThreadId,
      agentId,
      status: error ? 'error' : 'completed',
      result: error ? null : result ?? '',
      error: error ?? null,
    })

    if (!reinvoke || !areCurrentTurnJobsTerminal(run)) {
      return { handled: true, ok: true, run }
    }

    return this.reinvokeOrchestrator(run.runId)
  }

  async tryMidTaskFallback({ run, locatedJob, error, partialOutput }) {
    const errorMessage = stringifyAgentError(error)
    if (!errorMessage) {
      return null
    }

    // O job precisa ser localizado ANTES da detecção: `locatedJob` carrega
    // apenas { runId, agentId }, então ler o cliType dali daria sempre
    // undefined — e o provedor muda o resultado da classificação (um limite
    // do Claude é cli-wide, com cooldown próprio; sem cliType viraria um
    // limite de modelo, e o orquestrador tentaria outro modelo da mesma CLI
    // igualmente bloqueada).
    const job = findAgentJob(run, locatedJob.agentId)
    if (!job) {
      return null
    }

    const issue = detectAvailabilityIssue({
      message: errorMessage,
      cliType: job.cliType,
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

    if (runContext.modelAvailabilityRegistry?.recordError) {
      runContext.modelAvailabilityRegistry.recordError({
        message: errorMessage,
        cliType: job.cliType,
      })
    }

    const continuationEvent = {
      type: 'spawn_agent',
      agentId: locatedJob.agentId,
      cliType: job.cliType,
      prompt: buildContinuationPrompt({
        originalPrompt: job.prompt,
        partialOutput,
        previousCliType: job.cliType,
        previousModelName: null,
      }),
    }
    const plan = this.planMidTaskFallback({ run, job, continuationEvent })

    if (!plan) {
      return null
    }

    const fallback = {
      locatedJob,
      continuationEvent,
      originalError: error,
      reason: issue.reason ?? errorMessage,
    }

    if (requiresProviderSwitchConfirmation(job.cliType, plan.newCliType)) {
      // A thread do processo que falhou é solta já: um `close` atrasado dele
      // não pode concluir nem falhar o job enquanto a pessoa decide.
      this.threadAgentJobs.delete(job.threadId)
      this.requestProviderSwitch({
        kind: 'mid-task',
        run,
        agentId: locatedJob.agentId,
        fromCliType: job.cliType,
        toCliType: plan.newCliType,
        toModel: plan.newModel,
        rule: plan.selectionRule,
        reason: fallback.reason,
        payload: fallback,
      })

      return { awaitingConfirmation: true, run: this.store.get(run.runId) }
    }

    return this.executeMidTaskFallback({ run, plan, ...fallback })
  }

  /**
   * Decide para onde o sub-agente que falhou iria (validação + espalhamento
   * de carga), sem efeito nenhum. `null` quando não há alternativa real.
   */
  planMidTaskFallback({ run, job, continuationEvent }) {
    const runContext = this.getRunContext(run.runId)
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
    const selectionRule = validation.modelChoice?.selectionRule

    // If the selector could only offer the same cliType that just failed AND no
    // alternative was found via fallback rules, abort to avoid a noop respawn.
    if (validatedCliType === job.cliType && selectionRule !== 'last-resort') {
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

    return {
      newModel,
      newCliType: newModel?.cliType ?? validatedCliType,
      selectionRule,
      spreadFromCliType: spreadChoice.spreadFromCliType ?? null,
    }
  }

  /**
   * Re-spawna o sub-agente no destino do plano. A carga por cliType e o
   * contador de tentativas só andam aqui — numa troca de provedor, só depois
   * do aceite.
   */
  async executeMidTaskFallback({ run, plan, locatedJob, continuationEvent, reason }) {
    const job = findAgentJob(run, locatedJob.agentId)
    const attemptKey = `${locatedJob.runId}:${locatedJob.agentId}`
    const attempts = this.agentFallbackAttempts.get(attemptKey) ?? 0
    const { newModel, newCliType } = plan

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
      reason,
      attempt: attempts + 1,
      spreadFromCliType: plan.spreadFromCliType ?? null,
    })

    const resolvedEvent = {
      ...continuationEvent,
      requestedCliType: continuationEvent.cliType,
      cliType: newCliType,
      selectedModel: newModel,
    }

    // Thread nova para a tentativa, em vez de reusar a do processo que acabou
    // de falhar. O anterior recebe SIGTERM com carência, então seu `close`
    // ainda pode emitir um erro depois — e enquanto o threadId antigo apontar
    // para este job, esse evento atrasado é indistinguível do resultado do
    // respawn: dispararia outro fallback ou marcaria como falho um job que a
    // nova tentativa ainda está executando.
    const fallbackThreadId = `${job.threadId}:fb${attempts + 1}`
    this.threadAgentJobs.delete(job.threadId)
    this.threadAgentJobs.set(fallbackThreadId, {
      runId: locatedJob.runId,
      agentId: locatedJob.agentId,
    })
    run = this.store.startAgentJob(locatedJob.runId, locatedJob.agentId, {
      threadId: fallbackThreadId,
    })

    const spawnResult = await this.spawnAgent({
      run,
      job,
      threadId: fallbackThreadId,
      event: resolvedEvent,
      context: this.getRunContext(locatedJob.runId),
    })

    if (spawnResult?.ok === false) {
      return null
    }

    return { respawned: true, run }
  }

  // ── Troca de provedor com confirmação (decisão do dono) ──────────────────

  /**
   * Registra a pergunta e avisa o chat e o log de terminal. Não bloqueia: o
   * runner continua reagindo a eventos, e a resposta chega por
   * `resolveProviderSwitch` (ou vence pela varredura).
   */
  requestProviderSwitch({ kind, run, agentId, fromCliType, toCliType, toModel, rule, reason, payload }) {
    const nowMs = getTimeMs(this.now())
    const expiresAtMs = getProviderSwitchDeadlineMs(run, nowMs, this.providerSwitchTimeoutMs)
    const decision = {
      decisionId: this.createDecisionId(),
      kind,
      runId: run.runId,
      agentId,
      parentThreadId: run.parentThreadId,
      sessionId: getResponseSessionId(run, this.getRunContext(run.runId)),
      fromCliType,
      toCliType,
      toModelId: toModel?.id ?? null,
      toModelName: toModel?.name ?? null,
      rule: rule ?? null,
      reason: createSwitchReason(reason),
      requestedAt: new Date(nowMs).toISOString(),
      expiresAt: new Date(expiresAtMs).toISOString(),
      expiresAtMs,
      payload,
    }

    this.pendingProviderSwitches.set(decision.decisionId, decision)

    const view = toPublicProviderSwitch(decision)
    this.emitTerminalEvent({
      ...view,
      type: 'orchestration_provider_switch_request',
    })
    this.sendChatEvent({
      ...view,
      type: 'provider_switch_request',
      threadId: run.parentThreadId,
    })

    return decision
  }

  /** Decisões esperando a pessoa, para o renderer recuperar ao montar. */
  listProviderSwitches() {
    return [...this.pendingProviderSwitches.values()]
      .map(toPublicProviderSwitch)
      .sort((left, right) => left.requestedAt.localeCompare(right.requestedAt))
  }

  /**
   * Resposta da pessoa. Idempotente: a decisão sai do mapa antes de qualquer
   * await, então um clique duplo ou um IPC repetido recebe
   * `DECISION_NOT_PENDING` e nunca gera um segundo spawn. Resposta depois do
   * prazo não espera a varredura: vence ali mesmo como recusa ("sem resposta
   * em 10 minutos conta como recusa").
   */
  async resolveProviderSwitch({ decisionId, accept } = {}) {
    const decision = this.pendingProviderSwitches.get(decisionId)

    if (!decision) {
      return {
        ok: false,
        code: 'DECISION_NOT_PENDING',
        message: 'Essa troca de provedor já foi respondida ou expirou.',
      }
    }

    this.pendingProviderSwitches.delete(decisionId)
    const run = this.store.get(decision.runId)

    if (!isRunActive(run) || this.isRunTimedOut(run)) {
      this.closeProviderSwitch(decision, {
        outcome: PROVIDER_SWITCH_OUTCOMES.runFinished,
        note: 'A orquestração terminou antes da resposta; nenhum provedor foi trocado.',
      })
      return {
        ok: false,
        code: 'RUN_FINISHED',
        message: 'A orquestração já terminou; nenhum provedor foi trocado.',
      }
    }

    if (decision.expiresAtMs <= getTimeMs(this.now())) {
      await this.settleRefusalSafely(decision, {
        outcome: PROVIDER_SWITCH_OUTCOMES.expired,
        note: 'Sem resposta no prazo; conta como recusa e nenhum provedor foi trocado.',
      })
      return {
        ok: false,
        code: 'DECISION_NOT_PENDING',
        message: 'O prazo desta troca de provedor venceu; nenhum provedor foi trocado.',
      }
    }

    try {
      const result =
        accept === true
          ? await this.acceptProviderSwitch(decision, run)
          : await this.refuseProviderSwitch(decision, {
              outcome: PROVIDER_SWITCH_OUTCOMES.refused,
            })

      return { ok: true, decisionId, ...result }
    } catch (error) {
      const failed = this.failRunFromError(run.runId, error, this.getRunContext(run.runId))
      return { ok: false, code: 'RUN_FAILED', message: failed.message }
    }
  }

  async acceptProviderSwitch(decision, run) {
    // Revalida: até 10 min se passaram, e a disponibilidade pode ter mudado.
    const target =
      decision.kind === 'initial'
        ? this.revalidateInitialSwitch(decision, run)
        : this.revalidateMidTaskSwitch(decision, run)

    if (!target) {
      return this.refuseProviderSwitch(decision, {
        outcome: PROVIDER_SWITCH_OUTCOMES.refused,
        note: 'Aceita, mas a revalidação não achou modelo disponível; nenhum provedor foi trocado.',
      })
    }

    const stillSwitches = requiresProviderSwitchConfirmation(decision.fromCliType, target.cliType)

    if (
      stillSwitches &&
      getProviderFamily(target.cliType) !== getProviderFamily(decision.toCliType)
    ) {
      // O destino mudou de provedor: a resposta dada valia para outro. Nova
      // pergunta, sem executar nada.
      this.closeProviderSwitch(decision, {
        outcome: PROVIDER_SWITCH_OUTCOMES.superseded,
        note: `O destino mudou para ${target.cliType}; a troca precisa de nova confirmação.`,
      })
      const next = this.requestProviderSwitch({
        kind: decision.kind,
        run,
        agentId: decision.agentId,
        fromCliType: decision.fromCliType,
        toCliType: target.cliType,
        toModel: target.model,
        rule: target.rule,
        reason: decision.reason,
        payload: decision.payload,
      })
      return { outcome: PROVIDER_SWITCH_OUTCOMES.superseded, nextDecisionId: next.decisionId }
    }

    this.closeProviderSwitch(
      decision,
      stillSwitches
        ? { outcome: PROVIDER_SWITCH_OUTCOMES.accepted }
        : {
            outcome: PROVIDER_SWITCH_OUTCOMES.superseded,
            note: 'O provedor original voltou a ficar disponível; seguiu sem trocar.',
          },
    )

    if (decision.kind === 'initial') {
      const started = await this.startSpawnedJob({
        run,
        event: decision.payload.event,
        resolvedEvent: target.resolvedEvent,
        resolvedCliType: target.cliType,
        threadId: decision.payload.threadId,
      })
      return { outcome: stillSwitches ? 'accepted' : 'superseded', run: started.run, spawned: started.ok }
    }

    const respawn = await this.executeMidTaskFallback({
      run,
      plan: target.plan,
      ...decision.payload,
    })

    if (!respawn) {
      const finished = await this.finishAgentJob({
        runId: run.runId,
        agentId: decision.agentId,
        error: decision.payload.originalError,
      })
      return { outcome: stillSwitches ? 'accepted' : 'superseded', run: finished.run, spawned: false }
    }

    return { outcome: stillSwitches ? 'accepted' : 'superseded', run: respawn.run, spawned: true }
  }

  revalidateInitialSwitch(decision, run) {
    let target
    try {
      target = this.resolveSpawnTarget(run, decision.payload.event)
    } catch {
      return null
    }

    return {
      cliType: target.resolvedCliType,
      model: target.resolvedModel,
      rule: target.modelChoice?.selectionRule,
      resolvedEvent: target.resolvedEvent,
    }
  }

  revalidateMidTaskSwitch(decision, run) {
    const job = findAgentJob(run, decision.agentId)
    if (!job) {
      return null
    }

    const plan = this.planMidTaskFallback({
      run,
      job,
      continuationEvent: decision.payload.continuationEvent,
    })

    return plan
      ? { cliType: plan.newCliType, model: plan.newModel, rule: plan.selectionRule, plan }
      : null
  }

  /**
   * Recusa (da pessoa, por prazo ou por interrupção): nenhum provedor é
   * trocado. O spawn inicial falha com o motivo; o meio da tarefa segue com o
   * erro original. Com `reinvoke`, o orquestrador recebe o resultado quando o
   * turno fecha.
   */
  async refuseProviderSwitch(decision, { outcome, note, reinvoke = true }) {
    this.closeProviderSwitch(decision, { outcome, note })

    const finished = await this.finishAgentJob({
      runId: decision.runId,
      agentId: decision.agentId,
      error: describeRefusedSwitchError(decision, outcome),
      reinvoke,
    })

    return { outcome, run: finished.run }
  }

  /**
   * Vence as decisões com prazo até `now` como recusa. Chamado pela varredura
   * de `failExpiredRuns`; devolve a promessa das recusas para quem quiser
   * esperar (os testes).
   */
  expirePendingProviderSwitches(now = this.now()) {
    const nowMs = getTimeMs(now)
    const due = [...this.pendingProviderSwitches.values()].filter(
      (decision) => decision.expiresAtMs <= nowMs,
    )

    return Promise.all(
      due.map((decision) => {
        this.pendingProviderSwitches.delete(decision.decisionId)
        return this.settleRefusalSafely(decision, {
          outcome: PROVIDER_SWITCH_OUTCOMES.expired,
          note: 'Sem resposta no prazo; conta como recusa e nenhum provedor foi trocado.',
        })
      }),
    )
  }

  /**
   * `cli:stop` na conversa: as decisões do run daquela thread saem como
   * recusa, sem reinvocar o orquestrador que a pessoa acabou de parar.
   *
   * @returns {string[]} Os ids das decisões canceladas.
   */
  cancelProviderSwitchesForThread(threadId) {
    const runId = this.runContexts.get(threadId)?.runId ?? null
    const cancelled = []

    for (const decision of [...this.pendingProviderSwitches.values()]) {
      if (decision.parentThreadId !== threadId && decision.runId !== runId) {
        continue
      }

      this.pendingProviderSwitches.delete(decision.decisionId)
      cancelled.push(decision.decisionId)
      void this.settleRefusalSafely(decision, {
        outcome: PROVIDER_SWITCH_OUTCOMES.cancelled,
        note: 'Execução interrompida pela pessoa; nenhum provedor foi trocado.',
        reinvoke: false,
      })
    }

    return cancelled
  }

  async settleRefusalSafely(decision, options) {
    try {
      return await this.refuseProviderSwitch(decision, options)
    } catch (error) {
      return this.failRunFromError(decision.runId, error, this.getRunContext(decision.runId))
    }
  }

  /** Fim do run: as perguntas dele deixam de valer, sem mexer em job. */
  dropProviderSwitchesForRun(runId) {
    for (const decision of [...this.pendingProviderSwitches.values()]) {
      if (decision.runId !== runId) {
        continue
      }

      this.pendingProviderSwitches.delete(decision.decisionId)
      this.closeProviderSwitch(decision, {
        outcome: PROVIDER_SWITCH_OUTCOMES.runFinished,
        note: 'A orquestração terminou antes da resposta; nenhum provedor foi trocado.',
      })
    }
  }

  /**
   * Registra a decisão (quando é uma resposta de fato) e avisa chat e
   * terminal. `superseded` não vai ao registro: a pergunta nova que a
   * substitui é que terá a resposta.
   */
  closeProviderSwitch(decision, { outcome, note = null }) {
    const view = toPublicProviderSwitch(decision)
    const decidedAt = new Date(getTimeMs(this.now())).toISOString()

    if (outcome !== PROVIDER_SWITCH_OUTCOMES.superseded) {
      try {
        this.recordSwitchDecision({
          ...view,
          outcome,
          state: outcome === PROVIDER_SWITCH_OUTCOMES.accepted ? 'accepted' : 'refused',
          note,
          decidedAt,
        })
      } catch {
        // O registro é auditoria: uma falha ao gravar não pode travar a
        // decisão da pessoa. Quem injeta o registro loga o erro.
      }
    }

    this.emitTerminalEvent({
      type: 'orchestration_provider_switch_resolved',
      decisionId: view.decisionId,
      runId: view.runId,
      parentThreadId: view.parentThreadId,
      agentId: view.agentId,
      fromCliType: view.fromCliType,
      toCliType: view.toCliType,
      outcome,
      note,
    })
    this.sendChatEvent({
      type: 'provider_switch_resolved',
      decisionId: view.decisionId,
      runId: view.runId,
      agentId: view.agentId,
      outcome,
      message: note,
      sessionId: view.sessionId,
      threadId: view.parentThreadId,
    })
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
    const now = this.now()

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

    // Depois dos runs: um run vencido já levou suas decisões junto. As
    // restantes vencem como recusa, sem timer próprio.
    void this.expirePendingProviderSwitches(now)

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
    // Antes de soltar o contexto: o aviso ao chat usa a janela guardada nele.
    this.dropProviderSwitchesForRun(runId)

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
  const hasFailedJob = jobs.some((job) => job.status !== 'completed')
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

  const lines = [
    agentResults.continueFromOriginal,
    '',
    agentResults.finalInstructionsHeading,
    ...agentResults.finalAnswerRules,
  ]

  if (hasFailedJob) {
    lines.push(
      '',
      agentResults.failureGuidanceHeading,
      ...agentResults.failureGuidanceRules,
    )
  }

  lines.push(
    '',
    agentResults.originalObjectiveHeading,
    run.originalPrompt,
    '',
    agentResults.agentResultsHeading,
    '',
    sections.join('\n\n') || agentResults.noAgentResults,
  )

  return lines.join('\n')
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

function isRunActive(run) {
  return Boolean(run) && run.status !== 'completed' && run.status !== 'failed'
}

// O prazo é o menor entre 10 min e o fim do próprio run: uma decisão não
// sobrevive ao run que a pediu.
function getProviderSwitchDeadlineMs(run, nowMs, timeoutMs) {
  const deadlineMs = nowMs + timeoutMs
  const createdAtMs = Date.parse(run?.createdAt ?? '')

  if (!Number.isFinite(createdAtMs) || !run?.maxRuntimeMinutes) {
    return deadlineMs
  }

  return Math.min(deadlineMs, createdAtMs + run.maxRuntimeMinutes * 60 * 1000)
}

function createSwitchReason(reason) {
  const text = redactSecrets(String(reason ?? ''))
    .replace(/\s+/g, ' ')
    .trim()

  if (!text) {
    return null
  }

  return text.length > PROVIDER_SWITCH_REASON_MAX_CHARS
    ? `${text.slice(0, PROVIDER_SWITCH_REASON_MAX_CHARS - 1)}…`
    : text
}

function toPublicProviderSwitch(decision) {
  return {
    decisionId: decision.decisionId,
    kind: decision.kind,
    runId: decision.runId,
    agentId: decision.agentId,
    parentThreadId: decision.parentThreadId,
    sessionId: decision.sessionId,
    fromCliType: decision.fromCliType,
    toCliType: decision.toCliType,
    toModelId: decision.toModelId,
    toModelName: decision.toModelName,
    rule: decision.rule,
    reason: decision.reason,
    requestedAt: decision.requestedAt,
    expiresAt: decision.expiresAt,
  }
}

function describeRefusedSwitchError(decision, outcome) {
  const route = `${decision.fromCliType} → ${decision.toCliType}`
  const why =
    outcome === PROVIDER_SWITCH_OUTCOMES.expired
      ? `Troca de provedor ${route} sem resposta no prazo`
      : outcome === PROVIDER_SWITCH_OUTCOMES.cancelled
        ? `Execução interrompida pela pessoa antes da troca de provedor ${route}`
        : `Troca de provedor ${route} recusada pela pessoa`

  if (decision.kind === 'initial') {
    return `${why}; o sub-agente não rodou e nenhum provedor foi trocado.`
  }

  // Meio da tarefa: o orquestrador recebe o erro original do sub-agente,
  // com a nota do que aconteceu com a troca.
  const originalError = stringifyAgentError(decision.payload.originalError)
  return outcome === PROVIDER_SWITCH_OUTCOMES.refused
    ? originalError || `${why}.`
    : `${originalError}\n\n(${why}; nenhum provedor foi trocado.)`.trim()
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
  PROVIDER_SWITCH_TIMEOUT_MS,
  areCurrentTurnJobsTerminal,
  createAgentResultsPrompt,
  createOrchestrationRunner,
}
