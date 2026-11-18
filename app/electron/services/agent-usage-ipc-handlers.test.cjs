'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')

const handlers = new Map()
const listeners = new Map()
const originalLoad = Module._load
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'electron') {
    return {
      ipcMain: {
        handle: (channel, handler) => handlers.set(channel, handler),
        on: (channel, handler) => listeners.set(channel, handler),
        removeListener: (channel) => listeners.delete(channel),
      },
    }
  }
  return originalLoad.call(this, request, parent, isMain)
}
const { registerAgentUsageIpcHandlers } = require('./agent-usage-ipc-handlers.cjs')
Module._load = originalLoad

// Os testes de IPC não tocam a pasta de captura do app de verdade.
const semCaptura = () => ({ start() {}, stop() {}, list: () => [] })

test('agent usage IPC validates input and forwards only normalized parameters', async () => {
  const calls = []
  const service = {
    list: async () => ({ ok: true, providers: [], accounts: [] }),
    refresh: async () => ({ ok: true, providers: [], accounts: [] }),
    refreshAccount: async (id) => {
      calls.push(['refresh-account', id])
      return { ok: true, providers: [], accounts: [] }
    },
    addAccount: async (params) => {
      calls.push(['add', params])
      return { ok: true, account: { id: 'account-1' } }
    },
    removeAccount: async (id) => {
      calls.push(['remove', id])
      return { ok: true, removed: true }
    },
    consumeResetCredit: async (params) => {
      calls.push(['consume', params])
      return { ok: true, consumed: true }
    },
  }
  registerAgentUsageIpcHandlers({ service })

  const invalid = await handlers.get('agent-usage:add-account')({}, { providerId: 'codex' })
  assert.equal(invalid.ok, false)
  assert.equal(calls.length, 0)

  const added = await handlers.get('agent-usage:add-account')({}, {
    providerId: 'codex',
    label: '  Principal  ',
    identityHint: '  alice@example.com  ',
  })
  assert.equal(added.ok, true)
  assert.deepEqual(calls[0], [
    'add',
    { providerId: 'codex', label: 'Principal', identityHint: 'alice@example.com' },
  ])

  const removed = await handlers.get('agent-usage:remove-account')({}, ' account-1 ')
  assert.equal(removed.ok, true)
  assert.deepEqual(calls[1], ['remove', 'account-1'])

  const consumed = await handlers.get('agent-usage:consume-reset-credit')({}, {
    accountId: ' account-1 ',
    creditId: ' credit-1 ',
  })
  assert.equal(consumed.ok, true)
  assert.deepEqual(calls[2], [
    'consume',
    { accountId: 'account-1', creditId: 'credit-1' },
  ])

  const invalidConsume = await handlers.get('agent-usage:consume-reset-credit')({}, {
    accountId: 'account-1',
  })
  assert.equal(invalidConsume.ok, false)
  assert.equal(calls.length, 3)

  const refreshed = await handlers.get('agent-usage:refresh-account')({}, ' account-1 ')
  assert.equal(refreshed.ok, true)
  assert.deepEqual(calls[3], ['refresh-account', 'account-1'])

  for (const invalidId of [undefined, '', '   ', 42, { id: 'account-1' }]) {
    const invalidRefresh = await handlers.get('agent-usage:refresh-account')({}, invalidId)
    assert.equal(invalidRefresh.ok, false, `id ${JSON.stringify(invalidId)} deve ser recusado`)
  }
  assert.equal(calls.length, 4, 'id inválido não chega ao serviço')
})

