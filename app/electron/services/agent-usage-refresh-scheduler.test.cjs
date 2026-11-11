'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  BATTERY_INTERVAL_MS,
  FAILURE_BASE_MS,
  IDLE_INTERVAL_MS,
  MAX_BACKOFF_MS,
  PERFORMANCE_MODE_INTERVAL_MS,
  RATE_LIMIT_MIN_MS,
  REFRESH_INTERVAL_MS,
  buildScheduledCandidates,
  createAgentUsageRefreshScheduler,
  getBackoffDelay,
  parseRetryAfterMs,
} = require('./agent-usage-refresh-scheduler.cjs')

function fakeClock() {
  let current = 1_000_000
  let nextId = 1
  const timers = new Map()

  return {
    timers,
    now: () => current,
    setTimeout(callback, delay) {
      const id = nextId++
      timers.set(id, { callback, at: current + delay, unref() {} })
      return id
    },
    clearTimeout(id) {
      timers.delete(id)
    },
    advance(ms) {
      current += ms
      const due = [...timers.entries()]
        .filter(([, timer]) => timer.at <= current)
        .sort((left, right) => left[1].at - right[1].at)
      for (const [id, timer] of due) {
        if (!timers.has(id)) continue
        timers.delete(id)
        timer.callback()
      }
    },
  }
}

async function flushAsyncWork() {
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
}

function dashboard({ accounts = [], capability = 'available' } = {}) {
  return {
    ok: true,
    providers: [
      {
        id: 'codex',
        usageSource: {
          capability,
          scheduledRefresh: capability === 'available' ? 'app-server' : 'interactive',
        },
      },
    ],
    accounts,
  }
}

function account({
  id,
  providerId = 'codex',
  ownLogin = false,
  status = null,
  measuredAt = null,
  failureReason,
  errorMessage,
} = {}) {
  return {
    id,
    providerId,
    ownLogin,
    availability: { state: failureReason ?? 'available' },
    latestSample: status
      ? {
          status,
          collectedAt: measuredAt ? new Date(measuredAt).toISOString() : new Date(0).toISOString(),
          metadata: {
            ...(measuredAt ? { measuredAt: new Date(measuredAt).toISOString() } : {}),
            ...(failureReason ? { failureReason } : {}),
          },
          ...(errorMessage ? { errorMessage } : {}),
        }
      : null,
  }
}

test('scheduler agenda só uma consulta quando uma tela visível está ativa', () => {
  const clock = fakeClock()
  const service = { list: async () => dashboard(), refreshAccount: async () => dashboard() }
  const scheduler = createAgentUsageRefreshScheduler({
    service,
    now: clock.now,
    setTimeoutFn: clock.setTimeout,
    clearTimeoutFn: clock.clearTimeout,
  })

  scheduler.setConsumerState('painel', { visible: false, performanceMode: false })
  assert.equal(clock.timers.size, 0)

  scheduler.setConsumerState('painel', { visible: true, performanceMode: true })
  assert.equal(clock.timers.size, 1)
  assert.equal(
    [...clock.timers.values()][0].at,
    clock.now() + PERFORMANCE_MODE_INTERVAL_MS,
  )

  scheduler.setConsumerState('painel', { visible: true, performanceMode: false })
  assert.equal(clock.timers.size, 1)
  assert.equal([...clock.timers.values()][0].at, clock.now() + REFRESH_INTERVAL_MS)

  scheduler.setConsumerState('painel', { visible: false, performanceMode: false })
  assert.equal(clock.timers.size, 0)
  scheduler.stop()
})

test('Modo Performance mantém cadência normal quando outro consumidor está no modo normal', () => {
  const clock = fakeClock()
  const scheduler = createAgentUsageRefreshScheduler({
    service: { list: async () => dashboard(), refreshAccount: async () => dashboard() },
    now: clock.now,
    setTimeoutFn: clock.setTimeout,
    clearTimeoutFn: clock.clearTimeout,
  })

  scheduler.setConsumerState('painel-performance', { visible: true, performanceMode: true })
  scheduler.setConsumerState('modal-normal', { visible: true, performanceMode: false })
  assert.equal([...clock.timers.values()][0].at, clock.now() + REFRESH_INTERVAL_MS)
  scheduler.stop()
})

