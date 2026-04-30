import type { CliType, Model } from '../types'

const MODELS_STORAGE_KEY = 'felixo-ai-core.models'

export function loadModels(fallback: Model[]) {
  try {
    const rawModels = window.localStorage.getItem(MODELS_STORAGE_KEY)

    if (!rawModels) {
      return fallback
    }

    const parsedModels = JSON.parse(rawModels)

    if (!Array.isArray(parsedModels)) {
      return fallback
    }

    const models = parsedModels.flatMap((value) => {
      const model = normalizeModel(value)
      return model ? [model] : []
    })

    return models.length > 0 ? models : fallback
  } catch {
    return fallback
  }
}

export function saveModels(models: Model[]) {
  window.localStorage.setItem(MODELS_STORAGE_KEY, JSON.stringify(models))
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
    }
  }

  return null
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
