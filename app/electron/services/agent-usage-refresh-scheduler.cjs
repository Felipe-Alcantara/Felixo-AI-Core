'use strict'

const { mapWithConcurrency } = require('./bounded-concurrency.cjs')
const { REFRESH_MAX_CONCURRENCY } = require('./agent-usage-service.cjs')
const { getRateLimitDetails, parseRetryAfterMs } = require('./agent-usage-backoff.cjs')

const REFRESH_INTERVAL_MS = 30_000
const IDLE_AFTER_SECONDS = 5 * 60
const IDLE_INTERVAL_MS = 5 * 60_000
const BATTERY_INTERVAL_MS = 2 * 60_000
const FAILURE_BASE_MS = 60_000
const RATE_LIMIT_MIN_MS = 5 * 60_000
const MAX_BACKOFF_MS = 15 * 60_000
const AUTH_RETRY_MS = 15 * 60_000
const SCHEDULED_REFRESH_TYPES = new Set(['app-server', 'command'])

/**
 * Agenda as consultas enquanto uma tela de limites estÃ¡ visÃ­vel.
 *
 * O processo principal Ã© o dono do Ãºnico timer. As consultas sÃ£o por conta,
 * limitadas ao mesmo teto do serviÃ§o, e a ordem favorece sessÃµes abertas e
 * mediÃ§Ãµes antigas. A UI continua responsÃ¡vel por pedir uma coleta completa
 * quando a pessoa aperta Atualizar.
 */