test('trocar para Modo Performance durante refresh ativo preserva a consulta e espaça a próxima', async () => {
  const clock = fakeClock()
  const onlyAccount = account({
    id: 'codex-profile',
    ownLogin: true,
    status: 'current',
    measuredAt: clock.now(),
  })
  let finishRefresh
  let refreshSignal
  let refreshCalls = 0
  const scheduler = createAgentUsageRefreshScheduler({
    service: {
      list: async () => dashboard({ accounts: [onlyAccount] }),
      refreshAccount: (_id, { signal }) => new Promise((resolve) => {
        refreshCalls += 1
        refreshSignal = signal
        finishRefresh = resolve
      }),
    },
    now: clock.now,
    setTimeoutFn: clock.setTimeout,
    clearTimeoutFn: clock.clearTimeout,
  })

  scheduler.setConsumerState('painel', { visible: true, performanceMode: false })
  clock.advance(REFRESH_INTERVAL_MS)
  await flushAsyncWork()
  assert.equal(refreshCalls, 1)
  assert.equal(refreshSignal.aborted, false)

  scheduler.setConsumerState('painel', { visible: true, performanceMode: true })
  assert.equal(refreshSignal.aborted, false)
  finishRefresh(dashboard({ accounts: [onlyAccount] }))
  await flushAsyncWork()

  assert.equal(refreshCalls, 1)
  assert.equal([...clock.timers.values()][0].at, clock.now() + PERFORMANCE_MODE_INTERVAL_MS)
  scheduler.stop()
})

test('scheduler verifica a atividade após 30 s em ociosidade e reduz para 2 min na bateria', () => {
  for (const scenario of [
    { idleSeconds: 5 * 60, onBattery: false, expected: IDLE_INTERVAL_MS },
    { idleSeconds: 0, onBattery: true, expected: BATTERY_INTERVAL_MS },
    { idleSeconds: 5 * 60, onBattery: true, expected: BATTERY_INTERVAL_MS },
  ]) {
    const clock = fakeClock()
    const scheduler = createAgentUsageRefreshScheduler({
      service: { list: async () => dashboard(), refreshAccount: async () => dashboard() },
      getSystemIdleTime: () => scenario.idleSeconds,
      isOnBatteryPower: () => scenario.onBattery,
      now: clock.now,
      setTimeoutFn: clock.setTimeout,
      clearTimeoutFn: clock.clearTimeout,
    })
    scheduler.setConsumerState('painel', { visible: true, performanceMode: false })
    const expectedTimerDelay = scenario.onBattery
      ? scenario.expected
      : REFRESH_INTERVAL_MS
    assert.equal([...clock.timers.values()][0].at, clock.now() + expectedTimerDelay)
    scheduler.stop()
  }
})

test('atividade retomada após ociosidade libera a consulta na próxima janela de 30 s', async () => {
  const clock = fakeClock()
  let idleSeconds = 5 * 60
  const before = account({
    id: 'codex-system',
    status: 'current',
    measuredAt: clock.now(),
  })
  let current = dashboard({ accounts: [before] })
  const calls = []
  const service = {
    list: async () => current,
    refreshAccount: async (accountId) => {
      calls.push(accountId)
      const collectedAt = new Date(clock.now()).toISOString()
      const refreshed = {
        ...before,
        latestSample: {
          status: 'current',
          collectedAt,
          metadata: { measuredAt: collectedAt },
        },
      }
      current = dashboard({ accounts: [refreshed] })
      return current
    },
  }
  const scheduler = createAgentUsageRefreshScheduler({
    service,
    getSystemIdleTime: () => idleSeconds,
    now: clock.now,
    setTimeoutFn: clock.setTimeout,
    clearTimeoutFn: clock.clearTimeout,
  })

  scheduler.setConsumerState('painel', { visible: true, performanceMode: false })
  clock.advance(REFRESH_INTERVAL_MS)
  await flushAsyncWork()
  assert.deepEqual(calls, [], 'em ociosidade a consulta continua adiada')

  idleSeconds = 0
  scheduler.refreshPowerPolicy()
  clock.advance(REFRESH_INTERVAL_MS)
  await flushAsyncWork()
  assert.deepEqual(calls, ['codex-system'])
  scheduler.stop()
})

