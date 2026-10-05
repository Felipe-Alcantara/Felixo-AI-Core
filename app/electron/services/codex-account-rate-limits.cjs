'use strict'

const { randomUUID } = require('node:crypto')
const spawnChildProcess = require('cross-spawn')
const { requestCodexAppServer } = require('./codex-app-server-client.cjs')

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
// Balde principal quando a resposta não diz qual é (payload antigo).
const DEFAULT_LIMIT_ID = 'codex'
const SAFE_LIMIT_ID_PATTERN = /^[A-Za-z0-9_.-]{1,40}$/

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
      accountEnv,
      timeoutMs,
      clientVersion,
      // Só a leitura aceita cancelamento; o consumo de reset nunca é
      // abortado no meio.
      signal,
      method: 'account/rateLimits/read',
      params: null,
      timeoutMessage: 'A consulta de resets do Codex excedeu o tempo limite.',
      failureResult: () => ({
        collectedAt: null,
        availableCount: null,
        credits: [],
      }),
      serverErrorMessage: 'O app-server do Codex recusou a consulta de limites.',
      normalizeResult: (result) => normalizeCodexRateLimitsResult(result, { now }),
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

/**
 * Resposta de `account/rateLimits/read` no formato do painel: janelas como
 * métricas, resets bancados em `details.usageCredits`.
 *
 * @param {object} result
 * @param {{ now?: () => number }} [options]
 */
function normalizeCodexRateLimitsResult(result, { now = () => Date.now() } = {}) {
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
    metrics: toRateLimitMetrics(result),
    availableCount,
    credits,
    details: {
      usageCredits: { availableCount, credits },
    },
    message: null,
  }
}

/**
 * Janelas de uso publicadas pelo app-server.
 *
 * `rateLimits` é o balde principal da conta, com as chaves de sempre
 * (`rate_limits.primary/secondary`). `rateLimitsByLimitId` traz também os
 * outros baldes — em 02/10/2026 (Codex 0.156.1), a reserva semanal de um
 * modelo, que o /status chama de "Luna Reserve Weekly limit". Esses saem com
 * `scope: 'model'`: valem só para aquele modelo, e a cadeia de contas não pode
 * concluir que a conta inteira acabou porque um deles zerou.
 */
function toRateLimitMetrics(result) {
  const main = result?.rateLimits ?? null
  const metrics = toWindowMetrics(main, { keyPrefix: 'rate_limits' })

  const mainLimitId = typeof main?.limitId === 'string' ? main.limitId : DEFAULT_LIMIT_ID
  const buckets =
    result?.rateLimitsByLimitId && typeof result.rateLimitsByLimitId === 'object'
      ? result.rateLimitsByLimitId
      : {}
  for (const [limitId, bucket] of Object.entries(buckets)) {
    if (limitId === mainLimitId || !SAFE_LIMIT_ID_PATTERN.test(limitId)) {
      continue
    }
    metrics.push(
      ...toWindowMetrics(bucket, {
        keyPrefix: `rate_limits.${limitId}`,
        scope: 'model',
        title: describeLimitBucket(bucket, limitId),
      }),
    )
  }

  const individualLimit = toIndividualLimitMetric(main?.individualLimit)
  if (individualLimit) {
    metrics.push(individualLimit)
  }

  const credits = main?.credits
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

function toWindowMetrics(snapshot, { keyPrefix, scope = null, title = null }) {
  const metrics = []

  for (const [key, window] of [
    ['primary', snapshot?.primary],
    ['secondary', snapshot?.secondary],
  ]) {
    const used = toFiniteNumber(window?.usedPercent)
    if (used === null) {
      continue
    }

    const windowLabel = describeRateLimitWindow(window?.windowDurationMins, key)
    metrics.push({
      key: `${keyPrefix}.${key}`,
      label: title ? `${windowLabel} · ${title}` : windowLabel,
      used,
      limit: 100,
      remaining: Math.max(0, Math.round((100 - used) * 100) / 100),
      unit: '%',
      precision: 'reported',
      resetAt: toIsoFromEpochSeconds(window?.resetsAt),
      ...(scope ? { scope } : {}),
    })
  }

  return metrics
}

/** "gpt-reserve (gpt-5.6-luna)": o nome do limite e o modelo que ele cobre. */
function describeLimitBucket(bucket, limitId) {
  const name = cleanLabelPart(bucket?.limitName) ?? cleanLabelPart(limitId)
  const model = cleanLabelPart(bucket?.normalModelSlug)
  return model && model !== name ? `${name} (${model})` : name
}

/**
 * Limite de gasto individual de um membro de workspace. A CLI publica o
 * percentual restante e o reset; os valores em dinheiro ficam nos detalhes.
 */
function toIndividualLimitMetric(individualLimit) {
  const remaining = toFiniteNumber(individualLimit?.remainingPercent)
  if (remaining === null) {
    return null
  }

  const clamped = Math.min(100, Math.max(0, remaining))
  return {
    key: 'spend_control.individual',
    label: 'Limite de gasto individual',
    used: Math.round((100 - clamped) * 100) / 100,
    limit: 100,
    remaining: clamped,
    unit: '%',
    precision: 'reported',
    resetAt: toIsoFromEpochSeconds(individualLimit?.resetsAt),
  }
}

function cleanLabelPart(value) {
  if (typeof value !== 'string') {
    return null
  }
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 40)
  return cleaned || null
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
  consumeCodexRateLimitReset,
  createCodexRateLimitResetConsumer,
  createCodexRateLimitsQuery,
  normalizeCodexRateLimitsResult,
  queryCodexRateLimits,
}
