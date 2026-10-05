'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')

const { STATUS_REQUESTS, createCodexStatusQuery } = require('./codex-status-query.cjs')
const fixture = require('../__fixtures__/codex-app-server-status.json')

/** Sessão do app-server já respondida, com as respostas reais anonimizadas. */
function sessionFrom(responses = fixture.responses) {
  return async (options) => ({
    ok: true,
    reason: null,
    message: null,
    initialize: fixture.initialize,
    responses: structuredClone(responses),
    options,
  })
}

const SCREEN = {
  ok: true,
  readAt: '2026-10-02T20:04:00.000Z',
  version: '0.156.1',
  usagePage: 'https://chatgpt.com/codex/settings/usage',
  limitsPending: false,
  lines: ['OpenAI Codex (v0.156.1)', 'Account: Plano'],
  omittedLabels: ['Directory'],
  message: null,
}

const NOW = () => Date.parse('2026-10-02T20:04:00.000Z')

test('junta métricas do app-server, detalhes e a tela do /status numa amostra', async () => {
  const query = createCodexStatusQuery({ runSession: sessionFrom(), readScreen: async () => SCREEN, now: NOW })

  const result = await query({ env: {} })

  assert.equal(result.ok, true)
  assert.equal(result.measuredAt, '2026-10-02T20:04:00.000Z')
  assert.deepEqual(
    result.metrics.map((metric) => [metric.key, metric.scope ?? 'conta']),
    [
      ['rate_limits.primary', 'conta'],
      ['rate_limits.secondary', 'conta'],
      ['rate_limits.base_model_inference.primary', 'model'],
      ['credits', 'conta'],
    ],
  )
  assert.equal(
    result.metrics[2].label,
    'Últimos 7 dias · gpt-reserve (gpt-5.6-luna)',
  )
  assert.equal(result.details.version, '0.156.1')
  assert.deepEqual(result.details.lines, SCREEN.lines)
  // Na gravação real o backend contou 4 resets e devolveu a lista vazia —
  // aconteceu de forma intermitente em 02/10/2026. O número passa como veio.
  assert.equal(result.details.usageCredits.availableCount, 4)
  assert.deepEqual(result.details.usageCredits.credits, [])
})

test('pede ao app-server só leituras, com o limite como único pedido obrigatório', () => {
  assert.deepEqual(
    STATUS_REQUESTS.map(({ method, required }) => [method, Boolean(required)]),
    [
      ['account/rateLimits/read', true],
      ['account/read', false],
      ['config/read', false],
      ['model/list', false],
      ['account/usage/read', false],
    ],
  )
  assert.ok(STATUS_REQUESTS.every(({ method }) => /\/(read|list)$/.test(method)))
  // Sem renovar o token: a leitura nunca escreve no login da conta.
  assert.deepEqual(STATUS_REQUESTS[1].params, { refreshToken: false })
})

test('tela que falha não derruba a amostra: os detalhes dizem por quê', async () => {
  const query = createCodexStatusQuery({
    runSession: sessionFrom(),
    readScreen: async () => ({ ok: false, message: 'O /status do Codex não apareceu a tempo.' }),
    now: NOW,
  })

  const result = await query({ env: {} })

  assert.equal(result.ok, true)
  assert.equal(result.details.screen, 'não lida nesta rodada: O /status do Codex não apareceu a tempo.')
  assert.equal(result.details.lines, undefined)
  assert.equal(result.metrics.length, 4)
})

test('tela que lança também não derruba a amostra', async () => {
  const query = createCodexStatusQuery({
    runSession: sessionFrom(),
    readScreen: async () => {
      throw new Error('node-pty indisponível')
    },
    now: NOW,
  })

  const result = await query({ env: {} })

  assert.equal(result.ok, true)
  assert.match(result.details.screen, /não lida nesta rodada/)
})

test('limite que não veio derruba a amostra com a mensagem do app-server', async () => {
  const query = createCodexStatusQuery({
    runSession: async () => ({ ok: false, reason: 'server-error', message: 'sessão não autenticada', responses: {} }),
    readScreen: async () => SCREEN,
  })

  const result = await query({ env: {} })

  assert.deepEqual(result, {
    ok: false,
    collectedAt: null,
    measuredAt: null,
    metrics: [],
    details: null,
    message: 'sessão não autenticada',
  })
})

test('as duas leituras recebem o perfil da conta pedida, e só ele', async () => {
  const seen = []
  const query = createCodexStatusQuery({
    runSession: async (options) => {
      seen.push(['app-server', options.accountEnv.CODEX_HOME])
      return sessionFrom()(options)
    },
    readScreen: async (options) => {
      seen.push(['tela', options.env.CODEX_HOME])
      return SCREEN
    },
    now: NOW,
  })

  await query({ env: { CODEX_HOME: '/perfis/conta-a' } })
  await query({ env: { CODEX_HOME: '/perfis/conta-b' } })

  assert.deepEqual(seen, [
    ['app-server', '/perfis/conta-a'],
    ['tela', '/perfis/conta-a'],
    ['app-server', '/perfis/conta-b'],
    ['tela', '/perfis/conta-b'],
  ])
})

test('o tempo de cada leitura respeita o teto pedido pelo painel', async () => {
  const limits = {}
  const query = createCodexStatusQuery({
    runSession: async (options) => {
      limits.session = options.timeoutMs
      return sessionFrom()(options)
    },
    readScreen: async (options) => {
      limits.screen = options.timeoutMs
      return SCREEN
    },
    now: NOW,
  })

  await query({ env: {}, timeoutMs: 12_000 })

  assert.deepEqual(limits, { session: 12_000, screen: 12_000 })
})

test('cancelar repassa o mesmo sinal às duas leituras', async () => {
  const signals = []
  const query = createCodexStatusQuery({
    runSession: async (options) => {
      signals.push(options.signal)
      return { ok: false, reason: 'cancelled', message: 'A consulta ao app-server do Codex foi cancelada.', responses: {} }
    },
    readScreen: async (options) => {
      signals.push(options.signal)
      return { ok: false, message: 'cancelada' }
    },
  })
  const controller = new AbortController()

  const result = await query({ env: {}, signal: controller.signal })

  assert.deepEqual(signals, [controller.signal, controller.signal])
  assert.equal(result.ok, false)
  assert.match(result.message, /cancelada/)
})
