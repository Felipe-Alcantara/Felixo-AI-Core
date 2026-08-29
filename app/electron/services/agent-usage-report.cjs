'use strict'

const {
  parseCodexAccountStatus,
  redactSecrets,
} = require('./official-cli-account-status.cjs')
const {
  createIdentityFingerprint,
  normalizeNumber,
  normalizeTimestamp,
} = require('./agent-usage-model.cjs')

const USAGE_VALUE_KEYS = [
  'used',
  'consumed',
  'current',
  'usage',
  'used_count',
  'usedCount',
]
const USAGE_LIMIT_KEYS = [
  'limit',
  'max',
  'maximum',
  'allowed',
  'quota',
  'total',
]
const USAGE_REMAINING_KEYS = [
  'remaining',
  'left',
  'available',
  'remaining_count',
  'remainingCount',
]
const RESET_KEYS = ['reset_at', 'resetAt', 'resets_at', 'resetsAt', 'reset']

/**
 * Extrai somente dados que as CLIs publicaram como estado de autenticação ou
 * uso. O texto de saída é recebido já sem credenciais; ainda assim os campos
 * persistidos pelo chamador são apenas os retornados por este módulo.
 */
function parseAgentAuth(providerId, output) {
  const safeOutput = redactSecrets(String(output ?? '')).trim()
  const payload = parseStructuredPayload(safeOutput)

  if (providerId === 'codex') {
    const status = parseCodexAccountStatus(safeOutput)
    return createAuthSnapshot(providerId, {
      authStatus: status.authStatus,
      method: status.method,
      account: status.account,
      plan: status.plan,
      organization: status.organization,
    })
  }

  if (providerId === 'claude') {
    const loggedIn = firstBoolean(payload, ['loggedIn', 'logged_in'])
    const identity = firstString(payload, [
      'email',
      'account',
      'username',
      'user.email',
      'user.id',
      'orgId',
    ])

    return createAuthSnapshot(providerId, {
      authStatus:
        loggedIn === true
          ? 'logged_in'
          : loggedIn === false
            ? 'logged_out'
            : inferAuthStatusFromText(safeOutput),
      method: firstString(payload, ['authMethod', 'auth_method']),
      account: identity,
      plan: firstString(payload, ['subscriptionType', 'subscription_type', 'plan']),
      organization: firstString(payload, ['orgName', 'organization', 'organizationName']),
    })
  }

  if (providerId === 'openia') {
    const configured = firstBoolean(payload, ['configured'])
    const storedKeys = normalizeNumber(payload?.storedKeys ?? payload?.stored_keys)
    const active = firstString(payload, ['active', 'activeKey', 'active_key'])

    return createAuthSnapshot(providerId, {
      authStatus:
        configured === true || (storedKeys !== null && storedKeys > 0)
          ? 'logged_in'
          : configured === false
            ? 'logged_out'
            : 'unknown',
      method: 'OpenRouter key store',
      account: active,
    })
  }

  return createAuthSnapshot(providerId, {
    authStatus: inferAuthStatusFromText(safeOutput),
  })
}

/**
 * Lê formatos de rate limit que já apareceram nas fontes oficiais: o objeto
 * `rate_limits` da status line do Claude e objetos de quota/limite estruturados.
 * Ausência de um campo permanece `null`; zero é um valor válido e nunca vira
 * "desconhecido".
 */
function parseAgentUsage(providerId, output) {
  const safeOutput = redactSecrets(String(output ?? '')).trim()

  if (providerId === 'openia') {
    return { metrics: parseOpeniaCredits(safeOutput) }
  }

  const payload = parseStructuredPayload(safeOutput)

  if (!payload) {
    return { metrics: [] }
  }

  const metrics = []
  walkUsagePayload(payload, [], metrics)

  const seenKeys = new Set()
  return {
    providerId,
    metrics: metrics.filter((metric) => {
      if (seenKeys.has(metric.key)) {
        return false
      }
      seenKeys.add(metric.key)
      return true
    }),
  }
}

function walkUsagePayload(value, path, metrics) {
  if (!value || typeof value !== 'object') {
    return
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => walkUsagePayload(item, [...path, String(index)], metrics))
    return
  }

  const entries = Object.entries(value)
  const usedPercentage = readNumber(value, ['used_percentage', 'usedPercentage'])
  const used = readNumber(value, USAGE_VALUE_KEYS)
  const limit = readNumber(value, USAGE_LIMIT_KEYS)
  const remaining = readNumber(value, USAGE_REMAINING_KEYS)
  const resetAt = readReset(value)

  if (usedPercentage !== null) {
    const metric = createMetric(path, {
      used: usedPercentage,
      limit: 100,
      remaining: Math.max(0, 100 - usedPercentage),
      unit: '%',
      precision: 'percentage',
      resetAt,
    })
    if (metric) {
      metrics.push(metric)
    }
  } else if (hasQuotaPath(path) && (used !== null || limit !== null || remaining !== null)) {
    const metric = createMetric(path, {
      used,
      limit,
      remaining,
      unit: readUnit(value),
      precision: 'exact',
      resetAt,
    })
    if (metric) {
      metrics.push(metric)
    }
  }

  for (const [key, child] of entries) {
    if (key === 'used_percentage' || key === 'usedPercentage') {
      continue
    }
    walkUsagePayload(child, [...path, key], metrics)
  }
}

