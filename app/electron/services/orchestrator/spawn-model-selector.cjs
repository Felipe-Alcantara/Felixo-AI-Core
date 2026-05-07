'use strict'

// Default provider model + reasoning effort by cliType. Applied only when the
// candidate does not already specify them, so user-configured variants always win.
const CLI_TYPE_VARIANT_DEFAULTS = {
  claude: { providerModel: 'opus', reasoningEffort: 'medium' },
  codex: { providerModel: 'gpt-5.5', reasoningEffort: 'xhigh' },
  'codex-app-server': { providerModel: 'gpt-5.5', reasoningEffort: 'xhigh' },
  gemini: { providerModel: 'gemini-3-pro-preview', reasoningEffort: 'high' },
  'gemini-acp': { providerModel: 'gemini-3-pro-preview', reasoningEffort: 'high' },
}

function createOrchestrationModel(cliType) {
  return {
    id: `orchestration-${cliType}`,
    name: `Sub-agente ${cliType}`,
    command: cliType,
    source: 'orchestration',
    cliType,
  }
}

function applyVariantDefaults(model) {
  if (!model || !model.cliType) {
    return model
  }

  const defaults = CLI_TYPE_VARIANT_DEFAULTS[model.cliType]
  if (!defaults) {
    return model
  }

  const providerModel =
    typeof model.providerModel === 'string' && model.providerModel.trim()
      ? model.providerModel
      : defaults.providerModel
  const reasoningEffort =
    typeof model.reasoningEffort === 'string' && model.reasoningEffort.trim()
      ? model.reasoningEffort
      : defaults.reasoningEffort

  return { ...model, providerModel, reasoningEffort }
}

function resolveOrchestrationSpawnModel(cliType, context = {}, event = {}) {
  const availableModels = Array.isArray(context.availableModels)
    ? context.availableModels
    : null

  if (!availableModels) {
    const model = createOrchestrationModel(cliType)

    return {
      ok: true,
      model,
      modelChoice: createOrchestrationModelChoice({
        requestedCliType: cliType,
        model,
        reason:
          'Lista de modelos indisponivel no contexto; usando modelo leve padrao do cliType solicitado.',
        selectionRule: 'fallback-without-model-context',
      }),
    }
  }

  const settings = context.orchestratorSettings ?? {}
  const blockedModelIds = new Set(
    Array.isArray(settings.blockedModelIds) ? settings.blockedModelIds : [],
  )
  const preferredModelIds = Array.isArray(settings.preferredModelIds)
    ? settings.preferredModelIds
    : []
  const cliTypeModels = availableModels.filter((model) => model.cliType === cliType)
  const configuredCandidates = cliTypeModels.filter(
    (model) => !blockedModelIds.has(model.id),
  )
  const candidates = configuredCandidates.filter((model) =>
    isModelOperational(model, context.modelAvailabilityRegistry),
  )

  if (candidates.length > 0) {
    const selectedModel = selectBestSpawnModel(candidates, {
      preferredModelIds,
      requestedCliType: cliType,
      prompt: event.prompt,
    })
    const model = applyVariantDefaults({
      ...createOrchestrationModel(cliType),
      ...selectedModel,
      cliType: selectedModel.cliType,
    })
    const selectionRule = preferredModelIds.includes(selectedModel.id)
      ? 'preferred-model'
      : 'best-available-model'
    const reason = preferredModelIds.includes(selectedModel.id)
      ? 'Modelo preferido pelo usuario para este cliType.'
      : 'Melhor modelo operacional para este cliType apos aplicar bloqueios e limites detectados.'

    return {
      ok: true,
      model,
      modelChoice: createOrchestrationModelChoice({
        requestedCliType: cliType,
        model,
        reason,
        selectionRule,
        candidateCount: candidates.length,
        blockedCount: cliTypeModels.length - configuredCandidates.length,
        unavailableCount: configuredCandidates.length - candidates.length,
      }),
    }
  }

  const fallbackCandidates = availableModels.filter(
    (model) =>
      !blockedModelIds.has(model.id) &&
      model.cliType !== cliType &&
      isModelOperational(model, context.modelAvailabilityRegistry),
  )

  if (fallbackCandidates.length > 0) {
    const selectedModel = selectBestSpawnModel(fallbackCandidates, {
      preferredModelIds,
      requestedCliType: cliType,
      prompt: event.prompt,
    })
    const model = applyVariantDefaults({
      ...createOrchestrationModel(selectedModel.cliType),
      ...selectedModel,
      cliType: selectedModel.cliType,
    })
    const unavailableReason = createUnavailableReason(
      cliType,
      cliTypeModels,
      configuredCandidates,
      context.modelAvailabilityRegistry,
    )

    return {
      ok: true,
      model,
      modelChoice: createOrchestrationModelChoice({
        requestedCliType: cliType,
        model,
        reason: `${unavailableReason} Usando fallback operacional (${model.cliType}).`,
        selectionRule: 'provider-fallback',
        candidateCount: fallbackCandidates.length,
        blockedCount: cliTypeModels.length - configuredCandidates.length,
        unavailableCount: configuredCandidates.length - candidates.length,
        fallbackFromCliType: cliType,
        availabilityReason: unavailableReason,
      }),
    }
  }

  // Last-resort: nothing operational anywhere. Still try to spawn on a non-blocked
  // model even if rate-limited — the orchestrator's principle is that the task must
  // complete somehow. User-blocked models are still respected.
  const lastResortCandidates = availableModels.filter(
    (model) => !blockedModelIds.has(model.id),
  )

  if (lastResortCandidates.length > 0) {
    const selectedModel = selectBestSpawnModel(lastResortCandidates, {
      preferredModelIds,
      requestedCliType: cliType,
      prompt: event.prompt,
    })
    const model = applyVariantDefaults({
      ...createOrchestrationModel(selectedModel.cliType),
      ...selectedModel,
      cliType: selectedModel.cliType,
    })
    const availabilityReason = createUnavailableReason(
      cliType,
      cliTypeModels,
      configuredCandidates,
      context.modelAvailabilityRegistry,
    )

    return {
      ok: true,
      model,
      modelChoice: createOrchestrationModelChoice({
        requestedCliType: cliType,
        model,
        reason: `${availabilityReason} Nenhum provider operacional; usando ${model.name} mesmo com limite reportado para garantir continuidade da tarefa.`,
        selectionRule: 'last-resort',
        candidateCount: lastResortCandidates.length,
        blockedCount: availableModels.length - lastResortCandidates.length,
        unavailableCount: lastResortCandidates.length,
        fallbackFromCliType: cliType,
        availabilityReason,
      }),
    }
  }

  // Genuinely no model to spawn: nothing cadastrado or every model user-blocked.
  const reason =
    availableModels.length === 0
      ? `Nenhum modelo cadastrado no orquestrador.`
      : `Todos os modelos cadastrados estao bloqueados pelo usuario.`

  return {
    ok: false,
    message: `Nenhum modelo disponivel para spawn (cliType solicitado: "${cliType}").`,
    modelChoice: createOrchestrationModelChoice({
      requestedCliType: cliType,
      model: null,
      reason,
      selectionRule: 'unavailable',
      candidateCount: 0,
      blockedCount: availableModels.length,
      unavailableCount: 0,
    }),
  }
}

