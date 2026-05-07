import type { AutomationDefinition, AutomationScope } from '../types'

const AUTOMATIONS_STORAGE_KEY = 'felixo-ai-core.customAutomations'
const AUTOMATIONS_BACKEND_MIGRATION_KEY =
  'felixo-ai-core.automations.sqlite-migrated'

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

export async function loadAutomationsFromBackend(): Promise<
  AutomationDefinition[] | null
> {
  if (!window.felixo?.automations?.list) {
    return null
  }

  try {
    const result = await window.felixo.automations.list()
    if (!result.ok || !Array.isArray(result.automations)) {
      return null
    }
    return result.automations.flatMap((value) => {
      const automation = normalizeAutomation(value)
      return automation ? [automation] : []
    })
  } catch {
    return null
  }
}

export async function saveAutomationToBackend(
  automation: AutomationDefinition,
): Promise<boolean> {
  if (!window.felixo?.automations?.save) {
    return false
  }
  const normalized = normalizeAutomation(automation)
  if (!normalized) {
    return false
  }
  try {
    const result = await window.felixo.automations.save(normalized)
    return result.ok
  } catch {
    return false
  }
}

export async function saveAutomationsToBackend(
  automations: AutomationDefinition[],
): Promise<boolean> {
  if (!window.felixo?.automations?.save) {
    return false
  }
  const results = await Promise.all(
    automations.map((automation) => saveAutomationToBackend(automation)),
  )
  return results.every(Boolean)
}

export async function deleteAutomationFromBackend(
  automationId: string,
): Promise<boolean> {
  if (!window.felixo?.automations?.delete) {
    return false
  }
  try {
    const result = await window.felixo.automations.delete(automationId)
    return result.ok
  } catch {
    return false
  }
}

export function hasAutomationsBackendMigrationRun() {
  try {
    return (
      window.localStorage.getItem(AUTOMATIONS_BACKEND_MIGRATION_KEY) === '1'
    )
  } catch {
    return false
  }
}

export function markAutomationsBackendMigrationRun() {
  try {
    window.localStorage.setItem(AUTOMATIONS_BACKEND_MIGRATION_KEY, '1')
  } catch {
    // localStorage can be unavailable in non-browser test environments.
  }
}

export function createAutomationId(name: string) {
  const base = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
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
      isDefault: automation.isDefault === true ? true : false,
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
