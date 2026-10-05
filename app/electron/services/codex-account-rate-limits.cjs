'use strict'

const { randomUUID } = require('node:crypto')
const spawnChildProcess = require('cross-spawn')
const { createCliEnv } = require('./cli-process-manager.cjs')
const { buildAccountProcessEnv } = require('./cli-account-profiles.cjs')

/**
 * Resets bancados ("banked resets") do Codex: um crédito único, concedido
 * pela OpenAI, que zera a janela de 5h + semanal antes do reset automático.
 * Diferente de `agent-usage-codex-local.cjs` (que só lê o rollout no disco),
 * este dado NÃO existe em nenhum arquivo local — só o app-server da própria
 * CLI sabe (`account/rateLimits/read`, JSON-RPC via stdio), porque é a CLI
 * quem já está autenticada e conversa com o backend da OpenAI.
 *
 * A leitura continua estritamente sem efeitos colaterais. O método que gasta
 * um reset (`account/rateLimitResetCredit/consume`) fica em uma função
 * separada, chamada somente pelo fluxo de ação explícita da interface, depois
 * de uma confirmação humana. Assim abrir/atualizar o painel nunca consome
 * crédito por acidente.
 *
 * Verificado manualmente nesta máquina (11/09/2026, Codex CLI 0.154.0): o
 * handshake `initialize` + `account/rateLimits/read` devolve, entre outros
 * campos, as janelas atuais (`rateLimits.primary/secondary`) e
 * `rateLimitResetCredits: { availableCount, credits: [...] }` — com
 * `credits[].status` em `available`/`redeeming`/`redeemed`/`unknown`.
 */

const DEFAULT_TIMEOUT_MS = 15_000
const DEFAULT_CLIENT_NAME = 'felixo-ai-core'

/**
 * Pedidos opcionais que acompanham `account/rateLimits/read` na mesma sessão.
 * `refreshToken: false` deixa `account/read` só ler o login já gravado — o
 * painel nunca deve renovar credencial como efeito colateral de abrir.
 */
const STATUS_EXTRA_REQUESTS = Object.freeze([
  Object.freeze({ method: 'account/read', params: { refreshToken: false } }),
  Object.freeze({ method: 'config/read', params: { includeLayers: false } }),
])

/**
 * Linhas do `/status` do Codex que dependem de uma sessão de chat aberta, não
 * da conta. O painel é por conta/perfil, então elas ficam de fora de propósito
 * — e a ausência é escrita no próprio painel, não escondida. Conferido contra
 * o `/status` real do Codex CLI 0.150.1 em 05/10/2026.
 */
const SESSION_ONLY_STATUS_FIELDS = Object.freeze([
  'Directory (pasta do terminal, não da conta)',
  'Agents.md (depende da pasta do terminal)',
  'Collaboration mode (escolhido dentro da sessão)',
  'Session (id de uma sessão de chat aberta)',
  'Tokens usados e janela de contexto (existem só numa sessão em andamento)',
])

/**
 * @param {object} [dependencies]
 * @param {(command: string, args: string[], options: object) => object} [dependencies.spawnProcess]
 * @param {() => number} [dependencies.now]
 * @returns {(options?: object) => Promise<object>}
 */