function validateOrchestrationSpawnModel(eventOrCliType, context = {}) {
  const event =
    eventOrCliType && typeof eventOrCliType === 'object'
      ? eventOrCliType
      : { cliType: eventOrCliType }
  const result = resolveOrchestrationSpawnModel(event.cliType, context, event)

  return result.ok === false
    ? {
        ok: false,
        code: 'SPAWN_MODEL_UNAVAILABLE',
        message: result.message,
      }
    : { ok: true, modelChoice: result.modelChoice, selectedModel: result.model }
}

function isModelOperational(model, registry) {
  if (!registry || typeof registry.getModelAvailability !== 'function') {
    return true
  }

  return registry.getModelAvailability(model).status === 'available'
}

function selectBestSpawnModel(candidates, options = {}) {
  return [...candidates].sort((left, right) => {
    const leftScore = scoreSpawnModel(left, options)
    const rightScore = scoreSpawnModel(right, options)

    if (leftScore !== rightScore) {
      return rightScore - leftScore
    }

    return String(left.name).localeCompare(String(right.name))
  })[0]
}

// Prefix-style regexes: leading \b only. Trailing word boundary is intentionally
// omitted so that prefixes like "analis" match "analise", "analisar", etc. after
// NFD normalization strips accents.
const CODE_PROMPT_REGEX =
  /\b(codigo|code|arquivo|file|editar|corrigir|bug|teste|test|refactor|commit|diff|pr|merge|hotfix|patch|stacktrace)\b/
const LONG_CONTEXT_PROMPT_REGEX =
  /\b(resum|sumari|contexto longo|long context|pesquis|documento grande|analise extensa|relator)/
