import { describe, expect, it } from 'vitest'
import {
  readAgentLaunchPreferences,
  saveAgentLaunchPreferences,
} from './agent-launch-preferences'

function createStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  }
}

describe('agent launch preferences', () => {
  it('migrates the previous agent-only preference without losing a usable default', () => {
    const preferences = readAgentLaunchPreferences(
      createStorage({ 'felixo:last-agent': 'codex' }),
    )

    expect(preferences).toMatchObject({
      agentValue: 'codex',
      model: '',
      effort: '',
      yolo: false,
      planningFile: '',
    })
  })

  it('persists all reusable launch settings, including a planning file of any type', () => {
    const storage = createStorage()
    saveAgentLaunchPreferences(
      {
        agentValue: 'codex',
        model: 'gpt-5.6-terra',
        effort: 'ultra',
        yolo: true,
        fast: true,
        projectId: 'project-a',
        planningFile: '/work/plans/release-plan.pdf',
        // A conta escolhida também é preferência reutilizável: sem ela o campo
        // voltava para "Login do sistema" a cada abertura.
        accountId: 'conta-trabalho',
        openiaInterface: 'aichat',
        openiaModel: 'anthropic/claude-sonnet-4',
      },
      storage,
    )

    expect(readAgentLaunchPreferences(storage)).toEqual({
      agentValue: 'codex',
      model: 'gpt-5.6-terra',
      effort: 'ultra',
      yolo: true,
      fast: true,
      projectId: 'project-a',
      planningFile: '/work/plans/release-plan.pdf',
      accountId: 'conta-trabalho',
      openiaInterface: 'aichat',
      openiaModel: 'anthropic/claude-sonnet-4',
    })
  })

  it('discards corrupted or no-longer-supported agent options', () => {
    const storage = createStorage({
      'felixo:last-agent-launch-preferences': JSON.stringify({
        agentValue: 'unknown',
        model: 'missing-model',
        effort: 'impossible',
        yolo: 'yes',
        projectId: 4,
        planningFile: 7,
      }),
    })

    expect(readAgentLaunchPreferences(storage)).toEqual({
      agentValue: 'claude',
      model: '',
      effort: '',
      yolo: false,
      fast: false,
      projectId: '',
      planningFile: '',
      openiaInterface: 'orchat',
      openiaModel: '',
      accountId: '',
    })
  })

  it('preserves interface/model but never stores a key in the reusable settings', () => {
    const storage = createStorage()
    saveAgentLaunchPreferences({
      agentValue: 'openia',
      model: '',
      effort: '',
      yolo: false,
      fast: false,
      accountId: '',
      projectId: '',
      planningFile: '',
      openiaInterface: 'openclaw',
      openiaModel: 'openai/gpt-5',
    }, storage)

    const raw = storage.getItem('felixo:last-agent-launch-preferences') ?? ''
    expect(raw.includes('openrouter-key')).toBe(false)
    expect(raw.includes('sk-or-')).toBe(false)
    expect(readAgentLaunchPreferences(storage)).toMatchObject({
      agentValue: 'openia',
      openiaInterface: 'openclaw',
      openiaModel: 'openai/gpt-5',
    })
  })

  it('fast só é lembrado para agente/modelo que o suporta', () => {
    const salvar = (extra: Record<string, unknown>) =>
      readAgentLaunchPreferences(
        createStorage({
          'felixo:last-agent-launch-preferences': JSON.stringify({ fast: true, ...extra }),
        }),
      )

    expect(salvar({ agentValue: 'codex', model: 'gpt-5.6-sol' }).fast).toBe(true)
    expect(salvar({ agentValue: 'codex' }).fast).toBe(true)
    // Um fast salvo não pode ligar o tier escondido em quem não tem o campo.
    expect(salvar({ agentValue: 'claude', model: 'opus' }).fast).toBe(false)
    expect(salvar({ agentValue: 'gemini' }).fast).toBe(false)
    // Valor de tipo errado é descartado.
    expect(salvar({ agentValue: 'codex', fast: 'yes' }).fast).toBe(false)
  })
})
