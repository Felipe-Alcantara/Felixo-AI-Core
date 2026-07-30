import { describe, expect, it } from 'vitest'
import {
  createCliPrompt,
  resolveActiveProjectCwd,
  shouldUseLeanContextForCurrentPrompt,
  shouldUseOrchestrationProtocol,
} from './cli-prompt'
import type { ChatMessage, ContextAttachment, Model, Project } from '../types'

const claudeModel: Model = {
  id: 'claude-1',
  name: 'Claude',
  command: 'claude',
  source: 'Claude CLI',
  cliType: 'claude',
}

const geminiModel: Model = {
  id: 'gemini-1',
  name: 'Gemini',
  command: 'gemini',
  source: 'Gemini CLI',
  cliType: 'gemini',
}

function makeMessage(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: 1,
    role: 'user',
    content: 'oi',
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('shouldUseLeanContextForCurrentPrompt', () => {
  it('returns true for known simple greetings', () => {
    expect(shouldUseLeanContextForCurrentPrompt('oi')).toBe(true)
    expect(shouldUseLeanContextForCurrentPrompt('Bom dia')).toBe(true)
    expect(shouldUseLeanContextForCurrentPrompt('tudo bem?')).toBe(true)
  })

  it('returns false for empty prompt', () => {
    expect(shouldUseLeanContextForCurrentPrompt('   ')).toBe(false)
  })

  it('returns false for long prompts even if they start like a greeting', () => {
    const long = 'oi, ' + 'preciso de ajuda com uma tarefa complexa '.repeat(3)
    expect(shouldUseLeanContextForCurrentPrompt(long)).toBe(false)
  })

  it('returns false for a real task with no keyword match (previous false negative in reverse: greeting variants not in the fixed list)', () => {
    // "valeu" / "obrigado" are common short acknowledgements not covered by
    // the original fixed pattern list — they should still get lean context.
    expect(shouldUseLeanContextForCurrentPrompt('valeu')).toBe(true)
    expect(shouldUseLeanContextForCurrentPrompt('obrigado')).toBe(true)
    expect(shouldUseLeanContextForCurrentPrompt('blz')).toBe(true)
  })

  it('does not treat short action requests as lean context', () => {
    expect(shouldUseLeanContextForCurrentPrompt('crie um arquivo')).toBe(false)
    expect(shouldUseLeanContextForCurrentPrompt('rodando o teste falhou')).toBe(false)
  })
})

describe('shouldUseOrchestrationProtocol', () => {
  it('triggers on explicit agent/CLI mentions', () => {
    expect(shouldUseOrchestrationProtocol('pergunte ao gemini sobre isso')).toBe(true)
    expect(shouldUseOrchestrationProtocol('spawne um sub-agente')).toBe(true)
  })

  it('triggers on action prompts without any agent keyword (delegation policy fallback)', () => {
    expect(shouldUseOrchestrationProtocol('crie um arquivo novo em src/index.ts')).toBe(true)
    expect(shouldUseOrchestrationProtocol('analise o auth.py e explique os riscos')).toBe(true)
  })

  it('does not trigger for trivial greetings, including acknowledgement words previously broken by a regex word-boundary bug', () => {
    expect(shouldUseOrchestrationProtocol('oi')).toBe(false)
    // "obrigad" in delegation-policy's TRIVIAL_PROMPT_REGEX used to be
    // followed by \b, which never matches inside "obrigado"/"obrigada"
    // (the boundary needs a non-word char right after the stem). That made
    // these fall through to the length-based branch of requiresDelegation.
    expect(shouldUseOrchestrationProtocol('obrigado')).toBe(false)
    expect(shouldUseOrchestrationProtocol('obrigada')).toBe(false)
  })

  it('triggers for a long free-form prompt even without action verbs or agent keywords', () => {
    const longPrompt =
      'Estou tentando entender por que o comportamento do sistema muda quando ' +
      'o usuário reinicia a aplicação depois de um tempo parado sem interação.'
    expect(longPrompt.length).toBeGreaterThan(120)
    expect(shouldUseOrchestrationProtocol(longPrompt)).toBe(true)
  })
})

describe('resolveActiveProjectCwd', () => {
  const project: Project = { id: 'p1', name: 'Proj', path: '/tmp/proj' }

  it('returns the path when exactly one active project', () => {
    expect(resolveActiveProjectCwd([project])).toBe('/tmp/proj')
  })

  it('returns undefined when zero or multiple active projects', () => {
    expect(resolveActiveProjectCwd([])).toBeUndefined()
    expect(resolveActiveProjectCwd([project, { ...project, id: 'p2' }])).toBeUndefined()
  })
})

describe('createCliPrompt', () => {
  it('returns the raw prompt unchanged when there is no context at all', () => {
    const result = createCliPrompt(
      [],
      'oi',
      [claudeModel],
      claudeModel,
      [],
      { added: [], removed: [] },
      [],
      { includeHistory: false },
    )
    expect(result).toBe('oi')
  })

  it('uses lean context (no history/projects/attachments) for simple greetings', () => {
    const history = [makeMessage({ id: 1, content: 'mensagem anterior relevante' })]
    const project: Project = { id: 'p1', name: 'Proj', path: '/tmp/proj' }
    const attachment: ContextAttachment = {
      id: 'a1',
      name: 'file.txt',
      type: 'text/plain',
      size: 10,
    }

    const result = createCliPrompt(
      history,
      'oi',
      [claudeModel],
      claudeModel,
      [project],
      { added: [], removed: [] },
      [attachment],
    )

    // Lean context: providerDefaultInstructions/orchestration/history/projects/attachments are suppressed.
    expect(result).not.toContain('Histórico da conversa')
    expect(result).not.toContain('Projetos com contexto ativo')
    expect(result).not.toContain('Anexos de contexto')
    expect(result).not.toContain('Diretrizes de autonomia para Claude')
  })

  it('includes full context for a real task prompt', () => {
    const history = [makeMessage({ id: 1, content: 'mensagem anterior' })]
    const project: Project = { id: 'p1', name: 'Proj', path: '/tmp/proj' }

    const result = createCliPrompt(
      history,
      'crie um novo componente React para o formulário de login',
      [claudeModel],
      claudeModel,
      [project],
      { added: [], removed: [] },
      [],
    )

    expect(result).toContain('Histórico da conversa')
    expect(result).toContain('Projetos com contexto ativo')
    expect(result).toContain('Diretrizes de autonomia para Claude')
    expect(result).toContain('Protocolo de orquestracao multi-agente')
  })

  it('does not inject Claude-specific autonomy instructions for non-Claude models', () => {
    const result = createCliPrompt(
      [],
      'pergunte ao gemini para listar os arquivos do projeto',
      [geminiModel],
      geminiModel,
      [],
      { added: [], removed: [] },
      [],
    )
    expect(result).not.toContain('Diretrizes de autonomia para Claude')
    expect(result).toContain('Protocolo de orquestracao multi-agente')
  })

  it('only injects the orchestration protocol block when the heuristic matches', () => {
    const withoutOrchestration = createCliPrompt(
      [makeMessage({ id: 1, content: 'contexto anterior' })],
      'obrigado, ficou ótimo',
      [claudeModel],
      claudeModel,
      [],
      { added: [], removed: [] },
      [],
    )
    expect(withoutOrchestration).not.toContain('Protocolo de orquestracao multi-agente')
  })

  it('includes global memories and skills blocks when provided', () => {
    const result = createCliPrompt(
      [makeMessage({ id: 1, content: 'contexto anterior' })],
      'analise o desempenho do sistema',
      [claudeModel],
      claudeModel,
      [],
      { added: [], removed: [] },
      [],
      {
        globalMemoriesContextBlock: 'Memorias globais do usuario:\n- gosta de respostas curtas',
        skillsContextBlock: 'Skills e superprompts ativos:\n- skill X',
      },
    )
    expect(result).toContain('gosta de respostas curtas')
    expect(result).toContain('skill X')
  })

  it('limits history to the last 12 messages and offsets the numbering', () => {
    const messages = Array.from({ length: 15 }, (_, index) =>
      makeMessage({
        id: index + 1,
        content: `mensagem ${index + 1}`,
        role: index % 2 === 0 ? 'user' : 'assistant',
      }),
    )

    const result = createCliPrompt(
      messages,
      'analise o historico completo da conversa',
      [claudeModel],
      claudeModel,
      [],
      { added: [], removed: [] },
      [],
    )

    // First 3 messages (1-3) should be dropped; message 4 becomes "Mensagem 4".
    expect(result).not.toContain('mensagem 1\n')
    expect(result).toContain('mensagem 4')
    expect(result).toContain('mensagem 15')
    expect(result).toContain('--- Mensagem 4 ---')
    expect(result).toContain('--- Mensagem 15 ---')
  })

  it('reports the project diff (added/removed) when present', () => {
    const added: Project = { id: 'p2', name: 'Novo', path: '/tmp/novo' }
    const removed: Project = { id: 'p3', name: 'Antigo', path: '/tmp/antigo' }

    const result = createCliPrompt(
      [],
      'implemente a funcionalidade combinando os dois projetos',
      [claudeModel],
      claudeModel,
      [added],
      { added: [added], removed: [removed] },
      [],
    )

    expect(result).toContain('Adicionado: Novo (/tmp/novo)')
    expect(result).toContain('Removido: Antigo')
  })

  it('includes attachment metadata and content preview', () => {
    const attachment: ContextAttachment = {
      id: 'a1',
      name: 'notas.txt',
      type: 'text/plain',
      size: 2048,
      path: '/tmp/notas.txt',
      contentPreview: 'conteudo de exemplo',
    }

    const result = createCliPrompt(
      [],
      'resuma o conteudo do anexo enviado',
      [claudeModel],
      claudeModel,
      [],
      { added: [], removed: [] },
      [attachment],
    )

    expect(result).toContain('notas.txt')
    expect(result).toContain('2.0 KB')
    expect(result).toContain('/tmp/notas.txt')
    expect(result).toContain('conteudo de exemplo')
  })
})
