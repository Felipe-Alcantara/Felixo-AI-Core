import { describe, expect, it } from 'vitest'

import { CHAIN_ACCOUNT_VALUE, SHELL_AGENT_VALUE, readAgentLaunchPreferences } from './agent-launch-preferences'
import { buildOrchestratedAgentOptions } from './orchestrated-agents'

const defaults = readAgentLaunchPreferences({ getItem: () => null })
const TASKS = [{ titulo: 'Task A' }, { titulo: 'Task B', contexto: 'detalhe da B' }, { titulo: 'Task C' }]

describe('buildOrchestratedAgentOptions', () => {
  it('abre um terminal por task, com a mesma CLI, o mesmo modelo e a pasta do coordenador', () => {
    const options = buildOrchestratedAgentOptions(
      TASKS,
      { ...defaults, agentValue: 'codex', model: 'gpt-5.5', effort: 'high' },
      'P:/projeto',
    )

    expect(options).toHaveLength(3)
    for (const option of options) {
      expect(option.command).toBe('codex')
      expect(option.providerId).toBe('codex')
      expect(option.cwd).toBe('P:/projeto')
      expect(option.args).toEqual(options[0].args)
      expect(option.preset?.color).toBe('violet')
    }
    expect(options[0].args?.join(' ')).toContain('gpt-5.5')
  })

  it('numera o lote no rótulo e corta título comprido', () => {
    const [first, , last] = buildOrchestratedAgentOptions(
      [{ titulo: 'x'.repeat(100) }, { titulo: 'b' }, { titulo: 'c' }],
      defaults,
    )

    expect(first.label.startsWith('Orquestração 1/3 · ')).toBe(true)
    expect(first.label.length).toBeLessThan(70)
    expect(first.label.endsWith('…')).toBe(true)
    expect(last.label).toBe('Orquestração 3/3 · c')
  })

  it('o contexto da task vai no preset e proíbe abrir outros agentes', () => {
    const [, second] = buildOrchestratedAgentOptions(TASKS, defaults)

    expect(second.preset?.contextPrompt).toContain('Título: Task B')
    expect(second.preset?.contextPrompt).toContain('detalhe da B')
    expect(second.preset?.contextPrompt).toContain('não abra outros agentes')
    expect(second.preset?.skillIds).toEqual([])
  })

  it('shell no launcher cai no Claude, porque sub-agente precisa de uma CLI de agente', () => {
    const [option] = buildOrchestratedAgentOptions([{ titulo: 'a' }], { ...defaults, agentValue: SHELL_AGENT_VALUE })

    expect(option.command).toBe('claude')
    expect(option.providerId).toBe('claude')
  })

  it('conta fixa segue para o terminal; a cadeia e a conta vazia não', () => {
    const [fixed] = buildOrchestratedAgentOptions([{ titulo: 'a' }], { ...defaults, accountId: 'conta-1' })
    const [chain] = buildOrchestratedAgentOptions([{ titulo: 'a' }], { ...defaults, accountId: CHAIN_ACCOUNT_VALUE })
    const [none] = buildOrchestratedAgentOptions([{ titulo: 'a' }], { ...defaults, accountId: '' })

    expect(fixed.accountId).toBe('conta-1')
    expect(chain.accountId).toBeUndefined()
    expect(none.accountId).toBeUndefined()
  })

  it('esforço que o modelo não aceita é descartado em vez de quebrar a linha de comando', () => {
    const [option] = buildOrchestratedAgentOptions(
      [{ titulo: 'a' }],
      { ...defaults, agentValue: 'claude', model: '', effort: 'nao-existe' },
    )

    expect(option.args?.join(' ')).not.toContain('nao-existe')
  })

  it('lote vazio não abre nada', () => {
    expect(buildOrchestratedAgentOptions([], defaults)).toEqual([])
  })
})
