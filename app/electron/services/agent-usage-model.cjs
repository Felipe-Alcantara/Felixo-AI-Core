'use strict'

const crypto = require('node:crypto')

const VALID_SAMPLE_STATUSES = new Set([
  'current',
  'stale',
  'unavailable',
  'error',
])
const VALID_SOURCE_KINDS = new Set([
  'cli-command',
  'assisted-event',
  'local-execution',
  'manual',
  'unsupported',
])
const SAFE_METADATA_KEYS = new Set([
  'authStatus',
  'method',
  'plan',
  'organization',
  'identityMatched',
  'identityAmbiguous',
  'lastKnownAt',
  'lastKnownSource',
  'limitation',
  'window',
  'precision',
  'providerVersion',
])
const SECRET_PATTERN =
  /(api[_ -]?key|access[_ -]?token|auth[_ -]?token|bearer|cookie|password|secret|sk-[a-z0-9]|pk-[a-z0-9])/i

function normalizeAccountInput(account, { requireId = true } = {}) {
  if (!account || typeof account !== 'object') {
    throw new Error('Conta de agente invalida.')
  }

  const id = cleanString(account.id, 120)
  const providerId = cleanString(account.providerId, 40)
  const label = cleanString(account.label, 80)

  if (requireId && !id) {
    throw new Error('ID da conta de agente invalido.')
  }

  if (!providerId) {
    throw new Error('Provider da conta de agente invalido.')
  }

  if (!label) {
    throw new Error('Nome da conta de agente invalido.')
  }

  return {
    ...(id ? { id } : {}),
    providerId,
    label,
    identityKey: normalizeIdentityKey(account.identityKey),
    identityDisplay: cleanString(account.identityDisplay, 120) || null,
    identitySource: normalizeIdentitySource(account.identitySource),
    createdAt: normalizeIso(account.createdAt),
    updatedAt: normalizeIso(account.updatedAt),
  }
}

function normalizeUsageSample(sample) {
  if (!sample || typeof sample !== 'object') {
    throw new Error('Amostra de uso invalida.')
  }

  const id = cleanString(sample.id, 120)
  const accountId = cleanString(sample.accountId, 120)
  const status = cleanString(sample.status, 20)
  const sourceKind = cleanString(sample.sourceKind, 30)
  const sourceLabel = cleanString(sample.sourceLabel, 160)
  const collectedAt = normalizeIso(sample.collectedAt)

  if (!id || !accountId) {
    throw new Error('Amostra de uso sem identificador.')
  }

  if (!VALID_SAMPLE_STATUSES.has(status)) {
    throw new Error('Status da amostra de uso invalido.')
  }

  if (!VALID_SOURCE_KINDS.has(sourceKind) || !sourceLabel || !collectedAt) {
    throw new Error('Fonte da amostra de uso invalida.')
  }

  return {
    id,
    accountId,
    status,
    sourceKind,
    sourceLabel,
    sourceCommand: cleanString(sample.sourceCommand, 160) || null,
    sourceUrl: normalizeUrl(sample.sourceUrl),
    collectedAt,
    metrics: normalizeMetrics(sample.metrics),
    observedIdentityKey: normalizeIdentityKey(sample.observedIdentityKey),
    observedIdentityDisplay: cleanString(sample.observedIdentityDisplay, 120) || null,
    errorMessage: cleanSafeMessage(sample.errorMessage),
    metadata: normalizeMetadata(sample.metadata),
  }
}

function normalizeMetrics(metrics) {
  if (!Array.isArray(metrics)) {
    return []
  }

  const normalized = []
  const seenKeys = new Set()

  for (const metric of metrics) {
    if (!metric || typeof metric !== 'object') {
      continue
    }

    const key = cleanString(metric.key, 60)
    const label = cleanString(metric.label, 100)

    if (!key || !label || seenKeys.has(key)) {
      continue
    }

    const normalizedMetric = {
      key,
      label,
      used: normalizeNumber(metric.used),
      limit: normalizeNumber(metric.limit),
      remaining: normalizeNumber(metric.remaining),
      unit: cleanString(metric.unit, 30) || null,
      precision: cleanString(metric.precision, 30) || 'unknown',
      resetAt: normalizeTimestamp(metric.resetAt),
    }

    if (
      normalizedMetric.used === null &&
      normalizedMetric.limit === null &&
      normalizedMetric.remaining === null
    ) {
      continue
    }

    seenKeys.add(key)
    normalized.push(normalizedMetric)
  }

  return normalized.slice(0, 24)
}

function normalizeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {}
  }

  const normalized = {}

  for (const [key, value] of Object.entries(metadata)) {
    if (!SAFE_METADATA_KEYS.has(key) || SECRET_PATTERN.test(key)) {
      continue
    }

    if (typeof value === 'string') {
      if (SECRET_PATTERN.test(value)) {
        continue
      }
      normalized[key] = value.slice(0, 240)
      continue
    }

    if (typeof value === 'boolean' || typeof value === 'number') {
      if (Number.isFinite(value)) {
        normalized[key] = value
      }
    }
  }

  return normalized
}

function normalizeNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null
  }

  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) && number >= 0 ? number : null
}

function normalizeIso(value) {
  const timestamp = normalizeTimestamp(value)
  return timestamp
}

function normalizeTimestamp(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString()
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const milliseconds = value > 1e12 ? value : value * 1000
    const date = new Date(milliseconds)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }

  if (typeof value !== 'string' || !value.trim()) {
    return null
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function normalizeUrl(value) {
  const url = cleanString(value, 500)

  if (!url) {
    return null
  }

  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' ? parsed.toString() : null
  } catch {
    return null
  }
}

function normalizeIdentityKey(value) {
  if (typeof value !== 'string') {
    return null
  }

  const identityKey = value.trim().toLowerCase()
  return /^[a-f0-9]{64}$/.test(identityKey) ? identityKey : null
}

function normalizeIdentitySource(value) {
  return value === 'cli' || value === 'manual' ? value : null
}

function cleanString(value, maxLength) {
  if (typeof value !== 'string') {
    return ''
  }

  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, maxLength)
}

function cleanSafeMessage(value) {
  const message = cleanString(value, 500)
  return message && !SECRET_PATTERN.test(message) ? message : message ? 'Falha sem detalhes seguros.' : null
}

function createIdentityFingerprint(providerId, identity) {
  const normalizedIdentity = normalizeIdentity(identity)

  if (!normalizedIdentity) {
    return null
  }

  return {
    identityKey: crypto
      .createHash('sha256')
      .update(`${providerId}:${normalizedIdentity}`, 'utf8')
      .digest('hex'),
    identityDisplay: maskIdentity(identity),
  }
}

function normalizeIdentity(identity) {
  return typeof identity === 'string' ? identity.trim().toLowerCase() : ''
}

function maskIdentity(identity) {
  const value = cleanString(identity, 160)

  if (!value) {
    return null
  }

  const emailMatch = /^(.)([^@]*)@([^@]+)$/.exec(value)
  if (emailMatch) {
    const local = emailMatch[1]
    const domain = emailMatch[3]
    return `${local}***@${domain}`
  }

  if (value.length > 12) {
    return `${value.slice(0, 6)}…${value.slice(-4)}`
  }

  if (value.length > 4) {
    return `${value.slice(0, 2)}…${value.slice(-2)}`
  }

  return 'identidade informada pela CLI'
}

function sampleHasMetrics(sample) {
  return Array.isArray(sample?.metrics) && sample.metrics.length > 0
}

function cloneValue(value) {
  return value === undefined ? value : JSON.parse(JSON.stringify(value))
}

module.exports = {
  VALID_SAMPLE_STATUSES,
  VALID_SOURCE_KINDS,
  cloneValue,
  createIdentityFingerprint,
  maskIdentity,
  normalizeAccountInput,
  normalizeIdentity,
  normalizeMetrics,
  normalizeNumber,
  normalizeSample: normalizeUsageSample,
  normalizeTimestamp,
  sampleHasMetrics,
}
