import { describe, expect, it } from 'vitest'
import {
  buildContextFileReferences,
  buildInlineFallback,
  contextFileKindForPrompt,
  isAgentCliCommand,
  quoteContextFilePath,
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

  it('quotes a path containing a double quote without changing its value', () => {
    expect(quoteContextFilePath('/tmp/um"arquivo.txt')).toBe('"/tmp/um\\"arquivo.txt"')
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
        { kind: 'initial-context', path: '/tmp/context one.txt' },
        { kind: 'handoff', path: '/tmp/context two.txt' },
      ],
      true,
    )

    expect(reference).toContain('initial-context: "/tmp/context one.txt"')
    expect(reference).toContain('handoff: "/tmp/context two.txt"')
    expect(reference).toContain('não fazem parte do repositório')
    expect(reference.endsWith('\r')).toBe(true)
  })

  it('marks inline fallback visibly', () => {
    expect(buildInlineFallback('corpo\r')).toMatch(/^AVISO DO FELIXO AI CORE/)
    expect(buildInlineFallback('corpo\r').endsWith('\r')).toBe(true)
  })
})
