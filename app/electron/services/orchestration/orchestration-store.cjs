const { randomUUID } = require('node:crypto')

const DEFAULT_LIMITS = {
  maxTurns: 5,
  maxAgentsPerTurn: 3,
  maxTotalAgents: 10,
  maxRuntimeMinutes: 20,
}

const VALID_RUN_STATUSES = new Set([
  'running_orchestrator',
  'waiting_agents',
  'completed',
  'failed',
])

const VALID_AGENT_JOB_STATUSES = new Set([
  'pending',
  'running',
  'completed',
  'error',
])

const VALID_CLI_TYPES = new Set([
  'claude',
  'codex',
  'codex-app-server',
  'gemini',
  'gemini-acp',
])

class OrchestrationStoreError extends Error {
  constructor(message, code) {
    super(message)
    this.name = 'OrchestrationStoreError'
    this.code = code
  }
}

class OrchestrationLimitError extends OrchestrationStoreError {
  constructor(message, code) {
    super(message, code)
    this.name = 'OrchestrationLimitError'
  }
}

class OrchestrationStore {
  constructor(options = {}) {
    this.runs = new Map()
    this.now = options.now ?? (() => new Date())
    this.idGenerator = options.idGenerator ?? (() => `run-${randomUUID()}`)
    this.defaultLimits = normalizeLimits(options.limits)
  }

  create(params = {}) {
    const now = this.createTimestamp()
    const limits = normalizeLimits({
      ...this.defaultLimits,
      ...(params.limits ?? {}),
    })
    const run = {
      runId: getNonEmptyString(params.runId) ?? this.idGenerator(),
      status: 'running_orchestrator',
      parentThreadId: requireNonEmptyString(
        params.parentThreadId,
        'parentThreadId',
      ),
      orchestratorCliType: requireValidCliType(params.orchestratorCliType),
      orchestratorModel: params.orchestratorModel ?? null,
      originalPrompt: requireString(params.originalPrompt, 'originalPrompt'),
      currentTurn: 1,
      maxTurns: limits.maxTurns,
      maxAgentsPerTurn: limits.maxAgentsPerTurn,
      maxTotalAgents: limits.maxTotalAgents,
      maxRuntimeMinutes: limits.maxRuntimeMinutes,
      agentJobs: [],
      turns: [],
      finalAnswer: null,
      error: null,
      createdAt: now,
      updatedAt: now,
    }

    if (this.runs.has(run.runId)) {
      throw new OrchestrationStoreError(
        `Run ja existe: ${run.runId}`,
        'RUN_EXISTS',
      )
    }

    this.runs.set(run.runId, run)
    return cloneRun(run)
  }

  get(runId) {
    const run = this.runs.get(runId)
    return run ? cloneRun(run) : null
  }

  update(runId, patchOrUpdater) {
    const run = this.requireRun(runId)
    const draft = cloneRun(run)
    const next =
      typeof patchOrUpdater === 'function'
        ? patchOrUpdater(draft)
        : {
            ...draft,
            ...(patchOrUpdater ?? {}),
          }

    if (!next || typeof next !== 'object') {
      throw new OrchestrationStoreError(
        'Update precisa retornar um run.',
        'INVALID_UPDATE',
      )
    }

    const normalizedRun = normalizeRun({
      ...draft,
      ...next,
      runId: run.runId,
      createdAt: run.createdAt,
      updatedAt: this.createTimestamp(),
    })

    this.runs.set(runId, normalizedRun)
    return cloneRun(normalizedRun)
  }

  list() {
    return [...this.runs.values()].map(cloneRun)
  }

  createAgentJob(runId, params = {}) {
    const run = this.requireRun(runId)
    assertRunMutable(run)
    assertAgentLimits(run)

    const agentId = requireNonEmptyString(params.agentId, 'agentId')

    if (findAgentJob(run, agentId)) {
      throw new OrchestrationStoreError(
        `Agent job ja existe: ${agentId}`,
        'AGENT_JOB_EXISTS',
      )
    }

    const now = this.createTimestamp()
    const job = {
      agentId,
      cliType: requireValidCliType(params.cliType),
      prompt: requireString(params.prompt, 'prompt'),
      status: 'pending',
      threadId: getNonEmptyString(params.threadId),
      result: null,
      error: null,
      turn: run.currentTurn,
      startedAt: null,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    }

    run.agentJobs.push(job)
    touchRun(run, now)
    return cloneRun(run)
  }

