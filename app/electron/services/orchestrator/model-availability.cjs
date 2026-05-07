const DEFAULT_RATE_LIMIT_COOLDOWN_MS = 15 * 60 * 1000
const CLAUDE_USAGE_LIMIT_COOLDOWN_MS = 5 * 60 * 60 * 1000

function createModelAvailabilityRegistry(options = {}) {
  const entries = new Map()
  const now = options.now ?? (() => Date.now())
  const listeners = new Set()

  function subscribe(listener) {
    if (typeof listener !== 'function') {
      return () => {}
    }
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  function notify(event) {
    for (const listener of listeners) {
      try {
        listener(event)
      } catch {
        // Listener errors must not break availability bookkeeping.
      }
    }
  }

  function recordCliEvent({ cliEvent, cliType, model } = {}) {
    if (!cliEvent || typeof cliEvent !== 'object') {
      return null
    }

    if (cliEvent.type === 'error') {
      return recordError({
        message: cliEvent.message,
        cliType: cliType ?? model?.cliType,
        model,
      })
    }

    if (cliEvent.type === 'done') {
      clearForModel(model, cliType)
    }

    return null
  }

  function recordError({ message, cliType, model } = {}) {
    const issue = detectAvailabilityIssue({
      message,
      cliType: cliType ?? model?.cliType,
      nowMs: getNowMs(now),
    })

    if (!issue) {
      return null
    }

    const entry = {
      ...issue,
      modelId: model?.id,
      modelName: model?.name,
      cliType: cliType ?? model?.cliType,
      updatedAt: getNowMs(now),
    }

    const keys = createAvailabilityKeys(model, cliType ?? model?.cliType, issue.scope)
    const wasNew = keys.some((key) => !entries.has(key))

    for (const key of keys) {
      entries.set(key, entry)
    }

    if (wasNew) {
      notify({
        type: 'limited',
        status: entry.status,
        scope: entry.scope,
        cliType: entry.cliType,
        modelId: entry.modelId,
        modelName: entry.modelName,
        reason: entry.reason,
        resetLabel: entry.resetLabel,
        expiresAt: entry.expiresAt,
      })
    }

    return entry
  }

  function getModelAvailability(model) {
    pruneExpired()

    if (!model || typeof model !== 'object') {
      return { status: 'available' }
    }

    const keys = createAvailabilityKeys(model, model.cliType, 'all')
    const entry = keys
      .map((key) => entries.get(key))
      .filter(Boolean)
      .sort(compareAvailabilityEntries)[0]

    return entry ?? { status: 'available' }
  }

  function isModelAvailable(model) {
    return getModelAvailability(model).status === 'available'
  }

  function getSnapshot() {
    pruneExpired()

    const snapshot = {}

    for (const [key, entry] of entries) {
      snapshot[key] = {
        status: entry.status,
        reason: entry.reason,
        resetLabel: entry.resetLabel,
        expiresAt: entry.expiresAt,
        cliType: entry.cliType,
        modelId: entry.modelId,
        modelName: entry.modelName,
      }
    }

    return snapshot
  }

  function clearForModel(model, cliType) {
    const resolvedCliType = cliType ?? model?.cliType
    let cleared = false
    for (const key of createAvailabilityKeys(model, resolvedCliType, 'all')) {
      if (entries.delete(key)) {
        cleared = true
      }
    }

    if (cleared) {
      notify({
        type: 'available',
        cliType: resolvedCliType,
        modelId: model?.id,
        modelName: model?.name,
      })
    }
  }

  function pruneExpired() {
    const nowMs = getNowMs(now)

    for (const [key, entry] of entries) {
      if (entry.expiresAt && entry.expiresAt <= nowMs) {
        entries.delete(key)
      }
    }
  }

  return {
    clearForModel,
    getModelAvailability,
    getSnapshot,
    isModelAvailable,
    recordCliEvent,
    recordError,
    subscribe,
  }
}

function detectAvailabilityIssue({ message, cliType, nowMs = Date.now() } = {}) {
  const text = String(message ?? '').trim()

  if (!text) {
    return null
  }

  const normalizedText = text.toLowerCase()

  if (isAuthError(normalizedText)) {
    return {
      status: 'no_login',
      scope: 'cli',
      reason: `Autenticacao indisponivel: ${createTextPreview(text)}`,
    }
  }

  if (!isLimitError(normalizedText)) {
    return null
  }

  const resetInfo = parseResetInfo(text, nowMs)
  const cooldownMs = resetInfo
    ? Math.max(resetInfo.expiresAt - nowMs, 0)
    : cliType === 'claude'
      ? CLAUDE_USAGE_LIMIT_COOLDOWN_MS
      : DEFAULT_RATE_LIMIT_COOLDOWN_MS

  return {
    status: 'limit_reached',
    scope: shouldTreatLimitAsCliWide(normalizedText, cliType) ? 'cli' : 'model',
    reason: `Limite detectado pela CLI: ${createTextPreview(text)}`,
    resetLabel: resetInfo?.label,
    expiresAt: resetInfo?.expiresAt ?? nowMs + cooldownMs,
  }
}

function createAvailabilityKeys(model, cliType, scope) {
  const keys = []
  const normalizedCliType = typeof cliType === 'string' && cliType ? cliType : ''

  if ((scope === 'model' || scope === 'all') && model?.id) {
    keys.push(`model:${model.id}`)
  }

  if ((scope === 'model' || scope === 'all') && normalizedCliType && model?.providerModel) {
    keys.push(`provider:${normalizedCliType}:${model.providerModel}`)
  }

  if ((scope === 'cli' || scope === 'all') && normalizedCliType) {
    keys.push(`cli:${normalizedCliType}`)
  }

  if (scope === 'all' && normalizedCliType) {
    keys.push(normalizedCliType)
  }

  return keys
}

function compareAvailabilityEntries(left, right) {
  return getAvailabilityPriority(left.status) - getAvailabilityPriority(right.status)
}

function getAvailabilityPriority(status) {
  if (status === 'limit_reached') {
    return 0
  }

  if (status === 'no_login') {
    return 1
  }

  if (status === 'error') {
    return 2
  }

  return 3
}

function isLimitError(normalizedText) {
  return (
    normalizedText.includes('out of extra usage') ||
    normalizedText.includes('usage limit') ||
    normalizedText.includes('rate limit') ||
    normalizedText.includes('too many requests') ||
    normalizedText.includes('quota exceeded') ||
    normalizedText.includes('exceeded your current quota') ||
    normalizedText.includes('resource exhausted') ||
    /\b429\b/.test(normalizedText)
  )
}

function isAuthError(normalizedText) {
  return (
    normalizedText.includes('not logged in') ||
    normalizedText.includes('please login') ||
    normalizedText.includes('please log in') ||
    normalizedText.includes('authentication failed') ||
    normalizedText.includes('unauthorized') ||
    normalizedText.includes('invalid api key') ||
    /\b401\b/.test(normalizedText)
  )
}

function shouldTreatLimitAsCliWide(normalizedText, cliType) {
  return (
    cliType === 'claude' ||
    normalizedText.includes('usage limit') ||
    normalizedText.includes('out of extra usage') ||
    normalizedText.includes('quota exceeded') ||
    normalizedText.includes('exceeded your current quota')
  )
}

function parseResetInfo(message, nowMs) {
  const match = String(message).match(
    /\bresets?\s+(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)?/i,
  )

  if (!match) {
    return null
  }

  const hourValue = Number.parseInt(match[1], 10)
  const minuteValue = match[2] ? Number.parseInt(match[2], 10) : 0
  const meridiem = match[3]?.toLowerCase().replaceAll('.', '')

  if (
    !Number.isInteger(hourValue) ||
    hourValue < 0 ||
    hourValue > 23 ||
    !Number.isInteger(minuteValue) ||
    minuteValue < 0 ||
    minuteValue > 59
  ) {
    return null
  }

  let hour = hourValue

  if (meridiem === 'pm' && hour < 12) {
    hour += 12
  }

  if (meridiem === 'am' && hour === 12) {
    hour = 0
  }

  const resetDate = new Date(nowMs)
  resetDate.setHours(hour, minuteValue, 0, 0)

  if (resetDate.getTime() <= nowMs) {
    resetDate.setDate(resetDate.getDate() + 1)
  }

  return {
    expiresAt: resetDate.getTime(),
    label: match[0].replace(/^resets?\s+/i, '').trim(),
  }
}

function createTextPreview(value, maxLength = 240) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()

  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
}

function getNowMs(now) {
  const value = now()

  if (value instanceof Date) {
    return value.getTime()
  }

  return Number(value)
}

module.exports = {
  createModelAvailabilityRegistry,
  detectAvailabilityIssue,
  parseResetInfo,
}
