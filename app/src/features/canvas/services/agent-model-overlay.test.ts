import { describe, expect, it } from 'vitest'
import { applyDiscoveredCatalog, describeModelListStatus } from './agent-model-overlay'
import type { AgentDefinition } from './agent-launch-options'

const AGENTES: AgentDefinition[] = [
  {
    id: 'claude',
    command: 'claude',
    label: 'Claude',
    models: ['opus', 'sonnet', 'haiku'],
    effortLevels: ['low', 'medium', 'high', 'max'],
  },
  {
    id: 'codex',
    command: 'codex',
    label: 'Codex',
    models: ['gpt-5.6-sol'],
    effortLevels: { 'gpt-5.6-sol': ['low', 'high'] },
  },
  {
    id: 'gemini',
    command: 'gemini',
    label: 'Gemini',
    models: ['gemini-3-pro-preview'],
    effortLevels: null,
  },
]

describe('applyDiscoveredCatalog', () => {
  it('devolve a lista fixa quando não há nada descoberto', () => {
    // O menu nunca abre vazio: é a garantia que motivou a feature.
    expect(applyDiscoveredCatalog(AGENTES, null)).toEqual(AGENTES)
    expect(applyDiscoveredCatalog(AGENTES, {})).toEqual(AGENTES)
  })

  it('substitui os modelos do agente descoberto', () => {
    const agentes = applyDiscoveredCatalog(AGENTES, {
      claude: { models: ['opus', 'sonnet', 'haiku', 'fable', 'opusplan'] },
    })

    expect(agentes[0].models).toEqual(['opus', 'sonnet', 'haiku', 'fable', 'opusplan'])
  })

  it('mantém na lista fixa os agentes que não foram descobertos', () => {
    // Caso real: o Gemini falha por elegibilidade da conta enquanto os outros
    // respondem — ele não pode ficar sem opção nenhuma.
    const agentes = applyDiscoveredCatalog(AGENTES, { claude: { models: ['fable'] } })

    expect(agentes[2].models).toEqual(['gemini-3-pro-preview'])
  })

  it('ignora uma lista descoberta vazia', () => {
    // Vazio significa "não descobri", não "não há modelos".
    const agentes = applyDiscoveredCatalog(AGENTES, { claude: { models: [] } })

    expect(agentes[0].models).toEqual(['opus', 'sonnet', 'haiku'])
  })

  it('usa os níveis de esforço descobertos por modelo', () => {
    const agentes = applyDiscoveredCatalog(AGENTES, {
      codex: {
        models: ['gpt-5.6-sol', 'gpt-5.6-luna'],
        effortLevels: {
          'gpt-5.6-sol': ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'],
          'gpt-5.6-luna': ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      },
    })

    expect(agentes[1].effortLevels).toEqual({
      'gpt-5.6-sol': ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'],
      'gpt-5.6-luna': ['low', 'medium', 'high', 'xhigh', 'max'],
    })
  })

  it('mantém o esforço fixo quando a descoberta traz só os modelos', () => {
    const agentes = applyDiscoveredCatalog(AGENTES, { claude: { models: ['fable'] } })

    expect(agentes[0].effortLevels).toEqual(['low', 'medium', 'high', 'max'])
  })

  it('descarta níveis de esforço que o app não sabe transformar em flag', () => {
    const agentes = applyDiscoveredCatalog(AGENTES, {
      codex: {
        models: ['gpt-novo'],
        effortLevels: { 'gpt-novo': ['low', 'turbo-quantico', 'high'] },
      },
    })

    expect(agentes[1].effortLevels).toEqual({ 'gpt-novo': ['low', 'high'] })
  })

  it('não altera os objetos originais', () => {
    // O catálogo fixo é um módulo compartilhado: mutá-lo vazaria a descoberta
    // de uma sessão para todo o resto do app.
    const copia = structuredClone(AGENTES)
    applyDiscoveredCatalog(AGENTES, { claude: { models: ['fable'] } })

    expect(AGENTES).toEqual(copia)
  })

  it('ignora entradas para agentes que não existem', () => {
    const agentes = applyDiscoveredCatalog(AGENTES, {
      inexistente: { models: ['x'] },
    })

    expect(agentes.map((agente) => agente.id)).toEqual(['claude', 'codex', 'gemini'])
  })
})

describe('describeModelListStatus', () => {
  const AGORA = Date.parse('2026-11-17T12:00:00.000Z')

  it('não diz nada enquanto a primeira rodada não terminou', () => {
    expect(describeModelListStatus(undefined, AGORA)).toBeNull()
  })

  it('lista da CLI diz há quanto tempo foi atualizada', () => {
    expect(
      describeModelListStatus({ origem: 'descoberta', motivo: null, discoveredAt: '2026-11-17T10:00:00.000Z' }, AGORA),
    ).toBe('Lista da CLI, atualizada há 2 h.')
  })

  it('cache mostra a data da última consulta que deu certo e o motivo da falha', () => {
    expect(
      describeModelListStatus(
        { origem: 'cache', motivo: 'claude não encontrado no PATH.', discoveredAt: '2026-11-16T12:00:00.000Z' },
        AGORA,
      ),
    ).toBe('Lista guardada da última consulta há 1 d (claude não encontrado no PATH).')
  })

  it('lista fixa explica por que a CLI não a trocou', () => {
    expect(
      describeModelListStatus(
        { origem: 'fixa', motivo: 'a CLI do Gemini não lista modelos fora do modo interativo', discoveredAt: null },
        AGORA,
      ),
    ).toBe('Lista fixa do app (a CLI do Gemini não lista modelos fora do modo interativo).')
  })
})
