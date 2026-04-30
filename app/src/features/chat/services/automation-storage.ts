import type { AutomationDefinition, AutomationScope } from '../types'

const AUTOMATIONS_STORAGE_KEY = 'felixo-ai-core.customAutomations'

export function loadCustomAutomations() {
  try {
    const rawAutomations = window.localStorage.getItem(AUTOMATIONS_STORAGE_KEY)

    if (!rawAutomations) {
      return []
    }

    const parsedAutomations = JSON.parse(rawAutomations)

    if (!Array.isArray(parsedAutomations)) {
      return []
    }

    return parsedAutomations.flatMap((value) => {
      const automation = normalizeAutomation(value)
      return automation ? [automation] : []
    })
  } catch {
    return []
  }
}

export function saveCustomAutomations(automations: AutomationDefinition[]) {
  window.localStorage.setItem(
    AUTOMATIONS_STORAGE_KEY,
    JSON.stringify(automations),
  )
}

export function createAutomationId(name: string) {
  const base = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

  return `automation-${base || 'custom'}-${Date.now()}`
}

function normalizeAutomation(value: unknown): AutomationDefinition | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const automation = value as Record<string, unknown>

  if (
    typeof automation.id === 'string' &&
    typeof automation.name === 'string' &&
    typeof automation.description === 'string' &&
    typeof automation.prompt === 'string' &&
    isAutomationScope(automation.scope)
  ) {
    return {
      id: automation.id,
      name: automation.name,
      description: automation.description,
      prompt: automation.prompt,
      scope: automation.scope,
      isDefault: false,
      createdAt: getOptionalString(automation.createdAt),
      updatedAt: getOptionalString(automation.updatedAt),
    }
  }

  return null
}

function getOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function isAutomationScope(value: unknown): value is AutomationScope {
  return (
    value === 'chat' ||
    value === 'code' ||
    value === 'docs' ||
    value === 'git' ||
    value === 'planning'
  )
}
