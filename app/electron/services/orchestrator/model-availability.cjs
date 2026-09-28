const {
  CLAUDE_LIMIT_COOLDOWN_MS,
  DEFAULT_LIMIT_COOLDOWN_MS,
  NO_LOGIN_RETRY_MS,
} = require('../accounts/account-chain-constants.cjs')
const { classifyFailure } = require('../accounts/failure-taxonomy.cjs')
const { parseResetFromText } = require('../accounts/reset-time.cjs')

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

/**
 * Adaptador da taxonomia única (`accounts/failure-taxonomy.cjs`) para o
 * registro de disponibilidade do orquestrador. A assinatura e o formato do
 * resultado continuam os de antes; a decisão de classe é da taxonomia, na
 * origem `fluxo` (erro de execução one-shot):
 *
 * - limite → `limit_reached`, com o escopo da regra de sempre, mas o limite
 *   de um modelo (Codex "usage limit for ‹modelo›") fica no modelo;
 * - cobrança → `limit_reached` de CLI inteira, motivo "Sem crédito";
 * - login → `no_login` com prazo (`NO_LOGIN_RETRY_MS`), para a CLI não ficar
 *   fora até reiniciar o app; 403 (ambíguo) não muda nada;
 * - capacidade do servidor → `limit_reached` só do modelo, motivo
 *   "Capacidade do servidor": preserva a troca de modelo;
 * - servidor, rede, tempo, cancelado e desconhecido → `null`. Um "429"
 *   solto ("line 429") deixou de ser limite.
 */
function detectAvailabilityIssue({ message, cliType, nowMs = Date.now() } = {}) {
  const text = String(message ?? '').trim()

  if (!text) {
    return null
  }

  const failure = classifyFailure({ text, origin: 'fluxo', providerId: cliType })
  return availabilityFromFailure(failure, { text, cliType, nowMs })
}

/**
 * Resumo da falha de um evento de erro para quem está fora do processo
 * principal (o chat): a classe da taxonomia e o status de disponibilidade que
 * o orquestrador aplicaria. Só classe e status — nunca o texto do erro.
 *
 * @param {{ message?: unknown, cliType?: string, nowMs?: number }} [input]
 * @returns {{ failureClass: string, availabilityStatus: 'limit_reached' | 'no_login' | null }}
 */
function describeCliFailure({ message, cliType, nowMs = Date.now() } = {}) {
  const text = String(message ?? '').trim()
  const failure = classifyFailure({ text, origin: 'fluxo', providerId: cliType })
  const issue = text ? availabilityFromFailure(failure, { text, cliType, nowMs }) : null

  return {
    failureClass: failure.failureClass,
    availabilityStatus: issue?.status ?? null,
  }
}

function availabilityFromFailure(failure, { text, cliType, nowMs }) {
  if (failure.failureClass === 'auth') {
    return failure.ambiguous
      ? null
      : {
          status: 'no_login',
          scope: 'cli',
          reason: `Autenticacao indisponivel: ${createTextPreview(text)}`,
          expiresAt: nowMs + NO_LOGIN_RETRY_MS,
        }
  }

  if (failure.failureClass === 'billing') {
    return createLimitIssue({ text, cliType, nowMs, scope: 'cli', reason: `Sem crédito: ${createTextPreview(text)}` })
  }

  if (failure.failureClass === 'limit') {
    const scope = failure.scope === 'model'
      ? 'model'
      : shouldTreatLimitAsCliWide(text.toLowerCase(), cliType) ? 'cli' : 'model'
    return createLimitIssue({ text, cliType, nowMs, scope, reason: `Limite detectado pela CLI: ${createTextPreview(text)}` })
  }

  if (failure.failureClass === 'provider' && failure.capacity) {
    return createLimitIssue({
      text,
      cliType,
      nowMs,
      scope: 'model',
      reason: `Capacidade do servidor: ${createTextPreview(text)}`,
    })
  }

  return null
}

function createLimitIssue({ text, cliType, nowMs, scope, reason }) {
  const resetInfo = parseResetInfo(text, nowMs, { cliType })
  const cooldownMs = cliType === 'claude' ? CLAUDE_LIMIT_COOLDOWN_MS : DEFAULT_LIMIT_COOLDOWN_MS

  return {
    status: 'limit_reached',
    scope,
    reason,
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

function shouldTreatLimitAsCliWide(normalizedText, cliType) {
  return (
    cliType === 'claude' ||
    normalizedText.includes('usage limit') ||
    normalizedText.includes('out of extra usage') ||
    normalizedText.includes('quota exceeded') ||
    normalizedText.includes('exceeded your current quota')
  )
}

// Fuso de reserva para um horário de reset do Claude impresso SEM fuso
// ("resets 4:40pm"). Quando a CLI imprime o fuso entre parênteses, ele vence
// (`reset-time.cjs`). A reserva fixa existe porque o cálculo antigo usava
// Date#setHours no fuso do processo e quebrava em qualquer CI em UTC; vale só
// para o Claude (e para quem chama sem dizer a CLI, como antes). As demais
// CLIs imprimem no fuso da máquina, que é o fuso local.
//
// Limitação registrada: o Claude Code 2.1.283 formata "continuing
// automatically at ‹hora›" no fuso local da máquina, sem imprimir o fuso; fora
// de America/Sao_Paulo esta reserva erra pela diferença de fuso. Quem chama
// `parseResetFromText` sem reserva (o caso do terminal) lê no fuso local.
const RESET_TIME_ZONE = 'America/Sao_Paulo'

/**
 * Horário de reset impresso na mensagem, no formato do registro:
 * `{ expiresAt, label }`, ou null. Delega ao leitor único
 * (`accounts/reset-time.cjs`).
 *
 * @param {string} message
 * @param {number} nowMs
 * @param {{ cliType?: string }} [options]
 */
function parseResetInfo(message, nowMs, options = {}) {
  const cliType = options.cliType
  const reset = parseResetFromText(message, {
    nowMs,
    fallbackTimeZone: cliType && cliType !== 'claude' ? undefined : RESET_TIME_ZONE,
  })

  return reset ? { expiresAt: reset.resetAtMs, label: reset.label } : null
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
  describeCliFailure,
  detectAvailabilityIssue,
  parseResetInfo,
}
