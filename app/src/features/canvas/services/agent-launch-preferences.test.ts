import { describe, expect, it } from 'vitest'
import {
  CHAIN_ACCOUNT_VALUE,
  CLOUD_AGENT_VALUE,
  providerIdOf,
  readAgentLaunchPreferences,
  saveAgentLaunchPreferences,
  SHELL_AGENT_VALUE,
} from './agent-launch-preferences'

function createStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  }
}

describe('agent launch preferences', () => {
  it('nunca restaura "Agente na nuvem": o botão Agente abriria um cartão sem tarefa', () => {
    const preferences = readAgentLaunchPreferences(
      createStorage({
        'felixo:last-agent-launch-preferences': JSON.stringify({
          agentValue: CLOUD_AGENT_VALUE,
          model: 'opus',
        }),
        'felixo:last-agent': CLOUD_AGENT_VALUE,
      }),
    )

    expect(preferences.agentValue).toBe('claude')
  })

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

  it('guarda o nome da conta salva junto do id, e só quando existe', () => {
    const storage = createStorage()
    const base = {
      agentValue: 'codex' as const,
      model: '',
      effort: '',
      yolo: false,
      fast: false,
      projectId: '',
      planningFile: '',
      openiaInterface: 'orchat',
      openiaModel: '',
    }
    saveAgentLaunchPreferences({ ...base, accountId: 'conta-trabalho', accountLabel: 'Trabalho' }, storage)
    expect(readAgentLaunchPreferences(storage)).toMatchObject({
      accountId: 'conta-trabalho',
      accountLabel: 'Trabalho',
    })

    saveAgentLaunchPreferences({ ...base, accountId: '' }, storage)
    expect(readAgentLaunchPreferences(storage)).not.toHaveProperty('accountLabel')
  })

  it('lembra "Automática (cadeia)" como o valor especial, sem nome de conta', () => {
    const storage = createStorage()
    saveAgentLaunchPreferences(
      {
        agentValue: 'codex',
        model: '',
        effort: '',
        yolo: false,
        fast: false,
        projectId: '',
        planningFile: '',
        openiaInterface: 'orchat',
        openiaModel: '',
        accountId: CHAIN_ACCOUNT_VALUE,
      },
      storage,
    )
    expect(readAgentLaunchPreferences(storage).accountId).toBe('@cadeia')
    expect(readAgentLaunchPreferences(storage)).not.toHaveProperty('accountLabel')
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

describe('providerIdOf', () => {
  it('a nuvem usa as contas do Claude, que é quem roda a sessão', () => {
    expect(providerIdOf(CLOUD_AGENT_VALUE)).toBe('claude')
  })

  it('o shell não tem provedor, então não lista conta de ninguém', () => {
    expect(providerIdOf(SHELL_AGENT_VALUE)).toBe('')
  })

  it('um agente comum usa o próprio provedor', () => {
    expect(providerIdOf('codex')).toBe('codex')
    expect(providerIdOf('claude')).toBe('claude')
  })
})