const REASONING_PROMPT_REGEX =
  /\b(analis|raciocin|decid|comparar?|avaliar?|estrateg|arquitet|trade.?off|plano|planejar|implementac|implementar|tasklist|task.list|feature)/
const DOC_PROMPT_REGEX = /\b(documenta|markdown|formata|sumari|relator|escrev|redig)/

function scoreSpawnModel(model, { preferredModelIds = [], requestedCliType, prompt } = {}) {
  const preferredIndex = preferredModelIds.indexOf(model.id)
  const promptKind = classifySpawnPrompt(prompt)
  let score = 0

  if (preferredIndex >= 0) {
    score += 1000 - preferredIndex
  }

  if (model.cliType === requestedCliType) {
    score += 500
  }

  if (promptKind === 'code') {
    if (model.cliType === 'claude') {
      score += 100
    } else if (model.cliType === 'codex' || model.cliType === 'codex-app-server') {
      score += 75
    } else {
      score += 25
    }
  } else if (promptKind === 'long-context-doc') {
    if (model.cliType === 'gemini' || model.cliType === 'gemini-acp') {
      score += 95
    } else if (model.cliType === 'codex' || model.cliType === 'codex-app-server') {
      score += 50
    } else if (model.cliType === 'claude') {
      score += 40
    } else {
      score += 30
    }
  } else if (promptKind === 'long-context-reasoning') {
    if (model.cliType === 'codex' || model.cliType === 'codex-app-server') {
      score += 95
    } else if (model.cliType === 'gemini' || model.cliType === 'gemini-acp') {
      score += 60
    } else if (model.cliType === 'claude') {
      score += 50
    } else {
      score += 30
    }
  } else if (promptKind === 'reasoning') {
    if (model.cliType === 'codex' || model.cliType === 'codex-app-server') {
      score += 90
    } else if (model.cliType === 'claude') {
      score += 70
    } else if (model.cliType === 'gemini' || model.cliType === 'gemini-acp') {
      score += 55
    } else {
      score += 30
    }
  } else {
    if (model.cliType === 'gemini' || model.cliType === 'gemini-acp') {
      score += 55
    } else if (model.cliType === 'codex' || model.cliType === 'codex-app-server') {
      score += 50
    } else if (model.cliType === 'claude') {
      score += 45
    } else {
      score += 30
    }
  }

  // Default Claude preference: small tie-breaker bonus when user did not configure
  // explicit preferredModelIds. Intentionally smaller than cliType match (+500) and
  // task-kind bonuses, so it only resolves ties without overriding routing logic.
  if (preferredModelIds.length === 0 && model.cliType === 'claude') {
    score += 5
  }

  const providerModelLower = String(model.providerModel ?? '').toLowerCase()
  if (providerModelLower.includes('lite')) {
    score += 10
  }
  if (providerModelLower.includes('mini')) {
    score += 8
  }

  return score
}

