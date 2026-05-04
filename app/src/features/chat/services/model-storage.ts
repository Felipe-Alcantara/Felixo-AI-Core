import type { CliType, Model, ReasoningEffort } from '../types'

const MODELS_STORAGE_KEY = 'felixo-ai-core.models'

export function loadModels(fallback: Model[]) {
  try {
    const rawModels = window.localStorage.getItem(MODELS_STORAGE_KEY)

    if (!rawModels) {
      return dedupeModels(fallback)
    }

    const parsedModels = JSON.parse(rawModels)

    if (!Array.isArray(parsedModels)) {
      return fallback
    }

    const models = parsedModels.flatMap((value) => {
      const model = normalizeModel(value)
      return model ? [model] : []
    })

    return models.length > 0 ? dedupeModels(models) : dedupeModels(fallback)
  } catch {
    return dedupeModels(fallback)
  }
}

export function saveModels(models: Model[]) {
  window.localStorage.setItem(MODELS_STORAGE_KEY, JSON.stringify(dedupeModels(models)))
}

export function dedupeModels(models: Model[]) {
  const seen = new Set<string>()

  return models.filter((model) => {
    const key = createModelDedupeKey(model)

    if (seen.has(key)) {
      return false
    }

    seen.add(key)
    return true
  })
}

export function createModelId(name: string) {
  const base = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

  return `${base || 'model'}-${Date.now()}`
}

export function detectModelCliType(
  model: Pick<Model, 'command' | 'name' | 'source'>,
): CliType {
  return detectCliType([model.command, model.name, model.source].join(' '))
}

export function normalizeCliType(value: unknown): CliType {
  return isCliType(value) ? value : 'unknown'
}

function normalizeModel(value: unknown): Model | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const model = value as Record<string, unknown>

  if (
    typeof model.id === 'string' &&
    typeof model.name === 'string' &&
    typeof model.command === 'string' &&
    typeof model.source === 'string'
  ) {
    const restoredModel = {
      command: model.command,
      name: model.name,
      source: model.source,
    }

    return {
      id: model.id,
      name: model.name,
      command: model.command,
      source: model.source,
      cliType: isCliType(model.cliType)
        ? model.cliType
        : detectModelCliType(restoredModel),
      providerModel: getOptionalString(model.providerModel),
      reasoningEffort: normalizeReasoningEffort(model.reasoningEffort),
    }
  }

  return null
}

function getOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function normalizeReasoningEffort(value: unknown): ReasoningEffort | undefined {
  return isReasoningEffort(value) ? value : undefined
}

function detectCliType(value: string): CliType {
  const normalizedValue = value.toLowerCase()

  if (normalizedValue.includes('claude')) {
    return 'claude'
  }

  if (
    normalizedValue.includes('codex-app-server') ||
    (normalizedValue.includes('codex') && normalizedValue.includes('app-server'))
  ) {
    return 'codex-app-server'
  }

  if (normalizedValue.includes('codex') || normalizedValue.includes('openai')) {
    return 'codex'
  }

  if (
    normalizedValue.includes('gemini-acp') ||
    (normalizedValue.includes('gemini') && normalizedValue.includes('--acp'))
  ) {
    return 'gemini-acp'
  }

  if (normalizedValue.includes('gemini')) {
    return 'gemini'
  }

  return 'unknown'
}

function createModelDedupeKey(model: Model) {
  const command = normalizeDedupeValue(model.command)

  if (command) {
    return `command:${command}`
  }

  return `id:${normalizeDedupeValue(model.id)}`
}

function normalizeDedupeValue(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

function isCliType(value: unknown): value is CliType {
  return (
    value === 'claude' ||
    value === 'codex' ||
    value === 'codex-app-server' ||
    value === 'gemini' ||
    value === 'gemini-acp' ||
    value === 'unknown'
  )
}

function isReasoningEffort(value: unknown): value is ReasoningEffort {
  return (
    value === 'low' ||
    value === 'medium' ||
    value === 'high' ||
    value === 'xhigh' ||
    value === 'max'
  )
}