function createCodexRateLimitsQuery({ spawnProcess = spawnChildProcess, now = () => Date.now() } = {}) {
  return function queryCodexRateLimits({
    env: accountEnv = {},
    timeoutMs = DEFAULT_TIMEOUT_MS,
    clientVersion = '0.0.0',
    signal = null,
  } = {}) {
    return requestCodexAppServer({
      spawnProcess,
      now,
      accountEnv,
      timeoutMs,
      clientVersion,
      signal,
      method: 'account/rateLimits/read',
      params: null,
      // Conta/plano e configuração efetiva entram na mesma sessão: são as
      // linhas do `/status` do Codex que não dependem de uma sessão de chat.
      extraRequests: STATUS_EXTRA_REQUESTS,
      timeoutMessage: 'A consulta de resets do Codex excedeu o tempo limite.',
      failureResult: () => ({
        collectedAt: null,
        availableCount: null,
        credits: [],
      }),
      serverErrorMessage: 'O app-server do Codex recusou a consulta de limites.',
      normalizeResult: (result, extras = {}) => {
        const summary = result?.rateLimitResetCredits ?? null
        const collectedAt = new Date(now()).toISOString()
        const credits = Array.isArray(summary?.credits)
          ? summary.credits.map(toResetCredit)
          : []
        const availableCount =
          typeof summary?.availableCount === 'number' ? summary.availableCount : 0
        return {
          collectedAt,
          measuredAt: collectedAt,
          metrics: toRateLimitMetrics(result?.rateLimits),
          availableCount,
          credits,
          details: {
            ...buildCodexStatusDetails({
              account: extras['account/read'],
              config: extras['config/read'],
              rateLimits: result?.rateLimits,
            }),
            usageCredits: { availableCount, credits },
          },
          message: null,
        }
      },
    })
  }
}

/**
 * Cria a ação de resgate do crédito de reset.
 *
 * O `idempotencyKey` é obrigatório pelo protocolo da CLI e nasce aqui, no
 * processo principal. O renderer só pode escolher o `creditId` que a última
 * leitura mostrou; ele nunca controla a chave nem recebe o ambiente de login.
 */
function createCodexRateLimitResetConsumer({
  spawnProcess = spawnChildProcess,
  now = () => Date.now(),
  createIdempotencyKey = randomUUID,
} = {}) {
  return function consumeCodexRateLimitReset({
    env: accountEnv = {},
    creditId = null,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    clientVersion = '0.0.0',
    idempotencyKey = createIdempotencyKey(),
  } = {}) {
    const normalizedCreditId = normalizeOptionalId(creditId)
    const normalizedIdempotencyKey = normalizeOptionalId(idempotencyKey)

    if (!normalizedIdempotencyKey) {
      return Promise.resolve({
        ok: false,
        consumed: false,
        outcome: null,
        message: 'Não foi possível criar a chave desta tentativa de reset.',
      })
    }

    return requestCodexAppServer({
      spawnProcess,
      now,
      accountEnv,
      timeoutMs,
      clientVersion,
      method: 'account/rateLimitResetCredit/consume',
      params: {
        creditId: normalizedCreditId,
        idempotencyKey: normalizedIdempotencyKey,
      },
      timeoutMessage: 'O uso do reset do Codex excedeu o tempo limite.',
      failureResult: () => ({
        consumed: false,
        outcome: null,
      }),
      serverErrorMessage: 'O app-server do Codex recusou o uso do reset.',
      normalizeResult: (result) => {
        const outcome = normalizeConsumeOutcome(result?.outcome)
        const consumed = outcome === 'reset' || outcome === 'alreadyRedeemed'
        return {
          consumed,
          outcome,
          message: consumeOutcomeMessage(outcome),
          // `alreadyRedeemed` também é sucesso: a tentativa idempotente já
          // aplicou o reset, então o painel deve atualizar a leitura.
          ok: consumed,
        }
      },
    })
  }
}

/**
 * Fala com `codex app-server --stdio` (JSON-RPC por linha) numa sessão só.
 *
 * `method`/`params` é o pedido obrigatório: sem a resposta dele a leitura
 * falha. `extraRequests` são pedidos opcionais que viajam no MESMO processo —
 * abrir um app-server por pergunta custaria um processo (e um handshake) a
 * mais por conta a cada atualização do painel. Um opcional que responda com
 * erro, ou que não responda até o tempo limite, só deixa o seu campo de fora:
 * `normalizeResult` recebe `(resultadoObrigatório, { [método]: resultado | null })`.
 */