test('seleção prioriza conta ativa e medição antiga, agrupa o login do sistema e ignora fonte interativa', () => {
  const now = 2_000_000
  const accounts = [
    account({ id: 'codex-system-a', status: 'current', measuredAt: now - 90_000 }),
    account({ id: 'codex-system-b', status: 'current', measuredAt: now - 120_000 }),
    account({ id: 'codex-profile', ownLogin: true, status: 'current', measuredAt: now - 60_000 }),
    account({ id: 'gemini', providerId: 'gemini', status: 'current', measuredAt: now - 300_000 }),
  ]
  const providerById = new Map([
    ['codex', { usageSource: { capability: 'available', scheduledRefresh: 'app-server' } }],
    ['gemini', { usageSource: { capability: 'interactive-only', scheduledRefresh: 'interactive' } }],
  ])
  const selected = buildScheduledCandidates({
    accounts,
    providerById,
    sessions: [{ providerId: 'codex', accountId: 'codex-profile' }],
    backoff: new Map(),
    now,
    intervalMs: REFRESH_INTERVAL_MS,
  })

  assert.deepEqual(
    selected.accounts.map(({ account: candidate, active }) => [candidate.id, active]),
    [
      ['codex-profile', true],
      ['codex-system-b', false],
    ],
  )
  assert.equal(selected.skippedBackoff, 0)
})

test('cadência automática usa Codex app-server e Openia command; Claude usa watcher e Gemini é interativa', () => {
  const selected = buildScheduledCandidates({
    accounts: [
      account({ id: 'codex', ownLogin: true }),
      account({ id: 'claude', providerId: 'claude', ownLogin: true }),
      account({ id: 'gemini', providerId: 'gemini', ownLogin: true }),
      account({ id: 'openia', providerId: 'openia', ownLogin: true }),
    ],
    providerById: new Map([
      ['codex', { usageSource: { capability: 'available', scheduledRefresh: 'app-server' } }],
      ['claude', { usageSource: { capability: 'available', scheduledRefresh: 'watcher' } }],
      ['gemini', { usageSource: { capability: 'interactive-only', scheduledRefresh: 'interactive' } }],
      ['openia', { usageSource: { capability: 'available', scheduledRefresh: 'command' } }],
    ]),
    sessions: [],
    backoff: new Map(),
    now: 2_000_000,
    intervalMs: REFRESH_INTERVAL_MS,
  })

  assert.deepEqual(
    selected.accounts.map(({ account: candidate, scheduledRefresh }) => [
      candidate.id,
      scheduledRefresh,
    ]),
    [
      ['codex', 'app-server'],
      ['openia', 'command'],
    ],
  )
})

test('uma conta do login do sistema que já pode atualizar não fica bloqueada pelo backoff de outra', () => {
  const now = 2_000_000
  const selected = buildScheduledCandidates({
    accounts: [
      account({
        id: 'codex-system-auth',
        status: 'unavailable',
        measuredAt: now - 120_000,
        failureReason: 'auth-required',
      }),
      account({
        id: 'codex-system-current',
        status: 'current',
        measuredAt: now - REFRESH_INTERVAL_MS - 1,
      }),
    ],
    providerById: new Map([
      ['codex', { usageSource: { capability: 'available', scheduledRefresh: 'app-server' } }],
    ]),
    sessions: [],
    backoff: new Map(),
    now,
    intervalMs: REFRESH_INTERVAL_MS,
  })

  assert.equal(selected.accounts.length, 1)
  assert.equal(selected.accounts[0].account.id, 'codex-system-current')
  assert.deepEqual(
    selected.accounts[0].dueAccounts.map(({ id }) => id),
    ['codex-system-current'],
  )
  assert.deepEqual(
    selected.accounts[0].groupAccounts.map(({ id }) => id),
    ['codex-system-auth', 'codex-system-current'],
  )
  assert.equal(selected.skippedBackoff, 0)
})