  startAgentJob(runId, agentId, params = {}) {
    return this.updateAgentJob(runId, agentId, (job, now) => {
      if (job.status === 'completed' || job.status === 'error') {
        throw new OrchestrationStoreError(
          `Agent job ja finalizado: ${agentId}`,
          'AGENT_JOB_FINISHED',
        )
      }

      job.status = 'running'
      job.threadId = getNonEmptyString(params.threadId) ?? job.threadId
      job.startedAt = job.startedAt ?? now
      job.updatedAt = now
    })
  }

  completeAgentJob(runId, agentId, params = {}) {
    return this.updateAgentJob(runId, agentId, (job, now) => {
      job.status = 'completed'
      job.result = requireString(params.result ?? '', 'result')
      job.error = null
      job.completedAt = now
      job.updatedAt = now
    })
  }

  failAgentJob(runId, agentId, params = {}) {
    return this.updateAgentJob(runId, agentId, (job, now) => {
      job.status = 'error'
      job.result = null
      job.error = requireString(params.error ?? '', 'error')
      job.completedAt = now
      job.updatedAt = now
    })
  }

  markWaitingForAgents(runId, agentIds = []) {
    const run = this.requireRun(runId)
    assertRunMutable(run)

    if (!Array.isArray(agentIds) || !agentIds.every(isNonEmptyString)) {
      throw new OrchestrationStoreError(
        'agentIds precisa ser uma lista de strings.',
        'INVALID_AGENT_IDS',
      )
    }

    const missingAgentIds = agentIds.filter((agentId) => !findAgentJob(run, agentId))

    if (missingAgentIds.length > 0) {
      throw new OrchestrationStoreError(
        `Agent jobs nao encontrados: ${missingAgentIds.join(', ')}`,
        'AGENT_JOB_NOT_FOUND',
      )
    }

    const now = this.createTimestamp()
    run.status = 'waiting_agents'
    upsertTurn(run, {
      turn: run.currentTurn,
      agentIds,
      orchestratorResponse: 'awaiting_agents',
    })
    touchRun(run, now)
    return cloneRun(run)
  }

  advanceTurn(runId) {
    const run = this.requireRun(runId)
    assertRunMutable(run)

    if (run.currentTurn >= run.maxTurns) {
      throw new OrchestrationLimitError(
        'Limite de turnos de orquestracao atingido.',
        'MAX_TURNS_REACHED',
      )
    }

    const now = this.createTimestamp()
    run.currentTurn += 1
    run.status = 'running_orchestrator'
    touchRun(run, now)
    return cloneRun(run)
  }

  completeRun(runId, finalAnswer = '') {
    const run = this.requireRun(runId)
    const now = this.createTimestamp()

    run.status = 'completed'
    run.finalAnswer = requireString(finalAnswer, 'finalAnswer')
    run.error = null
    touchRun(run, now)
    return cloneRun(run)
  }

  failRun(runId, error = '') {
    const run = this.requireRun(runId)
    const now = this.createTimestamp()

    run.status = 'failed'
    run.error = requireString(error, 'error')
    touchRun(run, now)
    return cloneRun(run)
  }

  updateAgentJob(runId, agentId, updater) {
    const run = this.requireRun(runId)
    assertRunMutable(run)
    const job = findAgentJob(run, agentId)

    if (!job) {
      throw new OrchestrationStoreError(
        `Agent job nao encontrado: ${agentId}`,
        'AGENT_JOB_NOT_FOUND',
      )
    }

    const now = this.createTimestamp()
    updater(job, now)
    touchRun(run, now)
    return cloneRun(run)
  }

  requireRun(runId) {
    const run = this.runs.get(runId)

    if (!run) {
      throw new OrchestrationStoreError(
        `Run nao encontrado: ${runId}`,
        'RUN_NOT_FOUND',
      )
    }

    return run
  }

  createTimestamp() {
    const value = this.now()
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
  }
}

function createOrchestrationStore(options) {
  return new OrchestrationStore(options)
}

function normalizeRun(run) {
  if (!VALID_RUN_STATUSES.has(run.status)) {
    throw new OrchestrationStoreError(
      `Status de run invalido: ${run.status}`,
      'INVALID_RUN_STATUS',
    )
  }

  if (!Number.isInteger(run.currentTurn) || run.currentTurn < 1) {
    throw new OrchestrationStoreError(
      'currentTurn precisa ser inteiro positivo.',
      'INVALID_CURRENT_TURN',
    )
  }

  const limits = normalizeLimits({
    maxTurns: run.maxTurns,
    maxAgentsPerTurn: run.maxAgentsPerTurn,
    maxTotalAgents: run.maxTotalAgents,
    maxRuntimeMinutes: run.maxRuntimeMinutes,
  })

  return {
    ...run,
    maxTurns: limits.maxTurns,
    maxAgentsPerTurn: limits.maxAgentsPerTurn,
    maxTotalAgents: limits.maxTotalAgents,
    maxRuntimeMinutes: limits.maxRuntimeMinutes,
    agentJobs: normalizeAgentJobs(run.agentJobs ?? []),
    turns: Array.isArray(run.turns) ? run.turns.map(clonePlainObject) : [],
  }
}