function requestCodexAppServer({
  spawnProcess,
  now,
  accountEnv,
  timeoutMs,
  clientVersion,
  method,
  params,
  extraRequests = [],
  // Cancelamento de fora (teto da rodada ou "Reconectar"): encerra o
  // app-server na hora. Só a leitura aceita; o consumo de reset nunca é
  // abortado no meio.
  signal = null,
  timeoutMessage,
  failureResult,
  serverErrorMessage,
  normalizeResult,
}) {
  return new Promise((resolve) => {
    let child
    let settled = false
    let timeoutTimer
    let buffer = ''
    const MAIN_REQUEST_ID = 2
    // id do JSON-RPC → método opcional. Os ids começam depois do obrigatório.
    const extraById = new Map(extraRequests.map((request, index) => [MAIN_REQUEST_ID + 1 + index, request.method]))
    const extraResults = Object.fromEntries(extraRequests.map((request) => [request.method, null]))
    let pendingExtras = extraById.size
    let mainAnswered = false
    let mainResult

    const finish = (result) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timeoutTimer)
      try {
        child?.kill?.()
      } catch {
        // Não afeta o resultado; o timeout de fora também cobre órfãos.
      }
      resolve(result)
    }

    const fail = (message) =>
      finish({
        ok: false,
        ...(typeof failureResult === 'function' ? failureResult() : {}),
        message,
      })

    const complete = () => {
      try {
        finish({ ok: true, ...normalizeResult(mainResult, { ...extraResults }) })
      } catch {
        fail('A resposta do app-server do Codex veio em formato inválido.')
      }
    }

    const send = (payload) => {
      if (settled) {
        return
      }
      try {
        child.stdin.write(`${JSON.stringify(payload)}\n`)
      } catch {
        fail('Não foi possível falar com o app-server do Codex.')
      }
    }

    try {
      child = spawnProcess('codex', ['app-server', '--stdio'], {
        env: createCliEnv(buildAccountProcessEnv(process.env, { providerId: 'codex', profileEnv: accountEnv })),
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      })
    } catch {
      fail('Não foi possível iniciar o app-server do Codex.')
      return
    }

    child.on('error', () => fail('O app-server do Codex não pôde ser iniciado.'))
    child.on('exit', () => {
      if (!settled) {
        fail('O app-server do Codex encerrou antes de responder.')
      }
    })

    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      if (settled) {
        return
      }

      buffer += chunk
      let newlineIndex = buffer.indexOf('\n')
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex).trim()
        buffer = buffer.slice(newlineIndex + 1)
        newlineIndex = buffer.indexOf('\n')

        if (line) {
          handleLine(line)
        }
      }
    })

    function handleLine(line) {
      let message
      try {
        message = JSON.parse(line)
      } catch {
        return
      }

      if (message.id === 1) {
        if (message.error) {
          fail(
            typeof message.error?.message === 'string'
              ? message.error.message
              : 'O app-server do Codex recusou a inicialização.',
          )
          return
        }

        if (message.result) {
          // `initialize` respondeu: só agora o app-server aceita os pedidos.
          // Não existe uma notificação `initialized` obrigatória neste
          // protocolo — os pedidos seguintes já podem sair.
          send({ jsonrpc: '2.0', id: MAIN_REQUEST_ID, method, params })
          for (const [id, request] of extraRequests.map((item, index) => [MAIN_REQUEST_ID + 1 + index, item])) {
            send({ jsonrpc: '2.0', id, method: request.method, params: request.params ?? null })
          }
        }
        return
      }

      if (extraById.has(message.id)) {
        const extraMethod = extraById.get(message.id)
        extraById.delete(message.id)
        pendingExtras -= 1
        extraResults[extraMethod] = message.error ? null : message.result ?? null
        if (mainAnswered && pendingExtras === 0) {
          complete()
        }
        return
      }

      if (message.id !== MAIN_REQUEST_ID) {
        return
      }

      if (message.error) {
        fail(
          typeof message.error?.message === 'string'
            ? message.error.message
            : serverErrorMessage,
        )
        return
      }

      mainAnswered = true
      mainResult = message.result
      if (pendingExtras === 0) {
        complete()
      }
    }

    // No tempo limite, um pedido obrigatório já respondido vale: só os
    // opcionais que faltaram ficam de fora (o painel registra a ausência).
    timeoutTimer = setTimeout(() => (mainAnswered ? complete() : fail(timeoutMessage)), timeoutMs)

    if (signal) {
      const cancel = () => fail('A consulta ao app-server do Codex foi cancelada.')
      if (signal.aborted) {
        cancel()
        return
      }
      signal.addEventListener('abort', cancel, { once: true })
    }

    send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { clientInfo: { name: DEFAULT_CLIENT_NAME, version: clientVersion } },
    })
  })
}

