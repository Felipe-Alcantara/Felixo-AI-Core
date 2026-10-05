'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const { EventEmitter } = require('node:events')

const {
  createCodexRateLimitResetConsumer,
  createCodexRateLimitsQuery,
  normalizeCodexRateLimitsResult,
} = require('./codex-account-rate-limits.cjs')

/**
 * Processo falso que fala o mesmo protocolo do `codex app-server --stdio`
 * observado ao vivo em 11/09/2026: responde `initialize` (id 1) e então
 * `account/rateLimits/read` com o payload configurado.
 */
function fakeCodexAppServer({
  rateLimits,
  rateLimitResetCredits,
  consumeOutcome = 'reset',
  errorOnRead = null,
  errorOnConsume = null,
} = {}) {
  const child = new EventEmitter()
  const written = []
  child.stdin = {
    write: (data) => {
      written.push(data)
      const message = JSON.parse(data)

      if (message.method === 'initialize') {
        queueMicrotask(() =>
          child.stdout.emit('data', `${JSON.stringify({ id: message.id, result: {} })}\n`),
        )
        return
      }

      if (message.method === 'account/rateLimits/read') {
        queueMicrotask(() => {
          if (errorOnRead) {
            child.stdout.emit(
              'data',
              `${JSON.stringify({ id: message.id, error: { message: errorOnRead } })}\n`,
            )
            return
          }

          child.stdout.emit(
            'data',
            `${JSON.stringify({ id: message.id, result: { rateLimits, rateLimitResetCredits } })}\n`,
          )
        })
      }

      if (message.method === 'account/rateLimitResetCredit/consume') {
        queueMicrotask(() => {
          if (errorOnConsume) {
            child.stdout.emit(
              'data',
              `${JSON.stringify({ id: message.id, error: { message: errorOnConsume } })}\n`,
            )
            return
          }

          child.stdout.emit(
            'data',
            `${JSON.stringify({
              id: message.id,
              result: { outcome: consumeOutcome },
            })}\n`,
          )
        })
      }
    },
  }
  child.stdout = new EventEmitter()
  child.stdout.setEncoding = () => {}
  child.kill = () => {}
  child.written = written
  return child
}

test('devolve os resets disponíveis do Codex a partir do app-server', async () => {
  const child = fakeCodexAppServer({
    rateLimits: {
      primary: {
        usedPercent: 23,
        windowDurationMins: 300,
        resetsAt: 1_800_000_000,
      },
      secondary: {
        usedPercent: 67,
        windowDurationMins: 10_080,
        resetsAt: 1_800_100_000,
      },
      credits: { balance: '4.5', unlimited: false },
    },
    rateLimitResetCredits: {
      availableCount: 2,
      credits: [
        {
          id: 'RateLimitResetCredit_a',
          resetType: 'codexRateLimits',
          status: 'available',
          grantedAt: 1_788_499_787,
          expiresAt: 1_791_091_787,
          title: 'Full reset (Weekly + 5 hr)',
          description: 'Thanks for using Codex!',
        },
      ],
    },
  })

  const queryCodexRateLimits = createCodexRateLimitsQuery({
    spawnProcess: () => child,
    now: () => Date.parse('2026-09-11T15:00:00.000Z'),
  })

  const result = await queryCodexRateLimits()

  assert.equal(result.ok, true)
  assert.equal(result.availableCount, 2)
  assert.equal(result.credits.length, 1)
  assert.equal(result.credits[0].title, 'Full reset (Weekly + 5 hr)')
  assert.equal(result.credits[0].status, 'available')
  assert.equal(result.credits[0].grantedAt, new Date(1_788_499_787 * 1000).toISOString())
  assert.equal(result.collectedAt, '2026-09-11T15:00:00.000Z')
  assert.deepEqual(
    result.metrics.map(({ key, used, remaining, resetAt }) => ({
      key,
      used,
      remaining,
      resetAt,
    })),
    [
      {
        key: 'rate_limits.primary',
        used: 23,
        remaining: 77,
        resetAt: new Date(1_800_000_000 * 1000).toISOString(),
      },
      {
        key: 'rate_limits.secondary',
        used: 67,
        remaining: 33,
        resetAt: new Date(1_800_100_000 * 1000).toISOString(),
      },
      { key: 'credits', used: null, remaining: 4.5, resetAt: null },
    ],
  )
  assert.deepEqual(result.details.usageCredits, {
    availableCount: 2,
    credits: result.credits,
  })

  // Nunca deve existir nenhuma chamada ao método que gasta o reset de verdade.
  assert.ok(
    child.written.every((raw) => !JSON.parse(raw).method?.includes('consume')),
    'não pode chamar account/rateLimitResetCredit/consume — isso gastaria um reset real',
  )
})

test('conta sem resets disponíveis devolve availableCount 0, não erro', async () => {
  const child = fakeCodexAppServer({ rateLimitResetCredits: { availableCount: 0, credits: [] } })
  const queryCodexRateLimits = createCodexRateLimitsQuery({ spawnProcess: () => child })

  const result = await queryCodexRateLimits()

  assert.equal(result.ok, true)
  assert.equal(result.availableCount, 0)
  assert.deepEqual(result.credits, [])
})

test('rateLimitResetCredits ausente (backend não devolveu) não quebra, devolve zero', async () => {
  const child = fakeCodexAppServer({ rateLimitResetCredits: null })
  const queryCodexRateLimits = createCodexRateLimitsQuery({ spawnProcess: () => child })

  const result = await queryCodexRateLimits()

  assert.equal(result.ok, true)
  assert.equal(result.availableCount, 0)
})