function createAgentUsageRefreshScheduler({
  service,
  getActiveSessions = () => [],
  getSystemIdleTime = () => 0,
  isOnBatteryPower = () => false,
  isWindowVisible = () => true,
  onDashboard = () => {},
  onMetrics = () => {},
  now = () => Date.now(),
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  processObject = process,
  intervalMs = REFRESH_INTERVAL_MS,
  idleAfterSeconds = IDLE_AFTER_SECONDS,
  idleIntervalMs = IDLE_INTERVAL_MS,
  batteryIntervalMs = BATTERY_INTERVAL_MS,
  maxConcurrent = REFRESH_MAX_CONCURRENCY,
} = {}) {
  if (!service || typeof service.list !== 'function' || typeof service.refreshAccount !== 'function') {
    throw new Error('O scheduler de uso precisa de um serviço de contas válido.')
  }

  const consumers = new Map()
  const accountBackoff = new Map()
  let timer = null
  let runPromise = null
  let runController = null
  let manualRefreshCount = 0
  let suspended = false
  let windowVisibleOverride = null
  let stopped = false

  function readIdleSeconds() {
    try {
      const value = Number(getSystemIdleTime())
      return Number.isFinite(value) ? Math.max(0, value) : 0
    } catch {
      return 0
    }
  }

  function readOnBattery() {
    try {
      return isOnBatteryPower() === true
    } catch {
      return false
    }
  }

  function getIntervalMs() {
    const idleSeconds = readIdleSeconds()
    const onBattery = readOnBattery()
    let delay = intervalMs

    if (idleSeconds >= idleAfterSeconds) {
      delay = Math.max(delay, idleIntervalMs)
    }
    if (onBattery) {
      delay = Math.max(delay, batteryIntervalMs)
    }

    return delay
  }

  function getScheduleDelayMs() {
    const delay = getIntervalMs()
    // Electron does not expose a user-activity event on every platform. While
    // idle on AC, wake the single timer every base interval to notice activity;
    // account backoff still prevents provider queries until the idle cadence.
    if (readIdleSeconds() >= idleAfterSeconds) {
      return readOnBattery()
        ? Math.max(intervalMs, batteryIntervalMs)
        : Math.min(delay, intervalMs)
    }
    return delay
  }

  function hasVisibleConsumer() {
    if (stopped || suspended || manualRefreshCount > 0) {
      return false
    }
    if (windowVisibleOverride === false) {
      return false
    }

    try {
      if (isWindowVisible() === false) {
        return false
      }
    } catch {
      return false
    }

    return [...consumers.values()].some(
      (state) => state.visible && !state.performanceMode,
    )
  }

  function clearScheduledTimer() {
    if (timer !== null) {
      clearTimeoutFn(timer)
      timer = null
    }
  }

  function schedule(delayMs = getScheduleDelayMs()) {
    if (!hasVisibleConsumer() || timer !== null || runPromise) {
      return
    }

    timer = setTimeoutFn(() => {
      timer = null
      const promise = runTick()
      runPromise = promise
      promise.finally(() => {
        if (runPromise === promise) {
          runPromise = null
        }
        if (hasVisibleConsumer()) {
          schedule()
        }
      }).catch(() => {})
    }, Math.max(0, delayMs))
    timer?.unref?.()
  }

  function pause() {
    clearScheduledTimer()
    if (runController && !runController.signal.aborted) {
      runController.abort()
    }
  }

  function setConsumerState(consumerId, state = {}) {
    const id = typeof consumerId === 'string' ? consumerId.trim() : ''
    if (!id) {
      return
    }

    const next = {
      visible: state.visible === true,
      performanceMode: state.performanceMode === true,
    }
    const previous = consumers.get(id)
    if (previous?.visible === next.visible && previous?.performanceMode === next.performanceMode) {
      return
    }

    consumers.set(id, next)
    if (hasVisibleConsumer()) {
      clearScheduledTimer()
      schedule()
    } else {
      pause()
    }
  }

  function removeConsumer(consumerId) {
    consumers.delete(consumerId)
    if (hasVisibleConsumer()) {
      return
    }
    pause()
  }

  function refreshPowerPolicy() {
    if (!hasVisibleConsumer() || runPromise) {
      return
    }
    clearScheduledTimer()
    schedule()
  }

  function setWindowVisible(value) {
    windowVisibleOverride = value === true
    if (windowVisibleOverride) {
      refreshPowerPolicy()
    } else {
      pause()
    }
  }

  function setSuspended(value) {
    suspended = value === true
    if (suspended) {
      pause()
    } else {
      refreshPowerPolicy()
    }
  }

  /** Interrompe o trabalho agendado antes de uma ação manual e aguarda a fila. */
  async function manualRefreshStarted() {
    manualRefreshCount += 1
    pause()
    if (runPromise) {
      await runPromise.catch(() => {})
    }
    return now()
  }

  function manualRefreshFinished(dashboard, { startedAt = null, accountId = null } = {}) {
    const startedMs = Number(startedAt)
    const minimumCollectedAt = Number.isFinite(startedMs) ? startedMs - 2_000 : null
    const target = accountId
      ? (dashboard?.accounts ?? []).find((account) => account.id === accountId)
      : null

    for (const account of dashboard?.accounts ?? []) {
      if (accountId) {
        if (target?.ownLogin) {
          if (account.id !== target.id) continue
        } else if (target && (account.ownLogin || account.providerId !== target.providerId)) {
          continue
        }
      } else if (minimumCollectedAt !== null) {
        const collectedAt = Date.parse(account.latestSample?.collectedAt ?? '')
        if (!Number.isFinite(collectedAt) || collectedAt < minimumCollectedAt) continue
      }

      updateBackoff(account, now(), accountBackoff, getIntervalMs())
    }

    manualRefreshCount = Math.max(0, manualRefreshCount - 1)
    if (hasVisibleConsumer()) {
      schedule()
    }
  }

  async function runTick() {
    if (!hasVisibleConsumer() || runPromise) {
      return
    }

    const controller = new AbortController()
    runController = controller
    const startedAt = now()
    const cpuStart = readCpuUsage(processObject)
    const rssStart = readRss(processObject)
    service.resetExternalOperationMetrics?.()
    const idleSeconds = readIdleSeconds()
    const onBattery = readOnBattery()
    const roundMaxConcurrent =
      idleSeconds >= idleAfterSeconds || onBattery
        ? Math.max(1, Math.floor(maxConcurrent / 2))
        : maxConcurrent
    const metrics = {
      level: 'info',
      scope: 'agent-usage:scheduler',
      message: 'Rodada automática de limites concluída.',
      details: {
        attempted: 0,
        succeeded: 0,
        failed: 0,
        skippedBackoff: 0,
        skippedUnsupported: 0,
        skippedBySourcePolicy: 0,
        activeSessions: 0,
        maxConcurrent: 0,
        maxExternalOperations: 0,
        processesStarted: 0,
        providerRequestsStarted: 0,
        durationMs: 0,
        cpuUserMicros: 0,
        cpuSystemMicros: 0,
        rssStartBytes: rssStart,
        rssEndBytes: rssStart,
        idleSeconds,
        onBattery,
      },
    }

    try {
      const dashboard = await service.list()
      if (!hasVisibleConsumer() || controller.signal.aborted) {
        return
      }

      let sessions = []
      try {
        sessions = getActiveSessions() ?? []
      } catch {
        sessions = []
      }
      metrics.details.activeSessions = sessions.length

      const providerById = new Map(
        (dashboard.providers ?? []).map((provider) => [provider.id, provider]),
      )
      const candidates = buildScheduledCandidates({
        accounts: dashboard.accounts ?? [],
        providerById,
        sessions,
        backoff: accountBackoff,
        now: now(),
        intervalMs: getIntervalMs(),
      })
      metrics.details.skippedUnsupported = countUnsupportedAccounts(
        dashboard.accounts ?? [],
        providerById,
      )
      metrics.details.skippedBySourcePolicy = countSkippedBySourcePolicy(
        dashboard.accounts ?? [],
        providerById,
      )
      metrics.details.skippedBackoff = candidates.skippedBackoff

      let currentConcurrency = 0
      await mapWithConcurrency(candidates.accounts, roundMaxConcurrent, async (candidate) => {
        if (!hasVisibleConsumer() || controller.signal.aborted) {
          return
        }

        currentConcurrency += 1
        metrics.details.maxConcurrent = Math.max(
          metrics.details.maxConcurrent,
          currentConcurrency,
        )
        metrics.details.attempted += 1
        let result
        try {
          result = await service.refreshAccount(candidate.account.id, {
            signal: controller.signal,
            scheduled: true,
          })
        } catch {
          if (!controller.signal.aborted) {
            metrics.details.failed += 1
            for (const account of candidate.dueAccounts) {
              recordFailure(account, now(), accountBackoff)
            }
          }
          return
        } finally {
          currentConcurrency -= 1
        }

        if (controller.signal.aborted || !hasVisibleConsumer()) {
          return
        }

        const refreshed = new Map(
          (result.accounts ?? []).map((account) => [account.id, account]),
        )
        const observedAccountIds = new Set()
        let succeeded = false
        for (const groupAccount of candidate.groupAccounts) {
          const account = refreshed.get(groupAccount.id)
          if (!account) continue
          observedAccountIds.add(account.id)
          const ok = updateBackoff(account, now(), accountBackoff, getIntervalMs())
          succeeded ||= ok
        }
        for (const account of candidate.dueAccounts) {
          if (!observedAccountIds.has(account.id)) {
            recordFailure(account, now(), accountBackoff)
          }
        }
        if (succeeded) {
          metrics.details.succeeded += 1
        } else {
          metrics.details.failed += 1
        }
      })

      if (!controller.signal.aborted && hasVisibleConsumer()) {
        const updated = await service.list()
        if (!controller.signal.aborted && hasVisibleConsumer()) {
          onDashboard(updated)
        }
      }
    } catch {
      metrics.level = 'warn'
      metrics.message = 'A rodada automática de limites falhou.'
      metrics.details.failed += 1
    } finally {
      metrics.details.durationMs = Math.max(0, now() - startedAt)
      metrics.details.rssEndBytes = readRss(processObject)
      const cpuDelta = readCpuDelta(processObject, cpuStart)
      metrics.details.cpuUserMicros = cpuDelta.user
      metrics.details.cpuSystemMicros = cpuDelta.system
      const externalOperations = readExternalOperationMetrics(service)
      metrics.details.maxExternalOperations = externalOperations.peak
      metrics.details.processesStarted = externalOperations.processesStarted
      metrics.details.providerRequestsStarted = externalOperations.providerRequestsStarted
      if (runController === controller) {
        runController = null
      }
      if (
        !controller.signal.aborted &&
        (metrics.details.attempted > 0 || metrics.details.failed > 0)
      ) {
        emitMetrics(onMetrics, metrics)
      }
    }
  }

  function stop() {
    stopped = true
    consumers.clear()
    pause()
  }

  return {
    setConsumerState,
    removeConsumer,
    refreshPowerPolicy,
    setWindowVisible,
    setSuspended,
    manualRefreshStarted,
    manualRefreshFinished,
    stop,
  }
}

