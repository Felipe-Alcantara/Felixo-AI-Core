import { describe, expect, it } from 'vitest'
import {
  buildContextFileReferences,
  buildInlineFallback,
  contextFileKindForPrompt,
  isAgentCliCommand,
  quoteContextFileName,
  splitInitialContext,
} from './context-file-delivery'

describe('context-file-delivery', () => {
  it('keeps agent slash commands out of the file channel', () => {
    expect(isAgentCliCommand('/resume\r')).toBe(true)
    expect(isAgentCliCommand('/clear')).toBe(true)
    expect(isAgentCliCommand('Leia o arquivo /resume antes de agir')).toBe(false)
  })

  it('classifies submitted prompts as handoff payloads', () => {
    expect(contextFileKindForPrompt('tarefa longa\r')).toBe('handoff')
    expect(contextFileKindForPrompt('contexto permanente')).toBe('initial-context')
  })

  it('quotes an artifact name containing a double quote without adding a path', () => {
    expect(quoteContextFileName('felixo-context-um"arquivo.txt')).toBe('"felixo-context-um\\"arquivo.txt"')
  })

  it('separates generated startup sections without rewriting their bodies', () => {
    const quality = 'qualidade literal\ncom dois parágrafos'
    const identity = 'Sua identidade no canvas:\n- Agente A'
    const result = splitInitialContext(
      `${quality}\n\nContexto do canvas:\ncanvas\n\n${identity}\n\nSkills disponíveis neste sistema\nskills`,
    )

    expect(result.map((part) => part.kind)).toEqual([
      'initial-context',
      'agent-identity',
      'skills-manifest',
    ])
    expect(result[0].content).toBe(quality)
    expect(result[1].content).toBe(identity)
    expect(result.some((part) => part.content.startsWith('Contexto do canvas:'))).toBe(false)
  })

  it('lists every delivered file and preserves submission on the compact reference', () => {
    const reference = buildContextFileReferences(
      [
        { kind: 'initial-context', name: 'felixo-context-1-initial-context.txt' },
        { kind: 'handoff', name: 'felixo-context-2-handoff.txt' },
      ],
      true,
    )

    expect(reference).toContain('initial-context: "felixo-context-1-initial-context.txt"')
    expect(reference).toContain('handoff: "felixo-context-2-handoff.txt"')
    expect(reference).toContain('felixo context read "felixo-context-1-initial-context.txt"')
    expect(reference).not.toContain('/tmp/')
    expect(reference).toContain('não fazem parte do repositório')
    expect(reference.endsWith('\r')).toBe(true)
  })

  it('usa o caminho absoluto do comando quando a ponte devolve um, em vez do nome nu', () => {
    // Regressão: uma função de shell de outra ferramenta com o mesmo nome
    // "felixo" (instalada no .bashrc/.zshrc da pessoa) vence o PATH em
    // bash/zsh — o nome nu roda o comando errado, sem erro nenhum.
    const reference = buildContextFileReferences(
      [{ kind: 'catalog-prompt', name: 'felixo-context-1-catalog-prompt.txt' }],
      false,
      '/opt/Felixo AI Core/bin/felixo',
    )

    expect(reference).toContain(
      'Leia com: "/opt/Felixo AI Core/bin/felixo" context read "felixo-context-1-catalog-prompt.txt"',
    )
    expect(reference).not.toMatch(/Leia com: felixo context read/)
    expect(reference).toContain('outro comando de mesmo nome pode existir no seu shell')
  })

  it('cai no nome nu "felixo" quando a ponte não devolve o caminho do comando', () => {
    const reference = buildContextFileReferences(
      [{ kind: 'catalog-prompt', name: 'felixo-context-1-catalog-prompt.txt' }],
      false,
    )

    expect(reference).toContain('Leia com: felixo context read "felixo-context-1-catalog-prompt.txt"')
  })

  it('marks inline fallback visibly', () => {
    expect(buildInlineFallback('corpo\r')).toMatch(/^AVISO DO FELIXO AI CORE/)
    expect(buildInlineFallback('corpo\r').endsWith('\r')).toBe(true)
  })
})