function createMetric(path, values) {
  const cleanPath = path.filter((part) => !/^\d+$/.test(part))
  const key = cleanPath.join('.') || 'usage'

  if (
    values.used === null &&
    values.limit === null &&
    values.remaining === null
  ) {
    return null
  }

  return {
    key,
    label: formatMetricLabel(cleanPath),
    used: values.used,
    limit: values.limit,
    remaining: values.remaining,
    unit: values.unit ?? null,
    precision: values.precision,
    resetAt: values.resetAt,
  }
}

function hasQuotaPath(path) {
  return path.some((part) =>
    /rate.?limit|quota|allowance|limit|request|token|credit|window/i.test(part),
  )
}

function readUnit(value) {
  const unit = firstString(value, ['unit', 'units', 'measure'])
  return unit || null
}

function readReset(value) {
  for (const key of RESET_KEYS) {
    const timestamp = normalizeTimestamp(value?.[key])
    if (timestamp) {
      return timestamp
    }
  }
  return null
}

function readNumber(value, keys) {
  for (const key of keys) {
    const number = normalizeNumber(value?.[key])
    if (number !== null) {
      return number
    }
  }
  return null
}

/**
 * Completa o estado de autenticação com o que só a leitura local sabe.
 *
 * O comando da CLI nem sempre diz qual conta está logada (o `codex login
 * status` não diz). Quando o probe local descobre isso, a identidade entra
 * aqui — pelo mesmo caminho de segurança do parser, com `isSafeIdentity` e
 * fingerprint — em vez de o serviço montar o snapshot por fora.
 */
function mergeAuthIdentity(providerId, auth, extra) {
  if (!extra || (!extra.identity && !extra.plan)) {
    return auth
  }

  return createAuthSnapshot(providerId, {
    ...auth,
    account: auth.account ?? extra.identity ?? null,
    plan: auth.plan ?? extra.plan ?? null,
  })
}

/**
 * Lê a linha do `openia statusline`:
 * `OpenRouter  usado $0.4210  ·  resta $4.58  (de $5.00)`.
 *
 * É texto porque é o que o launcher publica — ele consulta `/api/v1/credits`
 * com a chave que guarda, e a chave nunca passa por aqui. Quando não há chave
 * ou a consulta falha, o launcher responde em uma linha curta e conhecida:
 * nesse caso não existe métrica, e nada é inventado.
 */
function parseOpeniaCredits(output) {
  const values = [...output.matchAll(/\$\s*(\d+(?:[.,]\d+)?)/g)].map((match) =>
    Number(match[1].replace(',', '.')),
  )

  if (values.length < 3 || values.some((value) => !Number.isFinite(value))) {
    return []
  }

  const [used, remaining, total] = values

  return [
    {
      key: 'credits',
      label: 'Créditos da conta',
      used,
      limit: total,
      remaining,
      unit: 'US$',
      precision: 'reported',
      resetAt: null,
    },
  ]
}

function createAuthSnapshot(providerId, values) {
  const identityCandidate = values.account || values.organization || null
  const identity = isSafeIdentity(identityCandidate)
    ? identityCandidate
    : null
  const fingerprint = createIdentityFingerprint(providerId, identity)

  return {
    authStatus: values.authStatus ?? 'unknown',
    method: cleanValue(values.method),
    account: cleanValue(values.account),
    plan: cleanValue(values.plan),
    organization: cleanValue(values.organization),
    identityKey: fingerprint?.identityKey ?? null,
    identityDisplay: fingerprint?.identityDisplay ?? null,
  }
}

function isSafeIdentity(value) {
  if (typeof value !== 'string' || !value.trim() || value === '[oculto]') {
    return false
  }

  return redactSecrets(value) === value
}

function parseStructuredPayload(output) {
  if (!output) {
    return null
  }

  const candidates = [output]
  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  candidates.push(...lines.reverse())

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed
      }
    } catch {
      // A CLI can print a human-readable line before its JSON payload.
    }
  }

  return null
}

function firstBoolean(value, paths) {
  for (const path of paths) {
    const result = readPath(value, path)
    if (typeof result === 'boolean') {
      return result
    }
  }
  return null
}

function firstString(value, paths) {
  for (const path of paths) {
    const result = readPath(value, path)
    if (typeof result === 'string' && result.trim()) {
      return result.trim()
    }
  }
  return null
}

function readPath(value, path) {
  return path.split('.').reduce((current, key) => current?.[key], value)
}

function inferAuthStatusFromText(output) {
  if (/not logged|logged out|no account|unauthenticated|not authenticated/i.test(output)) {
    return 'logged_out'
  }

  if (/logged in|authenticated|connected|configured/i.test(output)) {
    return 'logged_in'
  }

  return 'unknown'
}

function cleanValue(value) {
  return typeof value === 'string' && value.trim()
    ? redactSecrets(value.trim()).slice(0, 240)
    : null
}

function formatMetricLabel(path) {
  const last = path.at(-1) || 'uso'
  const normalized = last.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ')
  const specialLabels = {
    'five hour': 'Janela de 5 horas',
    'seven day': 'Janela de 7 dias',
    daily: 'Janela diária',
    weekly: 'Janela semanal',
  }
  const lower = normalized.toLowerCase()
  return specialLabels[lower] ?? `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`
}

module.exports = {
  mergeAuthIdentity,
  parseAgentAuth,
  parseAgentUsage,
  parseStructuredPayload,
}