test('agent usage IPC liga visibilidade, política de energia e refresh manual ao scheduler central', async () => {
  const calls = []
  const service = {
    list: async () => ({ ok: true, providers: [], accounts: [] }),
    refresh: async () => {
      calls.push('refresh')
      return { ok: true, providers: [], accounts: [] }
    },
    refreshAccount: async () => ({ ok: true, providers: [], accounts: [] }),
  }
  let schedulerOptions
  const scheduler = {
    setConsumerState: (...args) => calls.push(['consumer', ...args]),
    refreshPowerPolicy: () => calls.push('power-policy'),
    setWindowVisible: (visible) => calls.push(['window', visible]),
    setSuspended: (suspended) => calls.push(['suspended', suspended]),
    manualRefreshStarted: async () => {
      calls.push('manual-start')
      return 123
    },
    manualRefreshFinished: (dashboard, options) => calls.push(['manual-finish', dashboard, options]),
    stop: () => calls.push('stop'),
  }
  const windowListeners = new Map()
  const window = {
    isDestroyed: () => false,
    isVisible: () => true,
    webContents: { id: 7, send() {} },
    on: (event, handler) => windowListeners.set(event, handler),
    removeListener: (event) => windowListeners.delete(event),
  }
  const powerListeners = new Map()
  const powerMonitor = {
    getSystemIdleTime: () => 90,
    isOnBatteryPower: () => true,
    on: (event, handler) => powerListeners.set(event, handler),
    removeListener: (event) => powerListeners.delete(event),
  }
  const watching = registerAgentUsageIpcHandlers({
    createSessionCapture: semCaptura,
    service,
    getMainWindow: () => window,
    powerMonitor,
    createWatcher: () => ({ start() {}, stop() {} }),
    createScheduler: (options) => {
      schedulerOptions = options
      return scheduler
    },
  })

  assert.equal(schedulerOptions.getSystemIdleTime(), 90)
  assert.equal(schedulerOptions.isOnBatteryPower(), true)
  assert.deepEqual(schedulerOptions.getActiveSessions(), [])

  listeners.get('agent-usage:scheduler-state')(
    { sender: window.webContents },
    'canvas-panel',
    { visible: true, performanceMode: false },
  )
  listeners.get('agent-usage:scheduler-state')(
    { sender: { id: 99 } },
    'canvas-panel',
    { visible: true, performanceMode: false },
  )
  assert.deepEqual(calls.filter((call) => Array.isArray(call) && call[0] === 'consumer'), [
    ['consumer', '7:canvas-panel', { visible: true, performanceMode: false }],
  ])

  powerListeners.get('on-battery')()
  powerListeners.get('suspend')()
  powerListeners.get('resume')()
  windowListeners.get('hide')()
  assert.deepEqual(
    calls.filter((call) => typeof call === 'string' || Array.isArray(call)),
    [
      ['consumer', '7:canvas-panel', { visible: true, performanceMode: false }],
      'power-policy',
      ['suspended', true],
      ['suspended', false],
      ['window', false],
    ],
  )

  const refreshed = await handlers.get('agent-usage:refresh')({})
  assert.equal(refreshed.ok, true)
  assert.deepEqual(calls.slice(-3), [
    'manual-start',
    'refresh',
    ['manual-finish', refreshed, { startedAt: 123 }],
  ])

  watching.stopWatching()
  assert.equal(listeners.has('agent-usage:scheduler-state'), false)
  assert.equal(windowListeners.size, 0)
  assert.equal(powerListeners.size, 0)
  assert.equal(calls.at(-1), 'stop')
})

test('agent usage IPC não devolve ao renderer segredo que veio dentro da mensagem de uma exceção', async () => {
  const falha = () => {
    throw new Error('spawn falhou: OPENAI_API_KEY=CANARIOipc0a1b2c e https://u:CANARIOipcurl9z@proxy.example.com')
  }
  registerAgentUsageIpcHandlers({
    createSessionCapture: semCaptura,
    service: { list: falha, refresh: falha, refreshAccount: falha, reconnect: falha, addAccount: falha, removeAccount: falha, consumeResetCredit: falha },
  })

  const respostas = await Promise.all([
    handlers.get('agent-usage:list')({}),
    handlers.get('agent-usage:refresh')({}),
    handlers.get('agent-usage:refresh-account')({}, 'account-1'),
    handlers.get('agent-usage:reconnect')({}),
    handlers.get('agent-usage:add-account')({}, { providerId: 'codex', label: 'Principal' }),
    handlers.get('agent-usage:remove-account')({}, 'account-1'),
    handlers.get('agent-usage:consume-reset-credit')({}, { accountId: 'account-1', creditId: 'credit-1' }),
  ])

  for (const resposta of respostas) {
    assert.equal(resposta.ok, false)
    assert.doesNotMatch(JSON.stringify(resposta), /CANARIO/)
    assert.match(resposta.message, /spawn falhou/, 'o motivo continua legível; só o segredo sai')
  }
})

test('a status line avisa a tela de uma conta só, e uma confirmação só com o painel visível', async () => {
  const sent = []
  let watcherOnChange
  let visible = false
  let refreshResult = null
  const service = {
    refreshLocal: async () => refreshResult,
    describeAccount: async (accountId) => ({ id: accountId, latestSample: { status: 'current' } }),
  }
  const window = {
    isDestroyed: () => false,
    isVisible: () => true,
    webContents: { id: 7, send: (channel, payload) => sent.push([channel, payload]) },
    on() {},
    removeListener() {},
  }
  const watching = registerAgentUsageIpcHandlers({
    createSessionCapture: semCaptura,
    service,
    getMainWindow: () => window,
    createWatcher: ({ onChange }) => {
      watcherOnChange = onChange
      return { start() {}, stop() {} }
    },
    createScheduler: () => ({
      isConsumerVisible: () => visible,
      setConsumerState() {},
      refreshPowerPolicy() {},
      setWindowVisible() {},
      setSuspended() {},
      stop() {},
    }),
  })

  try {
    // Número novo: a conta vai para a tela, com o painel aberto ou fechado.
    refreshResult = { ok: true, kind: 'sample', accountId: 'claude-account' }
    await watcherOnChange('claude')
    // Leitura repetida com o painel fechado: nada (antes, o painel inteiro ia a cada resposta do Claude).
    refreshResult = { ok: true, kind: 'confirmed', accountId: 'claude-account' }
    await watcherOnChange('claude')
    // Painel aberto: a confirmação vai, para a hora da medição e o selo de desatualizado seguirem certos.
    visible = true
    await watcherOnChange('claude')
    refreshResult = null
    await watcherOnChange('claude')

    assert.deepEqual(sent.map(([channel]) => channel), ['agent-usage:account-changed', 'agent-usage:account-changed'])
    assert.deepEqual(sent[0][1], { id: 'claude-account', latestSample: { status: 'current' } })
  } finally {
    watching.stopWatching?.()
  }
})