test('conta agrupada ausente na resposta ganha backoff mesmo quando outra foi atualizada', async () => {
  const clock = fakeClock()
  const first = account({ id: 'codex-system-a' })
  const missing = account({ id: 'codex-system-b' })
  let current = dashboard({ accounts: [first, missing] })
  const calls = []
  const service = {
    list: async () => current,
    refreshAccount: async (accountId) => {
      calls.push(accountId)
      const collectedAt = new Date(clock.now()).toISOString()
      current = dashboard({
        accounts: [
          {
            ...first,
            latestSample: {
              status: 'current',
              collectedAt,
              metadata: { measuredAt: collectedAt },
            },
            availability: { state: 'available' },
          },
          missing,
        ],
      })
      return current
    },
  }
  const scheduler = createAgentUsageRefreshScheduler({
    service,
    now: clock.now,
    setTimeoutFn: clock.setTimeout,
    clearTimeoutFn: clock.clearTimeout,
  })

  scheduler.setConsumerState('painel', { visible: true, performanceMode: false })
  clock.advance(REFRESH_INTERVAL_MS)
  await flushAsyncWork()
  assert.deepEqual(calls, ['codex-system-a'])

  clock.advance(REFRESH_INTERVAL_MS)
  await flushAsyncWork()
  assert.deepEqual(calls, ['codex-system-a', 'codex-system-a'])
  scheduler.stop()
})

test('backoff de sucesso usa a cadência atual depois de sair da ociosidade', () => {
  const now = 2_000_000
  const selected = buildScheduledCandidates({
    accounts: [
      account({
        id: 'codex-system',
        status: 'current',
        measuredAt: now - REFRESH_INTERVAL_MS - 1,
      }),
    ],
    providerById: new Map([
      ['codex', { usageSource: { capability: 'available', scheduledRefresh: 'app-server' } }],
    ]),
    sessions: [],
    backoff: new Map([
      [
        'codex-system',
        {
          failures: 0,
          completedAt: now - REFRESH_INTERVAL_MS - 1,
          nextAttemptAt: now + IDLE_INTERVAL_MS,
        },
      ],
    ]),
    now,
    intervalMs: REFRESH_INTERVAL_MS,
  })

  assert.equal(selected.accounts.length, 1)
})

test('backoff cresce por conta, tem teto e respeita o Retry-After de rate limit', () => {
  assert.equal(getBackoffDelay({ latestSample: { status: 'error' } }, 1), FAILURE_BASE_MS)
  assert.equal(getBackoffDelay({ latestSample: { status: 'error' } }, 2), FAILURE_BASE_MS * 2)
  assert.equal(getBackoffDelay({ latestSample: { status: 'error' } }, 20), MAX_BACKOFF_MS)
  assert.equal(
    getBackoffDelay(
      { latestSample: { status: 'error', errorMessage: 'HTTP 429 rate limit; retry-after: 120' } },
      1,
    ),
    RATE_LIMIT_MIN_MS,
  )
  assert.equal(
    getBackoffDelay(
      {
        latestSample: {
          status: 'error',
          metadata: { retryAfterMs: 25 * 60_000 },
        },
      },
      1,
    ),
    25 * 60_000,
  )
  assert.equal(parseRetryAfterMs('retry-after: 8m'), 8 * 60_000)
  assert.equal(parseRetryAfterMs('Retry After: 12'), 12_000)
  assert.equal(parseRetryAfterMs('{"retry_after": 8}'), 8_000)
  assert.equal(
    parseRetryAfterMs(
      'Retry-After: Wed, 21 Oct 2026 07:28:00 GMT',
      Date.parse('Wed, 21 Oct 2026 07:20:00 GMT'),
    ),
    8 * 60_000,
  )
})