test('erro do app-server na leitura devolve mensagem, não lança', async () => {
  const child = fakeCodexAppServer({ errorOnRead: 'sessão não autenticada' })
  const queryCodexRateLimits = createCodexRateLimitsQuery({ spawnProcess: () => child })

  const result = await queryCodexRateLimits()

  assert.equal(result.ok, false)
  assert.match(result.message, /não autenticada/)
})

test('app-server que não inicia devolve erro claro, não lança', async () => {
  const queryCodexRateLimits = createCodexRateLimitsQuery({
    spawnProcess: () => {
      throw new Error('ENOENT: codex não encontrado')
    },
  })

  const result = await queryCodexRateLimits()

  assert.equal(result.ok, false)
  assert.match(result.message, /iniciar/)
})

test('timeout devolve mensagem própria em vez de travar a chamada', async () => {
  const child = new EventEmitter()
  child.stdin = { write: () => {} } // nunca responde
  child.stdout = new EventEmitter()
  child.stdout.setEncoding = () => {}
  child.kill = () => {}

  const queryCodexRateLimits = createCodexRateLimitsQuery({ spawnProcess: () => child })
  const result = await queryCodexRateLimits({ timeoutMs: 20 })

  assert.equal(result.ok, false)
  assert.match(result.message, /tempo limite/)
})

test('consome um reset somente com o crédito e a chave de idempotência', async () => {
  const child = fakeCodexAppServer({ consumeOutcome: 'reset' })
  const consumeCodexRateLimitReset = createCodexRateLimitResetConsumer({
    spawnProcess: () => child,
    createIdempotencyKey: () => 'attempt-123',
  })

  const result = await consumeCodexRateLimitReset({
    creditId: 'RateLimitResetCredit_a',
  })
  const requests = child.written.map((raw) => JSON.parse(raw))
  const consumeRequest = requests.find(
    (request) => request.method === 'account/rateLimitResetCredit/consume',
  )

  assert.equal(result.ok, true)
  assert.equal(result.consumed, true)
  assert.equal(result.outcome, 'reset')
  assert.deepEqual(consumeRequest.params, {
    creditId: 'RateLimitResetCredit_a',
    idempotencyKey: 'attempt-123',
  })
})

test('resultado sem crédito não é tratado como sucesso', async () => {
  const child = fakeCodexAppServer({ consumeOutcome: 'noCredit' })
  const consumeCodexRateLimitReset = createCodexRateLimitResetConsumer({
    spawnProcess: () => child,
    createIdempotencyKey: () => 'attempt-456',
  })

  const result = await consumeCodexRateLimitReset({
    creditId: 'RateLimitResetCredit_missing',
  })

  assert.equal(result.ok, false)
  assert.equal(result.consumed, false)
  assert.equal(result.outcome, 'noCredit')
  assert.match(result.message, /não está mais disponível/)
})

test('reserva de um modelo vira métrica com escopo "model"; limite individual vira métrica da conta', () => {
  // Resposta real do Codex 0.156.1 (anonimizada), mais um limite individual
  // de workspace, que a conta pessoal da gravação não tem.
  const { result } = structuredClone(
    require('../__fixtures__/codex-app-server-status.json').responses['account/rateLimits/read'],
  )
  result.rateLimits.individualLimit = {
    limit: '50.00',
    used: '12.50',
    remainingPercent: 75,
    resetsAt: 1_791_000_000,
  }

  const { metrics } = normalizeCodexRateLimitsResult(result, {
    now: () => Date.parse('2026-10-02T20:04:00.000Z'),
  })

  assert.deepEqual(
    metrics.map(({ key, label, remaining, scope }) => ({ key, label, remaining, scope })),
    [
      { key: 'rate_limits.primary', label: 'Últimas 5 h', remaining: 100, scope: undefined },
      { key: 'rate_limits.secondary', label: 'Últimos 7 dias', remaining: 100, scope: undefined },
      {
        key: 'rate_limits.base_model_inference.primary',
        label: 'Últimos 7 dias · gpt-reserve (gpt-5.6-luna)',
        remaining: 100,
        scope: 'model',
      },
      { key: 'spend_control.individual', label: 'Limite de gasto individual', remaining: 75, scope: undefined },
      { key: 'credits', label: 'Créditos avulsos', remaining: 0, scope: undefined },
    ],
  )
})

test('balde principal repetido em rateLimitsByLimitId não vira métrica duplicada', () => {
  const window = { usedPercent: 40, windowDurationMins: 300, resetsAt: 1_800_000_000 }
  const { metrics } = normalizeCodexRateLimitsResult({
    // Payload sem `limitId` no balde principal: o padrão "codex" vale.
    rateLimits: { primary: window },
    rateLimitsByLimitId: {
      codex: { limitId: 'codex', primary: window },
      'nome com espaço': { primary: window },
    },
  })

  assert.deepEqual(metrics.map((metric) => metric.key), ['rate_limits.primary'])
})

test('cancelar a leitura encerra o app-server do Codex na hora e resolve com falha', async () => {
  let killed = 0
  const child = new EventEmitter()
  // Um app-server que nunca responde ao initialize.
  child.stdin = { write: () => {} }
  child.stdout = new EventEmitter()
  child.stdout.setEncoding = () => {}
  child.kill = () => { killed += 1 }
  const queryCodexRateLimits = createCodexRateLimitsQuery({ spawnProcess: () => child })
  const controller = new AbortController()
  const pending = queryCodexRateLimits({ timeoutMs: 60_000, signal: controller.signal })
  controller.abort()
  const result = await pending
  assert.equal(result.ok, false)
  assert.match(result.message, /cancelada/)
  assert.equal(killed, 1)
})