/**
 * Monta os campos por conta do `/status` a partir das fontes estruturadas do
 * app-server. Regra do painel: só entra o que a CLI publicou — um campo nulo
 * na resposta fica fora, nunca vira um valor presumido.
 *
 * @param {{ account?: object | null, config?: object | null, rateLimits?: object | null }} sources
 * @returns {Record<string, unknown>}
 */
function buildCodexStatusDetails({ account, config, rateLimits }) {
  const details = {}
  const login = account?.account ?? null
  const effectiveConfig = config?.config ?? null

  if (login && typeof login === 'object') {
    putString(details, 'email', login.email)
    putString(details, 'plan', login.planType)
    putString(details, 'authMode', login.type)
  }

  if (effectiveConfig && typeof effectiveConfig === 'object') {
    putString(details, 'model', effectiveConfig.model)
    putString(details, 'reasoningEffort', effectiveConfig.model_reasoning_effort)
    putString(details, 'reasoningSummary', effectiveConfig.model_reasoning_summary)
    putString(details, 'serviceTier', effectiveConfig.service_tier)
    putString(details, 'profile', effectiveConfig.profile)

    const approvalPolicy = typeof effectiveConfig.approval_policy === 'string'
      ? effectiveConfig.approval_policy
      : null
    const sandboxMode = typeof effectiveConfig.sandbox_mode === 'string'
      ? effectiveConfig.sandbox_mode
      : null
    const permissions = describeCodexPermissions(approvalPolicy, sandboxMode)
    putString(details, 'permissions', permissions)
    putString(details, 'approvalPolicy', approvalPolicy)
    putString(details, 'sandboxMode', sandboxMode)
  }

  putString(details, 'rateLimitReachedType', rateLimits?.rateLimitReachedType)
  if (rateLimits?.spendControlReached === true) {
    details.spendControlReached = 'Sim — o controle de gastos da conta foi atingido'
  }

  if (!login) {
    details.accountUnavailable = 'A CLI não respondeu conta/plano nesta leitura.'
  }
  if (!effectiveConfig) {
    details.configUnavailable = 'A CLI não respondeu a configuração efetiva nesta leitura.'
  }

  details.sessionOnlyFields = [...SESSION_ONLY_STATUS_FIELDS]
  return details
}

/**
 * Traduz aprovação + sandbox no rótulo "Permissions" que o `/status` mostra
 * (no Codex 0.150.1 real: `never` + `danger-full-access` → "Full Access").
 *
 * @param {string | null} approvalPolicy - `untrusted` | `on-failure` | `on-request` | `never` | null
 * @param {string | null} sandboxMode - `read-only` | `workspace-write` | `danger-full-access` | null
 * @returns {string | null}
 */
function describeCodexPermissions(approvalPolicy, sandboxMode) {
  // Sem um dos dois o rótulo seria presumido; os valores crus continuam no
  // painel, então a linha simplesmente não aparece.
  if (!approvalPolicy || !sandboxMode) {
    return null
  }

  const known = {
    'never|danger-full-access': 'Acesso total (Full Access)',
    'on-request|workspace-write': 'Padrão: edita a pasta, pede aprovação fora dela',
    'untrusted|read-only': 'Somente leitura',
    'on-request|read-only': 'Somente leitura, pede aprovação para agir',
  }

  return known[`${approvalPolicy}|${sandboxMode}`]
    ?? `Aprovação "${approvalPolicy}", sandbox "${sandboxMode}"`
}