test('a rodada automática atualiza a conta e registra métricas agregadas', async () => {
  const clock = fakeClock()
  const before = account({ id: 'codex-system' })
  let current = dashboard({ accounts: [before] })
  const metrics = []
  const updates = []
  const service = {
    list: async () => current,
    refreshAccount: async (accountId) => {
      current = dashboard({
        accounts: [
          {
            ...before,
            latestSample: {
              status: 'current',
              collectedAt: new Date(clock.now()).toISOString(),
              metadata: { measuredAt: new Date(clock.now()).toISOString() },
            },
          },
        ],
      })
      assert.equal(accountId, 'codex-system')
      return current
    },
    getExternalOperationMetrics: () => ({
      peak: 2,
      processesStarted: 3,
      providerRequestsStarted: 2,
    }),
    resetExternalOperationMetrics() {},
  }
  const scheduler = createAgentUsageRefreshScheduler({
    service,
    now: clock.now,
    setTimeoutFn: clock.setTimeout,
    clearTimeoutFn: clock.clearTimeout,
    onDashboard: (value) => updates.push(value),
    onMetrics: (value) => metrics.push(value),
  })

  scheduler.setConsumerState('painel', { visible: true, performanceMode: false })
  clock.advance(REFRESH_INTERVAL_MS)
  await flushAsyncWork()

  assert.equal(updates.length, 1)
  assert.equal(metrics.length, 1)
  assert.equal(metrics[0].details.attempted, 1)
  assert.equal(metrics[0].details.succeeded, 1)
  assert.equal(metrics[0].details.maxConcurrent, 1)
  assert.equal(metrics[0].details.maxExternalOperations, 2)
  assert.equal(metrics[0].details.processesStarted, 3)
  assert.equal(metrics[0].details.providerRequestsStarted, 2)
  assert.equal(JSON.stringify(metrics[0]).includes('codex-system'), false)
  scheduler.stop()
})

test('scheduler reduz para duas consultas simultâneas usando bateria', async () => {
  const clock = fakeClock()
  const accounts = Array.from({ length: 4 }, (_, index) =>
    account({ id: `codex-profile-${index + 1}`, ownLogin: true }),
  )
  const metrics = []
  const service = {
    list: async () => dashboard({ accounts }),
    refreshAccount: async () => {
      await new Promise((resolve) => setImmediate(resolve))
      return dashboard({ accounts })
    },
  }
  const scheduler = createAgentUsageRefreshScheduler({
    service,
    isOnBatteryPower: () => true,
    now: clock.now,
    setTimeoutFn: clock.setTimeout,
    clearTimeoutFn: clock.clearTimeout,
    onMetrics: (event) => metrics.push(event),
  })

  scheduler.setConsumerState('painel', { visible: true, performanceMode: false })
  clock.advance(BATTERY_INTERVAL_MS)
  for (let attempt = 0; attempt < 20 && metrics.length === 0; attempt += 1) {
    await flushAsyncWork()
  }

  assert.equal(metrics.length, 1)
  assert.equal(metrics[0].details.maxConcurrent, 2)
  scheduler.stop()
})

test('esconder o painel aborta a consulta e impede a próxima conta enfileirada', async () => {
  const clock = fakeClock()
  const first = account({ id: 'codex-first', ownLogin: true })
  const second = account({ id: 'codex-second', ownLogin: true })
  const calls = []
  let finishFirst
  const service = {
    list: async () => dashboard({ accounts: [first, second] }),
    refreshAccount: (id, { signal }) => {
      calls.push(id)
      if (id !== 'codex-first') return Promise.resolve(dashboard({ accounts: [first, second] }))
      return new Promise((resolve, reject) => {
        finishFirst = () => resolve(dashboard({ accounts: [first, second] }))
        signal.addEventListener(
          'abort',
          () => reject(new Error('abortada')),
          { once: true },
        )
      })
    },
  }
  const scheduler = createAgentUsageRefreshScheduler({
    service,
    maxConcurrent: 1,
    now: clock.now,
    setTimeoutFn: clock.setTimeout,
    clearTimeoutFn: clock.clearTimeout,
  })

  scheduler.setConsumerState('painel', { visible: true, performanceMode: false })
  clock.advance(REFRESH_INTERVAL_MS)
  await flushAsyncWork()
  assert.deepEqual(calls, ['codex-first'])

  scheduler.setConsumerState('painel', { visible: false, performanceMode: false })
  finishFirst?.()
  await flushAsyncWork()
  assert.deepEqual(calls, ['codex-first'])
  assert.equal(clock.timers.size, 0)
  scheduler.stop()
})