function normalizeAgentJobs(agentJobs) {
  if (!Array.isArray(agentJobs)) {
    throw new OrchestrationStoreError(
      'agentJobs precisa ser uma lista.',
      'INVALID_AGENT_JOBS',
    )
  }

  return agentJobs.map((job) => {
    if (!VALID_AGENT_JOB_STATUSES.has(job.status)) {
      throw new OrchestrationStoreError(
        `Status de agent job invalido: ${job.status}`,
        'INVALID_AGENT_JOB_STATUS',
      )
    }

    return clonePlainObject(job)
  })
}

function normalizeLimits(limits = {}) {
  return {
    maxTurns: normalizePositiveInteger(limits.maxTurns, DEFAULT_LIMITS.maxTurns),
    maxAgentsPerTurn: normalizePositiveInteger(
      limits.maxAgentsPerTurn,
      DEFAULT_LIMITS.maxAgentsPerTurn,
    ),
    maxTotalAgents: normalizePositiveInteger(
      limits.maxTotalAgents,
      DEFAULT_LIMITS.maxTotalAgents,
    ),
    maxRuntimeMinutes: normalizePositiveInteger(
      limits.maxRuntimeMinutes,
      DEFAULT_LIMITS.maxRuntimeMinutes,
    ),
  }
}

function normalizePositiveInteger(value, fallback) {
  if (value === undefined || value === null) {
    return fallback
  }

  if (!Number.isInteger(value) || value < 1) {
    throw new OrchestrationStoreError(
      `Limite invalido: ${value}`,
      'INVALID_LIMIT',
    )
  }

  return value
}

function assertAgentLimits(run) {
  if (run.agentJobs.length >= run.maxTotalAgents) {
    throw new OrchestrationLimitError(
      'Limite total de agentes atingido.',
      'MAX_TOTAL_AGENTS_REACHED',
    )
  }

  const currentTurnAgents = run.agentJobs.filter(
    (job) => job.turn === run.currentTurn,
  )

  if (currentTurnAgents.length >= run.maxAgentsPerTurn) {
    throw new OrchestrationLimitError(
      'Limite de agentes por turno atingido.',
      'MAX_AGENTS_PER_TURN_REACHED',
    )
  }
}

function assertRunMutable(run) {
  if (run.status === 'completed' || run.status === 'failed') {
    throw new OrchestrationStoreError(
      `Run ja finalizado: ${run.runId}`,
      'RUN_FINISHED',
    )
  }
}

function upsertTurn(run, nextTurn) {
  const index = run.turns.findIndex((turn) => turn.turn === nextTurn.turn)

  if (index === -1) {
    run.turns.push(clonePlainObject(nextTurn))
    return
  }

  run.turns[index] = {
    ...run.turns[index],
    ...clonePlainObject(nextTurn),
  }
}

function findAgentJob(run, agentId) {
  return run.agentJobs.find((job) => job.agentId === agentId) ?? null
}

function touchRun(run, timestamp) {
  run.updatedAt = timestamp
}

function requireValidCliType(value) {
  if (!VALID_CLI_TYPES.has(value)) {
    throw new OrchestrationStoreError(
      `cliType invalido: ${value}`,
      'INVALID_CLI_TYPE',
    )
  }

  return value
}

function requireNonEmptyString(value, fieldName) {
  const stringValue = getNonEmptyString(value)

  if (!stringValue) {
    throw new OrchestrationStoreError(
      `${fieldName} precisa ser uma string nao vazia.`,
      'INVALID_STRING',
    )
  }

  return stringValue
}

function requireString(value, fieldName) {
  if (typeof value !== 'string') {
    throw new OrchestrationStoreError(
      `${fieldName} precisa ser uma string.`,
      'INVALID_STRING',
    )
  }

  return value
}

function getNonEmptyString(value) {
  return isNonEmptyString(value) ? value : null
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function cloneRun(run) {
  return clonePlainObject(run)
}

function clonePlainObject(value) {
  return structuredClone(value)
}

module.exports = {
  DEFAULT_LIMITS,
  OrchestrationLimitError,
  OrchestrationStore,
  OrchestrationStoreError,
  createOrchestrationStore,
}
