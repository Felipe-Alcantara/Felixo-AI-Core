import type { Model } from '../types'

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
    return {
      id: model.id,
      name: model.name,
      command: model.command,
      source: model.source,
    }
  }

  return null
}