test('consultas manuais simultâneas mantêm o scheduler pausado até a última terminar', async () => {
  const clock = fakeClock()
  const onlyAccount = account({ id: 'codex-profile', ownLogin: true })
  const calls = []
  const service = {
    list: async () => dashboard({ accounts: [onlyAccount] }),
    refreshAccount: (_id, { signal }) =>
      new Promise((resolve, reject) => {
        calls.push('scheduled')
        signal.addEventListener('abort', () => reject(new Error('abortada')), {
          once: true,
        })
      }),
  }
  const scheduler = createAgentUsageRefreshScheduler({
    service,
    now: clock.now,
    setTimeoutFn: clock.setTimeout,
    clearTimeoutFn: clock.clearTimeout,
  })

  scheduler.setConsumerState('painel', { visible: true, performanceMode: false })
  clock.advance(REFRESH_INTERVAL_MS)
  await flushAsyncWork()
  assert.deepEqual(calls, ['scheduled'])

  const firstStartedAt = await scheduler.manualRefreshStarted()
  const secondStartedAt = await scheduler.manualRefreshStarted()
  scheduler.manualRefreshFinished(null, { startedAt: firstStartedAt })
  assert.equal(clock.timers.size, 0)

  scheduler.manualRefreshFinished(null, { startedAt: secondStartedAt })
  assert.equal(clock.timers.size, 1)
  scheduler.stop()
})

test('refresh manual continua disponível e a cadência espaçada volta no Modo Performance', async () => {
  const clock = fakeClock()
  const scheduler = createAgentUsageRefreshScheduler({
    service: { list: async () => dashboard(), refreshAccount: async () => dashboard() },
    now: clock.now,
    setTimeoutFn: clock.setTimeout,
    clearTimeoutFn: clock.clearTimeout,
  })

  scheduler.setConsumerState('painel', { visible: true, performanceMode: true })
  const startedAt = await scheduler.manualRefreshStarted()
  assert.equal(clock.timers.size, 0)
  scheduler.manualRefreshFinished(dashboard(), { startedAt })
  assert.equal(clock.timers.size, 1)
  assert.equal(
    [...clock.timers.values()][0].at,
    clock.now() + PERFORMANCE_MODE_INTERVAL_MS,
  )
  scheduler.stop()
})

test('isConsumerVisible responde só se o painel ou o modal está à vista, mesmo durante um refresh manual', async () => {
  const clock = fakeClock()
  let windowVisible = true
  const service = { list: async () => dashboard(), refreshAccount: async () => dashboard() }
  const scheduler = createAgentUsageRefreshScheduler({
    service,
    now: clock.now,
    setTimeoutFn: clock.setTimeout,
    clearTimeoutFn: clock.clearTimeout,
    isWindowVisible: () => windowVisible,
  })

  assert.equal(scheduler.isConsumerVisible(), false)
  scheduler.setConsumerState('painel', { visible: true, performanceMode: false })
  assert.equal(scheduler.isConsumerVisible(), true)
  // O refresh manual tira o agendamento do ar, mas o painel continua aberto.
  await scheduler.manualRefreshStarted()
  assert.equal(scheduler.isConsumerVisible(), true)
  windowVisible = false
  assert.equal(scheduler.isConsumerVisible(), false)
  windowVisible = true
  scheduler.setConsumerState('painel', { visible: false, performanceMode: false })
  assert.equal(scheduler.isConsumerVisible(), false)
  scheduler.stop()
})