test('a captura por terminal entrega a janela à conta do terminal e manda o lote de sessões ao renderer', async () => {
  const sent = []
  let capturaOpcoes
  const chamadas = []
  const service = {
    refreshLocal: async (providerId, opcoes) => {
      chamadas.push([providerId, opcoes])
      return { ok: true, kind: 'sample', accountId: opcoes.accountId }
    },
    describeAccount: async (accountId) => ({ id: accountId }),
  }
  const window = {
    isDestroyed: () => false,
    isVisible: () => true,
    webContents: { id: 7, send: (channel, payload) => sent.push([channel, payload]) },
    on() {},
    removeListener() {},
  }
  const watching = registerAgentUsageIpcHandlers({
    service,
    getMainWindow: () => window,
    createWatcher: () => ({ start() {}, stop() {} }),
    createSessionCapture: (opcoes) => {
      capturaOpcoes = opcoes
      return { start() {}, stop() {}, list: () => [{ ptySessionId: 'canvas-a' }] }
    },
    createScheduler: () => ({
      isConsumerVisible: () => false,
      setConsumerState() {},
      refreshPowerPolicy() {},
      setWindowVisible() {},
      setSuspended() {},
      stop() {},
    }),
  })

  try {
    await capturaOpcoes.recordWindows({
      providerId: 'claude',
      accountId: 'conta-b',
      measuredAt: '2026-11-17T12:00:00.000Z',
      accountWindows: [{ key: 'five_hour' }],
    })
    assert.deepEqual(chamadas[0], [
      'claude',
      {
        accountId: 'conta-b',
        reading: { ok: true, collectedAt: '2026-11-17T12:00:00.000Z', metrics: [{ key: 'five_hour' }], identity: null },
      },
    ])
    assert.deepEqual(sent, [['agent-usage:account-changed', { id: 'conta-b' }]])

    capturaOpcoes.onChanged({ changed: [{ ptySessionId: 'canvas-a' }], removed: [] })
    assert.equal(sent.at(-1)[0], 'agent-usage:session-changed')
    assert.deepEqual(await handlers.get('agent-usage:sessions')({}), [{ ptySessionId: 'canvas-a' }])
  } finally {
    watching.stopWatching?.()
  }
})

test('claude-cost-history lê as pastas informadas, limita o período e devolve erro sem vazar', async () => {
  const fs = require('node:fs')
  const os = require('node:os')
  const path = require('node:path')
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-cost-ipc-'))
  fs.mkdirSync(path.join(root, 'projects', 'p'), { recursive: true })
  const now = new Date().toISOString()
  const line = (id, timestamp) =>
    JSON.stringify({ type: 'assistant', cwd: '/a/projeto-x', timestamp, requestId: id, message: { id, model: 'm', usage: { input_tokens: 7, output_tokens: 1 } } })
  fs.writeFileSync(path.join(root, 'projects', 'p', 'a.jsonl'), [line('1', now), line('2', '2020-01-01T00:00:00.000Z')].join('\n'))
  try {
    registerAgentUsageIpcHandlers({
      service: { list: async () => ({}), refresh: async () => ({}), refreshAccount: async () => ({}), refreshLocal: async () => ({}) },
      createSessionCapture: semCaptura,
      getClaudeRoots: () => [root],
      claudePricingFile: path.join(root, 'nao-existe.json'),
      // Sem arquivo do usuário, o preço vem da tabela; 'm' não está nela, então fica "sem preço".
      aiPricing: { get: async () => ({ origin: 'reserva', table: { asOf: '2026-11-18', currency: 'USD', models: [{ id: 'outro', input: 1, output: 2, cacheRead: null, cacheWrite5m: null, cacheWrite1h: null }], subscriptions: [] } }) },
    })
    const result = await handlers.get('agent-usage:claude-cost-history')({}, { days: 5 })
    assert.equal(result.ok, true)
    assert.equal(result.pricing.asOf, '2026-11-18')
    assert.deepEqual(result.unpricedModels, ['m'])
    assert.deepEqual(result.rows.map((row) => [row.project, row.input, row.costUsd]), [['projeto-x', 7, null]])

    const pricing = await handlers.get('agent-usage:ai-pricing')({}, { force: true })
    assert.equal(pricing.ok, true)
    assert.equal(pricing.origin, 'reserva')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