function classifySpawnPrompt(prompt) {
  const normalizedPrompt = String(prompt ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

  if (CODE_PROMPT_REGEX.test(normalizedPrompt)) {
    return 'code'
  }

  if (LONG_CONTEXT_PROMPT_REGEX.test(normalizedPrompt)) {
    if (REASONING_PROMPT_REGEX.test(normalizedPrompt)) {
      return 'long-context-reasoning'
    }
    if (DOC_PROMPT_REGEX.test(normalizedPrompt)) {
      return 'long-context-doc'
    }
    return 'long-context-doc'
  }

  if (REASONING_PROMPT_REGEX.test(normalizedPrompt)) {
    return 'reasoning'
  }

  return 'general'
}

function createUnavailableReason(
  cliType,
  cliTypeModels,
  configuredCandidates,
  registry,
) {
  if (cliTypeModels.length === 0) {
    return `Nenhum modelo cadastrado para cliType "${cliType}".`
  }

  if (configuredCandidates.length === 0) {
    return `Todos os modelos cadastrados para cliType "${cliType}" estao bloqueados.`
  }

  const availabilityReasons = configuredCandidates
    .map((model) => {
      const availability =
        registry && typeof registry.getModelAvailability === 'function'
          ? registry.getModelAvailability(model)
          : { status: 'available' }

      if (availability.status === 'available') {
        return null
      }

      const reset = availability.resetLabel ? ` reset ${availability.resetLabel}` : ''
      return `${model.name}: ${availability.status}${reset}`
    })
    .filter(Boolean)

  if (availabilityReasons.length === 0) {
    return `Nenhum modelo operacional para cliType "${cliType}".`
  }

  return `Modelos do cliType "${cliType}" indisponiveis: ${availabilityReasons.join('; ')}.`
}

function createOrchestrationModelChoice({
  requestedCliType,
  model,
  reason,
  selectionRule,
  candidateCount,
  blockedCount,
  unavailableCount,
  fallbackFromCliType,
  availabilityReason,
}) {
  return {
    requestedCliType,
    selectedModelId: model?.id,
    selectedModelName: model?.name,
    selectedCliType: model?.cliType ?? requestedCliType,
    providerModel: model?.providerModel,
    reasoningEffort: model?.reasoningEffort,
    reason,
    selectionRule,
    candidateCount,
    blockedCount,
    unavailableCount,
    fallbackFromCliType,
    availabilityReason,
  }
}

// Static cliType priority per task category. Mirrors the bonuses used by
// scoreSpawnModel — keep them in sync. Useful for UI/diagnostic surfaces that
// need to show "preferred order for X" without iterating over actual models.
const CATEGORY_PRIORITY_ORDER = {
  code: ['claude', 'codex', 'codex-app-server', 'gemini', 'gemini-acp'],
  reasoning: ['codex', 'codex-app-server', 'claude', 'gemini', 'gemini-acp'],
  'long-context-doc': ['gemini', 'gemini-acp', 'codex', 'codex-app-server', 'claude'],
  'long-context-reasoning': ['codex', 'codex-app-server', 'gemini', 'gemini-acp', 'claude'],
  general: ['gemini', 'gemini-acp', 'codex', 'codex-app-server', 'claude'],
}

function getPriorityOrderFor(category) {
  const order = CATEGORY_PRIORITY_ORDER[category]
  return order ? [...order] : [...CATEGORY_PRIORITY_ORDER.general]
}

// Returns the ordered candidate list the orchestrator would consider for a
// given cliType, in fallback priority: operational same-cliType, operational
// cross-provider, then last-resort (rate-limited but not user-blocked). Pure
// function — does not mutate registry or models. Useful for diagnostics and UI
// showing "if the current model fails, the next one will be X".
function getFallbackOrderForCliType(cliType, context = {}, options = {}) {
  const availableModels = Array.isArray(context.availableModels)
    ? context.availableModels
    : []
  const settings = context.orchestratorSettings ?? {}
  const blockedModelIds = new Set(
    Array.isArray(settings.blockedModelIds) ? settings.blockedModelIds : [],
  )
  const preferredModelIds = Array.isArray(settings.preferredModelIds)
    ? settings.preferredModelIds
    : []
  const registry = context.modelAvailabilityRegistry
  const prompt = options.prompt

  const notBlocked = availableModels.filter((model) => !blockedModelIds.has(model.id))
  const sameType = notBlocked.filter((model) => model.cliType === cliType)
  const otherType = notBlocked.filter((model) => model.cliType !== cliType)

  const operationalSame = sortByScore(
    sameType.filter((model) => isModelOperational(model, registry)),
    { preferredModelIds, requestedCliType: cliType, prompt },
  )
  const operationalOther = sortByScore(
    otherType.filter((model) => isModelOperational(model, registry)),
    { preferredModelIds, requestedCliType: cliType, prompt },
  )
  const lastResort = sortByScore(
    notBlocked.filter((model) => !isModelOperational(model, registry)),
    { preferredModelIds, requestedCliType: cliType, prompt },
  )

  return [
    ...operationalSame.map((model) => ({ model, tier: 'operational' })),
    ...operationalOther.map((model) => ({ model, tier: 'cross-provider' })),
    ...lastResort.map((model) => ({ model, tier: 'last-resort' })),
  ]
}

function sortByScore(models, scoringOptions) {
  return [...models].sort((left, right) => {
    const leftScore = scoreSpawnModel(left, scoringOptions)
    const rightScore = scoreSpawnModel(right, scoringOptions)
    if (leftScore !== rightScore) {
      return rightScore - leftScore
    }
    return String(left.name).localeCompare(String(right.name))
  })
}

module.exports = {
  CATEGORY_PRIORITY_ORDER,
  CLI_TYPE_VARIANT_DEFAULTS,
  applyVariantDefaults,
  createOrchestrationModel,
  createOrchestrationModelChoice,
  getFallbackOrderForCliType,
  getPriorityOrderFor,
  resolveOrchestrationSpawnModel,
  validateOrchestrationSpawnModel,
  isModelOperational,
  selectBestSpawnModel,
  scoreSpawnModel,
  classifySpawnPrompt,
  createUnavailableReason,
}
