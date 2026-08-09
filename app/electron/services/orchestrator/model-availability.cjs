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
    // Só o escopo do modelo. Um limite cli-wide (o de uso da Claude, por
    // exemplo) vale para todos os modelos do provedor e expira pelo próprio
    // cooldown — apagá-lo aqui faria o sucesso de um modelo "liberar" outro
    // que continua esgotado, e o seletor voltaria a escolhê-lo só para tomar
    // o mesmo erro, queimando turnos em vez de migrar de provedor.
    for (const key of createAvailabilityKeys(model, resolvedCliType, 'model')) {
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

// A CLI da Claude sempre anuncia o horário de reset neste fuso ("resets 4:40pm
// (America/Sao_Paulo)"), então o cálculo tem que fixar esse fuso — nunca o do
// processo Node. `Date#setHours` opera no fuso local do processo, o que
// funcionava por acidente em quem desenvolve em UTC-3 e quebrava em qualquer
// CI rodando em UTC, com o horário de reset saindo 3h adiantado.
const RESET_TIME_ZONE = 'America/Sao_Paulo'

/**
 * Timestamp da próxima ocorrência de `hour:minute` no fuso `timeZone`, a
 * partir de `nowMs`. Rola para o dia seguinte quando o horário já passou hoje.
 *
 * Calcula por tentativa e ajuste em vez de aritmética de offset: o deslocamento
 * de um fuso varia com horário de verão, e `Intl.DateTimeFormat` já sabe disso
 * — replicar essa tabela à mão seria reintroduzir o mesmo tipo de bug.
 */
function nextOccurrenceInTimeZone(nowMs, hour, minute, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  // Chuta meia-noite UTC do dia civil atual NO FUSO ALVO como partida — no
  // pior caso (fuso maior que -12h) o alvo cai no dia seguinte, e o loop
  // abaixo corrige.
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(nowMs)
  const ano = Number(partes.find((p) => p.type === 'year').value)
  const mes = Number(partes.find((p) => p.type === 'month').value)
  const dia = Number(partes.find((p) => p.type === 'day').value)

  for (let deltaDias = 0; deltaDias < 3; deltaDias += 1) {
    // Ponto de partida em UTC; ajustado abaixo até bater a hora local alvo.
    let candidato = Date.UTC(ano, mes - 1, dia + deltaDias, hour, minute)

    for (let tentativa = 0; tentativa < 4; tentativa += 1) {
      const [horaLocal, minutoLocal] = formatter
        .formatToParts(candidato)
        .filter((parte) => parte.type === 'hour' || parte.type === 'minute')
        .map((parte) => Number(parte.value))

      const diffMinutos = (hour - horaLocal) * 60 + (minute - minutoLocal)
      if (diffMinutos === 0) {
        break
      }
      candidato += diffMinutos * 60_000
    }

    if (candidato > nowMs) {
      return candidato
    }
  }

  // Não deveria ser alcançável (o loop de deltaDias cobre folga suficiente),
  // mas nunca devolver algo no passado é mais seguro que lançar aqui.
  return nowMs
}

function parseResetInfo(message, nowMs) {
  const match = String(message).match(
    // O "at" opcional cobre o formato que a CLI da Claude emite de fato
    // ("...will reset at 3pm"); sem ele o horário não era reconhecido e a UI
    // perdia o "Reset previsto".
    /\bresets?(?:\s+at)?\s+(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)?/i,
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

  const expiresAt = nextOccurrenceInTimeZone(nowMs, hour, minuteValue, RESET_TIME_ZONE)

  return {
    expiresAt,
    // Apara a pontuação final da frase: "...reset at 3pm." não deve virar
    // o rótulo "3pm.".
    label: match[0]
      .replace(/^resets?(?:\s+at)?\s+/i, '')
      .replace(/[.,;:]+$/, '')
      .trim(),
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