function buildScheduledCandidates({
  accounts,
  providerById,
  sessions,
  backoff,
  now,
  intervalMs,
}) {
  const grouped = new Map()
  let skippedBackoff = 0

  for (const account of accounts) {
    const provider = providerById.get(account.providerId)
    const scheduledRefresh = provider?.usageSource?.scheduledRefresh
    if (
      provider?.usageSource?.capability !== 'available' ||
      !SCHEDULED_REFRESH_TYPES.has(scheduledRefresh)
    ) {
      continue
    }

    const key = account.ownLogin ? account.id : `system:${account.providerId}`
    const current = grouped.get(key)
    const active = sessions.some((session) =>
      sessionMatchesAccount(session, account),
    )
    const sample = account.latestSample
    const measuredAt = Date.parse(
      sample?.metadata?.measuredAt ?? sample?.collectedAt ?? '',
    )
    const ageMs = Number.isFinite(measuredAt)
      ? Math.max(0, now - measuredAt)
      : Number.POSITIVE_INFINITY
    const stale = sample?.status === 'stale' || ageMs >= intervalMs
    const member = {
      account,
      scheduledRefresh,
      active,
      stale,
      ageMs,
    }

    if (!current) {
      grouped.set(key, { members: [member] })
    } else {
      current.members.push(member)
    }
  }

  const candidates = []
  for (const group of grouped.values()) {
    const dueMembers = group.members.filter(
      ({ account }) => getNextAttemptAt(account, backoff, intervalMs) <= now,
    )
    if (dueMembers.length === 0) {
      skippedBackoff += 1
      continue
    }

    dueMembers.sort(compareScheduledCandidates)
    const selected = dueMembers[0]
    candidates.push({
      account: selected.account,
      dueAccounts: dueMembers.map((member) => member.account),
      groupAccounts: group.members.map((member) => member.account),
      scheduledRefresh: selected.scheduledRefresh,
      active: group.members.some((member) => member.active),
      stale: group.members.some((member) => member.stale),
      ageMs: Math.max(...group.members.map((member) => member.ageMs)),
    })
  }

  candidates.sort(compareScheduledCandidates)

  return { accounts: candidates, skippedBackoff }
}

