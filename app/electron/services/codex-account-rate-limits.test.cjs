'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const { EventEmitter } = require('node:events')

const {
  SESSION_ONLY_STATUS_FIELDS,
  createCodexRateLimitResetConsumer,
  createCodexRateLimitsQuery,
} = require('./codex-account-rate-limits.cjs')

/**
 * Respostas reais do `codex app-server` (Codex CLI 0.150.1, 05/10/2026),
 * anonimizadas: e-mail trocado e a configuração reduzida aos campos que o
 * `/status` mostra. O `/status` da mesma conta, na mesma hora, exibia:
 * "Model: gpt-5.6-terra (reasoning low, summaries auto)", "Permissions: Full
 * Access", "Account: <email> (Plus)" e "Monthly limit: 100% left".
 */
const REAL_ACCOUNT_READ = {
  account: { type: 'chatgpt', email: 'pessoa@example.com', planType: 'plus' },
  requiresOpenaiAuth: true,
}
const REAL_CONFIG_READ = {
  config: {
    model: 'gpt-5.6-terra',
    model_reasoning_effort: 'low',
    model_reasoning_summary: null,
    service_tier: 'default',
    profile: null,
    approval_policy: 'never',
    sandbox_mode: 'danger-full-access',
  },
}
const REAL_RATE_LIMITS = {
  limitId: 'codex',
  primary: { usedPercent: 0, windowDurationMins: 43200, resetsAt: 1793767721 },
  secondary: null,
  credits: { hasCredits: false, unlimited: false, balance: null },
  spendControlReached: false,
  planType: 'free',
  rateLimitReachedType: null,
}

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
  account = null,
  config = null,
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

      // Como um servidor JSON-RPC real: todo pedido recebe resposta. Sem
      // payload configurado, `account/read`/`config/read` respondem erro
      // "method not found", que é o que uma CLI mais antiga devolveria.
      if (message.method === 'account/read' || message.method === 'config/read') {
        const payload = message.method === 'account/read' ? account : config
        queueMicrotask(() =>
          child.stdout.emit(
            'data',
            `${JSON.stringify(
              payload
                ? { id: message.id, result: payload }
                : { id: message.id, error: { code: -32601, message: 'method not found' } },
            )}\n`,
          ),
        )
        return
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

test('leva para o painel os campos por conta do /status real do Codex', async () => {
  const child = fakeCodexAppServer({
    rateLimits: REAL_RATE_LIMITS,
    rateLimitResetCredits: { availableCount: 0, credits: [] },
    account: REAL_ACCOUNT_READ,
    config: REAL_CONFIG_READ,
  })
  const queryCodexRateLimits = createCodexRateLimitsQuery({ spawnProcess: () => child })

  const result = await queryCodexRateLimits({ timeoutMs: 2_000 })

  assert.equal(result.ok, true)
  assert.equal(result.details.email, 'pessoa@example.com')
  assert.equal(result.details.plan, 'plus')
  assert.equal(result.details.model, 'gpt-5.6-terra')
  assert.equal(result.details.reasoningEffort, 'low')
  assert.equal(result.details.approvalPolicy, 'never')
  assert.equal(result.details.sandboxMode, 'danger-full-access')
  // Campo que a CLI publicou como nulo não vira valor presumido.
  assert.equal('reasoningSummary' in result.details, false)
  assert.equal('rateLimitReachedType' in result.details, false)
  assert.deepEqual(result.details.sessionOnlyFields, [...SESSION_ONLY_STATUS_FIELDS])
  // O "Monthly limit" do /status chega como métrica, não como detalhe solto.
  assert.equal(result.metrics[0].label, 'Últimos 30 dias')
  assert.equal(result.metrics[0].remaining, 100)
  // Os três pedidos viajaram no mesmo processo.
  const methods = child.written.map((raw) => JSON.parse(raw).method)
  assert.deepEqual(methods, ['initialize', 'account/rateLimits/read', 'account/read', 'config/read'])
})

test('CLI que não conhece account/read nem config/read mantém os limites e escreve a ausência', async () => {
  const child = fakeCodexAppServer({
    rateLimits: REAL_RATE_LIMITS,
    rateLimitResetCredits: { availableCount: 0, credits: [] },
  })
  const queryCodexRateLimits = createCodexRateLimitsQuery({ spawnProcess: () => child })

  const result = await queryCodexRateLimits({ timeoutMs: 2_000 })

  assert.equal(result.ok, true)
  assert.equal(result.metrics.length, 1)
  assert.equal('email' in result.details, false)
  assert.equal('model' in result.details, false)
  assert.match(result.details.accountUnavailable, /conta\/plano/)
  assert.match(result.details.configUnavailable, /configuração efetiva/)
})

test('cada perfil lê o próprio app-server: os dados de uma conta não vazam para a outra', async () => {
  // Cada conta tem a sua pasta de login (`CODEX_HOME`); o processo é aberto
  // com o ambiente do perfil, e é por ele que o fake decide quem responde.
  const spawnProcess = (_command, _args, options) =>
    fakeCodexAppServer({
      rateLimits: REAL_RATE_LIMITS,
      rateLimitResetCredits: { availableCount: 0, credits: [] },
      account: {
        account: {
          type: 'chatgpt',
          email: options.env.CODEX_HOME?.includes('trabalho') ? 'trabalho@example.com' : 'pessoal@example.com',
          planType: options.env.CODEX_HOME?.includes('trabalho') ? 'pro' : 'plus',
        },
      },
      config: REAL_CONFIG_READ,
    })
  const queryCodexRateLimits = createCodexRateLimitsQuery({ spawnProcess })

  const pessoal = await queryCodexRateLimits({ env: { CODEX_HOME: '/perfis/pessoal' }, timeoutMs: 2_000 })
  const trabalho = await queryCodexRateLimits({ env: { CODEX_HOME: '/perfis/trabalho' }, timeoutMs: 2_000 })

  assert.equal(pessoal.details.email, 'pessoal@example.com')
  assert.equal(pessoal.details.plan, 'plus')
  assert.equal(trabalho.details.email, 'trabalho@example.com')
  assert.equal(trabalho.details.plan, 'pro')
})

test('Permissions do /status: rótulo só quando a CLI publicou aprovação e sandbox', () => {
  const { describeCodexPermissions } = require('./codex-account-rate-limits.cjs')

  // Par medido ao vivo: o /status real mostrava "Permissions: Full Access".
  assert.equal(describeCodexPermissions('never', 'danger-full-access'), 'Acesso total (Full Access)')
  assert.equal(describeCodexPermissions('untrusted', 'read-only'), 'Somente leitura')
  assert.equal(
    describeCodexPermissions('on-failure', 'workspace-write'),
    'Aprovação "on-failure", sandbox "workspace-write"',
  )
  assert.equal(describeCodexPermissions(null, 'read-only'), null)
  assert.equal(describeCodexPermissions('never', null), null)
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