function putString(target, key, value) {
  if (typeof value === 'string' && value.trim()) {
    target[key] = value.trim()
  }
}

function toResetCredit(credit) {
  return {
    id: typeof credit?.id === 'string' ? credit.id : null,
    resetType: typeof credit?.resetType === 'string' ? credit.resetType : null,
    title: typeof credit?.title === 'string' ? credit.title : null,
    description: typeof credit?.description === 'string' ? credit.description : null,
    status: typeof credit?.status === 'string' ? credit.status : 'unknown',
    grantedAt: toIsoFromEpochSeconds(credit?.grantedAt),
    expiresAt: toIsoFromEpochSeconds(credit?.expiresAt),
  }
}

function toRateLimitMetrics(rateLimits) {
  const metrics = []

  for (const [key, window] of [
    ['primary', rateLimits?.primary],
    ['secondary', rateLimits?.secondary],
  ]) {
    const used = toFiniteNumber(window?.usedPercent)
    if (used === null) {
      continue
    }

    metrics.push({
      key: `rate_limits.${key}`,
      label: describeRateLimitWindow(window?.windowDurationMins, key),
      used,
      limit: 100,
      remaining: Math.max(0, Math.round((100 - used) * 100) / 100),
      unit: '%',
      precision: 'reported',
      resetAt: toIsoFromEpochSeconds(window?.resetsAt),
    })
  }

  const credits = rateLimits?.credits
  if (credits?.unlimited !== true) {
    const balance = toFiniteNumber(credits?.balance)
    if (balance !== null) {
      metrics.push({
        key: 'credits',
        label: 'Créditos avulsos',
        used: null,
        limit: null,
        remaining: balance,
        unit: null,
        precision: 'reported',
        resetAt: null,
      })
    }
  }

  return metrics
}

function describeRateLimitWindow(minutes, fallbackKey) {
  const value = toFiniteNumber(minutes)
  if (value === null || value <= 0) {
    return fallbackKey === 'primary' ? 'Janela principal' : 'Janela secundária'
  }

  if (value % (60 * 24) === 0) {
    const days = value / (60 * 24)
    return days === 1 ? 'Últimas 24 h' : `Últimos ${days} dias`
  }

  if (value % 60 === 0) {
    const hours = value / 60
    return hours === 1 ? 'Última 1 h' : `Últimas ${hours} h`
  }

  return `Últimos ${value} min`
}

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null
  }

  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : null
}

function normalizeOptionalId(value) {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()
  return normalized && normalized.length <= 256 && !/[\u0000-\u001f\u007f]/.test(normalized)
    ? normalized
    : null
}

function normalizeConsumeOutcome(value) {
  return new Set(['reset', 'nothingToReset', 'noCredit', 'alreadyRedeemed']).has(value)
    ? value
    : null
}

function consumeOutcomeMessage(outcome) {
  switch (outcome) {
    case 'reset':
      return 'Reset aplicado com sucesso.'
    case 'alreadyRedeemed':
      return 'Este reset já havia sido aplicado nesta tentativa.'
    case 'nothingToReset':
      return 'Não há uma janela de uso elegível para reset agora.'
    case 'noCredit':
      return 'Este crédito de reset não está mais disponível.'
    default:
      return 'A CLI não confirmou o resultado do uso do reset.'
  }
}

function toIsoFromEpochSeconds(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? new Date(value * 1000).toISOString()
    : null
}

const queryCodexRateLimits = createCodexRateLimitsQuery()
const consumeCodexRateLimitReset = createCodexRateLimitResetConsumer()

module.exports = {
  SESSION_ONLY_STATUS_FIELDS,
  buildCodexStatusDetails,
  consumeCodexRateLimitReset,
  createCodexRateLimitResetConsumer,
  createCodexRateLimitsQuery,
  describeCodexPermissions,
  queryCodexRateLimits,
}