function compareScheduledCandidates(left, right) {
  if (left.active !== right.active) return left.active ? -1 : 1
  if (left.stale !== right.stale) return left.stale ? -1 : 1
  if (left.ageMs !== right.ageMs) return right.ageMs - left.ageMs
  return (
    left.account.providerId.localeCompare(right.account.providerId) ||
    left.account.id.localeCompare(right.account.id)
  )
}

function countUnsupportedAccounts(accounts, providerById) {
  return accounts.filter(
    (account) =>
      providerById.get(account.providerId)?.usageSource?.capability !== 'available',
  ).length
}

function countSkippedBySourcePolicy(accounts, providerById) {
  return accounts.filter((account) => {
    const source = providerById.get(account.providerId)?.usageSource
    return (
      source?.capability === 'available' &&
      !SCHEDULED_REFRESH_TYPES.has(source.scheduledRefresh)
    )
  }).length
}

function sessionMatchesAccount(session, account) {
  if (session?.providerId !== account.providerId) {
    return false
  }
  if (typeof session.accountId === 'string' && session.accountId) {
    return session.accountId === account.id
  }
  return !account.ownLogin
}

function getNextAttemptAt(account, backoff, intervalMs) {
  const state = backoff.get(account.id)
  if (state) {
    if (state.failures === 0 && Number.isFinite(state.completedAt)) {
      return state.completedAt + intervalMs
    }
    return state.nextAttemptAt
  }

  const sample = account.latestSample
  const collectedAt = Date.parse(sample?.collectedAt ?? '')
  if (!Number.isFinite(collectedAt)) {
    return 0
  }

  if (sample.status === 'current') {
    const measuredAt = Date.parse(sample.metadata?.measuredAt ?? '')
    return (Number.isFinite(measuredAt) ? measuredAt : collectedAt) + intervalMs
  }

  return collectedAt + getBackoffDelay(account, 1)
}

