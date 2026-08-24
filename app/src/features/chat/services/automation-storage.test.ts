import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  loadCustomAutomations,
  mergeAutomationsForBackendMigration,
  saveCustomAutomations,
} from './automation-storage'
import { AUTOMATION_SCOPES } from '../../shared/types/automations'
import type { AutomationDefinition } from '../types'

function automation(
  scope: AutomationDefinition['scope'],
  id = `automation-${scope}`,
): AutomationDefinition {
  return {
    id,
    name: `Prompt ${scope}`,
    description: 'Descricao de teste.',
    prompt: 'Prompt de teste.',
    scope,
    isDefault: false,
    createdAt: undefined,
    updatedAt: undefined,
  }
}

function installLocalStorage() {
  const values = new Map<string, string>()
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('automation storage', () => {
  it('mantem cada escopo aceito pela fonte de verdade ao ler o localStorage', () => {
    installLocalStorage()
    const saved = AUTOMATION_SCOPES.map((scope) => automation(scope))

    saveCustomAutomations(saved)

    expect(loadCustomAutomations()).toEqual(saved)
  })

  it('descarta automations com escopo que o app nao oferece', () => {
    installLocalStorage()
    const valid = automation('notion')
    const invalid = { ...automation('chat', 'automation-invalid'), scope: 'unknown' }

    window.localStorage.setItem(
      'felixo-ai-core.customAutomations',
      JSON.stringify([valid, invalid]),
    )

    expect(loadCustomAutomations()).toEqual([valid])
  })

  it('migra itens locais ausentes sem sobrescrever os que ja estao no banco', () => {
    const backend = [automation('chat', 'shared'), automation('code', 'backend-only')]
    const local = [
      { ...automation('notion', 'shared'), name: 'Versao antiga local' },
      automation('security', 'local-only'),
    ]

    expect(mergeAutomationsForBackendMigration(backend, local)).toEqual([
      ...backend,
      local[1],
    ])
  })
})
