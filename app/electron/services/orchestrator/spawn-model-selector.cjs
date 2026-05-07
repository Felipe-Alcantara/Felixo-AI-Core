'use strict'

function createOrchestrationModel(cliType) {
  return {
    id: `orchestration-${cliType}`,
    name: `Sub-agente ${cliType}`,
    command: cliType,
    source: 'orchestration',
    cliType,
  }
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
    const model = {
      ...createOrchestrationModel(cliType),
      ...selectedModel,
      cliType: selectedModel.cliType,
    }
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
    const model = {
      ...createOrchestrationModel(selectedModel.cliType),
      ...selectedModel,
      cliType: selectedModel.cliType,
    }
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

  if (configuredCandidates.length === 0) {
    const reason =
      cliTypeModels.length === 0
        ? `Nenhum modelo cadastrado para cliType "${cliType}".`
        : `Todos os modelos cadastrados para cliType "${cliType}" estao bloqueados.`

    return {
      ok: false,
      message: `Nenhum modelo disponivel para spawn com cliType "${cliType}".`,
      modelChoice: createOrchestrationModelChoice({
        requestedCliType: cliType,
        model: null,
        reason,
        selectionRule: 'unavailable',
        candidateCount: 0,
        blockedCount: cliTypeModels.length,
        unavailableCount: 0,
      }),
    }
  }

  const reason = createUnavailableReason(
    cliType,
    cliTypeModels,
    configuredCandidates,
    context.modelAvailabilityRegistry,
  )

  return {
    ok: false,
    message: `Nenhum modelo operacional para spawn com cliType "${cliType}".`,
    modelChoice: createOrchestrationModelChoice({
      requestedCliType: cliType,
      model: null,
      reason,
      selectionRule: 'unavailable',
      candidateCount: 0,
      blockedCount: cliTypeModels.length - configuredCandidates.length,
      unavailableCount: configuredCandidates.length,
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
    if (model.cliType === 'codex' || model.cliType === 'codex-app-server') {
      score += 90
    } else if (model.cliType === 'claude') {
      score += 75
    } else {
      score += 25
    }
  } else if (promptKind === 'long-context') {
    if (model.cliType === 'gemini' || model.cliType === 'gemini-acp') {
      score += 90
    } else if (model.cliType === 'claude') {
      score += 45
    } else {
      score += 35
    }
  } else {
    if (model.cliType === 'gemini' || model.cliType === 'gemini-acp') {
      score += 55
    } else if (model.cliType === 'codex' || model.cliType === 'codex-app-server') {
      score += 50
    } else {
      score += 45
    }
  }

  if (String(model.providerModel ?? '').toLowerCase().includes('lite')) {
    score += 10
  }

  if (String(model.providerModel ?? '').toLowerCase().includes('mini')) {
    score += 8
  }

  return score
}

function classifySpawnPrompt(prompt) {
  const normalizedPrompt = String(prompt ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

  if (
    /\b(codigo|code|arquivo|file|editar|implementar|corrigir|bug|teste|test|refactor|commit|diff|pr)\b/.test(
      normalizedPrompt,
    )
  ) {
    return 'code'
  }

  if (
    /\b(resum|sumari|contexto longo|long context|pesquis|analise extensa|documento grande)\b/.test(
      normalizedPrompt,
    )
  ) {
    return 'long-context'
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

module.exports = {
  createOrchestrationModel,
  createOrchestrationModelChoice,
  resolveOrchestrationSpawnModel,
  validateOrchestrationSpawnModel,
  isModelOperational,
  selectBestSpawnModel,
  scoreSpawnModel,
  classifySpawnPrompt,
  createUnavailableReason,
}