function updateBackoff(account, completedAt, backoff, intervalMs = REFRESH_INTERVAL_MS) {
  const sample = account.latestSample
  const succeeded = sample?.status === 'current'
  if (succeeded) {
    backoff.set(account.id, {
      failures: 0,
      completedAt,
      nextAttemptAt: completedAt + intervalMs,
    })
    return true
  }

  recordFailure(account, completedAt, backoff)
  return false
}

function recordFailure(account, completedAt, backoff) {
  const previous = backoff.get(account.id)
  const failures = (previous?.failures ?? 0) + 1
  backoff.set(account.id, {
    failures,
    nextAttemptAt: completedAt + getBackoffDelay(account, failures),
  })
}

function getBackoffDelay(account, failures, now = Date.now()) {
  const sample = account.latestSample
  const failureReason = sample?.metadata?.failureReason ?? account.availability?.state
  const message = sample?.errorMessage ?? ''
  const rateLimit = getRateLimitDetails(message, now)
  const retryAfterMs = Number.isSafeInteger(sample?.metadata?.retryAfterMs)
    ? sample.metadata.retryAfterMs
    : rateLimit.retryAfterMs

  if (
    sample?.metadata?.rateLimited === true ||
    rateLimit.rateLimited ||
    retryAfterMs !== undefined
  ) {
    // Retry-After é o limite inferior do provedor e pode exceder o teto
    // exponencial genérico. Sem esse sinal, aguarda pelo menos cinco minutos.
    return Math.max(RATE_LIMIT_MIN_MS, retryAfterMs ?? 0)
  }
  if (failureReason === 'auth-required') {
    return AUTH_RETRY_MS
  }
  if (sample?.status === 'unavailable') {
    return Math.min(MAX_BACKOFF_MS, Math.max(5 * 60_000, FAILURE_BASE_MS * 2 ** (failures - 1)))
  }

  return Math.min(MAX_BACKOFF_MS, FAILURE_BASE_MS * 2 ** (failures - 1))
}

function readCpuUsage(processObject) {
  try {
    return processObject.cpuUsage()
  } catch {
    return null
  }
}

function readCpuDelta(processObject, previous) {
  if (!previous) return { user: 0, system: 0 }
  try {
    const delta = processObject.cpuUsage(previous)
    return {
      user: Number.isFinite(delta.user) ? delta.user : 0,
      system: Number.isFinite(delta.system) ? delta.system : 0,
    }
  } catch {
    return { user: 0, system: 0 }
  }
}

function readRss(processObject) {
  try {
    const rss = processObject.memoryUsage().rss
    return Number.isFinite(rss) ? rss : 0
  } catch {
    return 0
  }
}

function readExternalOperationMetrics(service) {
  try {
    const metrics = service.getExternalOperationMetrics?.()
    return {
      peak: Number.isFinite(metrics?.peak) ? metrics.peak : 0,
      processesStarted: Number.isFinite(metrics?.processesStarted)
        ? metrics.processesStarted
        : 0,
      providerRequestsStarted: Number.isFinite(metrics?.providerRequestsStarted)
        ? metrics.providerRequestsStarted
        : 0,
    }
  } catch {
    return { peak: 0, processesStarted: 0, providerRequestsStarted: 0 }
  }
}

function emitMetrics(onMetrics, event) {
  try {
    onMetrics(event)
  } catch {
    // A observaÃ§Ã£o nunca pode interromper a coleta.
  }
}

module.exports = {
  AUTH_RETRY_MS,
  BATTERY_INTERVAL_MS,
  FAILURE_BASE_MS,
  IDLE_AFTER_SECONDS,
  IDLE_INTERVAL_MS,
  MAX_BACKOFF_MS,
  RATE_LIMIT_MIN_MS,
  REFRESH_INTERVAL_MS,
  buildScheduledCandidates,
  createAgentUsageRefreshScheduler,
  getBackoffDelay,
  parseRetryAfterMs,
}
