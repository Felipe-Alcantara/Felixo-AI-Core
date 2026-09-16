import { describe, expect, it } from 'vitest'
import {
  createCatalogPromptInsertion,
  createManualPromptInsertion,
  createPromptInsertion,
  createSkillPromptInsertion,
  toPromptInsertionMetadata,
} from './prompt-insertion'
import { composeSelectedPromptInsertion } from '../../canvas/services/prompt-composition'
import type { AutomationDefinition } from './automations'

const prompt = (overrides: Partial<AutomationDefinition> = {}): AutomationDefinition => ({
  id: 'catalog-one',
  name: 'Primeiro prompt',
  description: '',
  prompt: 'instrução um',
  scope: 'chat',
  ...overrides,
})

describe('PromptInsertion', () => {
  it('mantém id e nome do catálogo sem alterar o corpo', () => {
    const insertion = createCatalogPromptInsertion(
      prompt(),
      'instrução um\r',
      { timestamp: '2026-09-16T12:00:00.000Z', autoSubmit: true },
    )

    expect(insertion).toMatchObject({
      id: 'catalog-one',
      name: 'Primeiro prompt',
      source: 'catalog',
      content: 'instrução um',
      combinedNames: ['Primeiro prompt'],
      autoSubmit: true,
      timestamp: '2026-09-16T12:00:00.000Z',
    })
  })

  it('não inventa nome para texto manual', () => {
    const insertion = createManualPromptInsertion('tarefa manual\r', {
      timestamp: '2026-09-16T12:00:00.000Z',
    })

    expect(insertion.name).toBeUndefined()
    expect(insertion.combinedNames).toEqual([])
    expect(insertion.source).toBe('manual')
    expect(insertion.autoSubmit).toBe(true)
  })

  it('preserva ordem e nomes repetidos na composição', () => {
    const first = prompt()
    const second = prompt({ id: 'catalog-two', name: 'Segundo prompt', prompt: 'instrução dois' })
    const insertion = composeSelectedPromptInsertion([first, second, first], {
      timestamp: '2026-09-16T12:00:00.000Z',
    })

    expect(insertion.id).toBe('catalog-combined:catalog-one+catalog-two+catalog-one')
    expect(insertion.combinedNames).toEqual([
      'Primeiro prompt',
      'Segundo prompt',
      'Primeiro prompt',
    ])
    expect(insertion.content).toBe(
      '## Primeiro prompt\n\ninstrução um\n\n---\n\n## Segundo prompt\n\ninstrução dois\n\n---\n\n## Primeiro prompt\n\ninstrução um',
    )
    expect(insertion.autoSubmit).toBe(true)
  })

  it('mantém o ID de um preset editado e atualiza o nome/texto', () => {
    const insertion = createCatalogPromptInsertion(
      prompt({ name: 'Nome editado', prompt: 'corpo atualizado' }),
      'corpo atualizado',
      { autoSubmit: false, timestamp: '2026-09-16T12:00:00.000Z' },
    )

    expect(insertion.id).toBe('catalog-one')
    expect(insertion.name).toBe('Nome editado')
    expect(insertion.content).toBe('corpo atualizado')
    expect(insertion.autoSubmit).toBe(false)
  })

  it('identifica skill e exclui content da forma persistida', () => {
    const insertion = createSkillPromptInsertion(
      { id: 'skill-one', name: 'Skill de teste' },
      'Use o arquivo /tmp/skill.md\r',
      { autoSubmit: true, timestamp: '2026-09-16T12:00:00.000Z' },
    )
    const metadata = toPromptInsertionMetadata(insertion)

    expect(insertion.source).toBe('skill')
    expect(metadata).toEqual({
      id: 'skill-one',
      name: 'Skill de teste',
      source: 'skill',
      combinedNames: ['Skill de teste'],
      autoSubmit: true,
      timestamp: '2026-09-16T12:00:00.000Z',
    })
    expect('content' in metadata).toBe(false)
  })

  it('gera metadata legível para um payload legado sem opções', () => {
    const insertion = createPromptInsertion({
      source: 'catalog',
      content: 'texto legado\r',
      timestamp: '2026-09-16T12:00:00.000Z',
    })

    expect(insertion.id).toMatch(/^catalog-[0-9a-f]{8}$/)
    expect(insertion.content).toBe('texto legado')
    expect(insertion.name).toBeUndefined()
  })
})
