import { describe, expect, it } from 'vitest'
import {
  createCatalogPromptInsertion,
  createManualPromptInsertion,
  createPromptInsertion,
  createSkillPromptInsertion,
  resolvePromptDisplayLabel,
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

describe('resolvePromptDisplayLabel', () => {
  it('sem lastPrompt não mostra nada — não há prompt registrado', () => {
    expect(resolvePromptDisplayLabel(undefined, undefined)).toBeNull()
    expect(resolvePromptDisplayLabel(null, { name: 'Nome órfão', combinedNames: [] })).toBeNull()
    expect(resolvePromptDisplayLabel('   ', undefined)).toBeNull()
  })

  it('prioriza o nome do catálogo/skill sobre o texto entregue — o caso central da task', () => {
    // `lastPrompt` aqui é o texto de fato digitado no PTY quando o corpo do
    // prompt foi grande demais e virou referência de arquivo de contexto —
    // opaco por natureza. Sem o nome, o cartão mostraria só isso.
    const resolved = resolvePromptDisplayLabel(
      'felixo context read 7f3a2b91',
      { name: 'Revisar PR #482', combinedNames: ['Revisar PR #482'] },
    )

    expect(resolved).toEqual({
      label: 'Revisar PR #482',
      detail: 'felixo context read 7f3a2b91',
      named: true,
    })
  })

  it('usa combinedNames quando não há name (composição de múltiplos prompts)', () => {
    const resolved = resolvePromptDisplayLabel('conteúdo combinado', {
      name: undefined,
      combinedNames: ['Prompt A', 'Prompt B'],
    })

    expect(resolved).toEqual({
      label: 'Prompt A, Prompt B',
      detail: 'conteúdo combinado',
      named: true,
    })
  })

  it('prompt manual (sem nome inventado) cai no próprio conteúdo, marcado como não nomeado', () => {
    const resolved = resolvePromptDisplayLabel('oi, tudo bem?', {
      name: undefined,
      combinedNames: [],
    })

    expect(resolved).toEqual({
      label: 'oi, tudo bem?',
      detail: 'oi, tudo bem?',
      named: false,
    })
  })

  it('sem insertion nenhuma (sessão restaurada antes de reconectar) ainda mostra o conteúdo cru', () => {
    expect(resolvePromptDisplayLabel('texto sem proveniência', null)).toEqual({
      label: 'texto sem proveniência',
      detail: 'texto sem proveniência',
      named: false,
    })
  })

  it('nome e combinedNames em branco não lançam e caem no conteúdo', () => {
    const resolved = resolvePromptDisplayLabel('conteúdo', { name: '   ', combinedNames: ['  ', ''] })
    expect(resolved?.named).toBe(false)
    expect(resolved?.label).toBe('conteúdo')
  })
})
