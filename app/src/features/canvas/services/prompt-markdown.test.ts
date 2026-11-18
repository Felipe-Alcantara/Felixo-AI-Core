import { describe, expect, it } from 'vitest'
import { defaultAutomations } from '../../shared/data/automations'
import type { AutomationDefinition } from '../../shared/types/automations'
import {
  buildImportedPrompt,
  defaultImportAction,
  parsePromptMarkdown,
  planPromptImport,
  promptFileName,
  serializePromptMarkdown,
  uniquePromptFileNames,
} from './prompt-markdown'

const LONG = `# Título com acentos: ação, coração, ç\n\nEmoji: 🚀 ✅\n\n\`\`\`bash\necho "---"\n---\nnotion-tasks conteudo <id>\n\`\`\`\n\n${'linha longa. '.repeat(4000)}`

function make(overrides: Partial<AutomationDefinition> = {}): AutomationDefinition {
  return {
    id: 'automation-0e463fc8',
    name: 'WORKFLOW ATUALIZADO 3.0',
    description: 'Contrato: "aspas", dois-pontos: e\nquebra',
    prompt: LONG,
    scope: 'notion',
    updatedAt: '2026-11-17T12:00:00.000Z',
    ...overrides,
  }
}

describe('prompt-markdown', () => {
  it('faz a ida e volta sem perder id, nome, tópico, descrição nem o corpo', () => {
    const original = make()
    const result = parsePromptMarkdown(serializePromptMarkdown(original, 'personalizado'), 'x.md')
    expect(result).toEqual({
      ok: true,
      prompt: {
        id: original.id,
        name: original.name,
        description: original.description,
        prompt: original.prompt.trim(),
        scope: 'notion',
      },
    })
  })

  it('faz a ida e volta de todos os prompts embarcados', () => {
    for (const preset of defaultAutomations) {
      const result = parsePromptMarkdown(serializePromptMarkdown(preset, 'catalogo'), 'x.md')
      expect(result.ok && result.prompt.id).toBe(preset.id)
      expect(result.ok && result.prompt.prompt).toBe(preset.prompt.trim())
    }
  })

  it('aceita fim de linha do Windows, BOM e valores sem aspas escritos à mão', () => {
    const text = '﻿---\r\nname: Meu prompt\r\nscope: git\r\n---\r\n\r\nFaça o commit.\r\n'
    expect(parsePromptMarkdown(text, 'x.md')).toEqual({
      ok: true,
      prompt: { id: undefined, name: 'Meu prompt', description: '', prompt: 'Faça o commit.', scope: 'git' },
    })
  })

  it('sem cabeçalho, o arquivo inteiro é o prompt e o nome vem do arquivo', () => {
    const result = parsePromptMarkdown('Só o texto.\n', 'Revisar PR.md')
    expect(result).toMatchObject({ ok: true, prompt: { name: 'Revisar PR', scope: 'chat', prompt: 'Só o texto.' } })
  })

  it('recusa tópico inexistente, corpo vazio e cabeçalho aberto', () => {
    expect(parsePromptMarkdown('---\nscope: magia\n---\n\ntexto', 'x.md')).toMatchObject({ ok: false })
    expect(parsePromptMarkdown('---\nscope: git\n---\n\n   \n', 'x.md')).toMatchObject({ ok: false })
    expect(parsePromptMarkdown('---\nscope: git\ntexto', 'x.md')).toMatchObject({ ok: false })
  })

  it('planeja a prévia: novo, alterado, igual e inválido', () => {
    const visible = [make()]
    const same = serializePromptMarkdown(visible[0], 'personalizado')
    const edited = same.replace('WORKFLOW ATUALIZADO 3.0', 'WORKFLOW 3.1')
    const fresh = serializePromptMarkdown(make({ id: 'automation-novo' }), 'personalizado')
    const rows = planPromptImport(
      [
        { name: 'a.md', content: same },
        { name: 'c.md', content: fresh },
        { name: 'd.md', content: '---\nscope: x\n---\n\nt' },
      ],
      visible,
    )
    expect(rows.map((row) => row.status)).toEqual(['unchanged', 'new', 'invalid'])
    expect(rows.map(defaultImportAction)).toEqual(['skip', 'create', 'skip'])
    const [changed, duplicate] = planPromptImport(
      [
        { name: 'b.md', content: edited },
        { name: 'e.md', content: edited },
      ],
      visible,
    )
    expect([changed.status, duplicate.status]).toEqual(['changed', 'invalid'])
    expect(defaultImportAction(changed)).toBe('overwrite')
  })

  it('sobrescrever mantém o id e a data de criação; manter os dois cria outro id', () => {
    const existing = make({ createdAt: '2026-01-01T00:00:00.000Z' })
    const [row] = planPromptImport(
      [{ name: 'a.md', content: serializePromptMarkdown({ ...existing, name: 'Novo nome' }, 'personalizado') }],
      [existing],
    )
    const now = '2026-11-18T10:00:00.000Z'
    const overwritten = buildImportedPrompt(row, 'overwrite', () => 'automation-gerado', now)
    expect(overwritten).toMatchObject({ id: existing.id, name: 'Novo nome', createdAt: existing.createdAt, updatedAt: now })
    const both = buildImportedPrompt(row, 'both', () => 'automation-gerado', now)
    expect(both).toMatchObject({ id: 'automation-gerado', name: 'Novo nome (importado)' })
    expect(buildImportedPrompt(row, 'skip', () => 'x', now)).toBeUndefined()
  })

  it('arquivo novo sem id ganha id gerado; com id, mantém o id', () => {
    const [semId, comId] = planPromptImport(
      [
        { name: 'a.md', content: 'texto' },
        { name: 'b.md', content: serializePromptMarkdown(make({ id: 'automation-x' }), 'personalizado') },
      ],
      [],
    )
    expect(buildImportedPrompt(semId, 'create', () => 'automation-gerado', 'agora')?.id).toBe('automation-gerado')
    expect(buildImportedPrompt(comId, 'create', () => 'automation-gerado', 'agora')?.id).toBe('automation-x')
  })

  it('gera nomes de arquivo seguros e únicos', () => {
    expect(promptFileName({ id: 'a', name: 'Ação: revisão/PR?' })).toBe('Acao-revisao-PR.md')
    expect(promptFileName({ id: 'automation-1', name: '???' })).toBe('automation-1.md')
    expect(uniquePromptFileNames([{ id: 'a', name: 'Igual' }, { id: 'b', name: 'igual' }])).toEqual([
      'Igual.md',
      'igual-2.md',
    ])
  })
})
