import { describe, expect, it } from 'vitest'
import {
  buildPlanningFileInstruction,
  buildCanvasTerminalInitialText,
  composeTerminalInitialText,
  isTerminalInitialTextReady,
  RESUME_INITIAL_TEXT,
  resolveTerminalInitialText,
} from './quality-standard-prompt'
import {
  isSubmittedTerminalText,
  splitTerminalSubmission,
  toSubmittedTerminalText,
} from '../terminal/terminal-input'

describe('resolveTerminalInitialText', () => {
  it('uses Codex slash-command casing and submits it with Enter', () => {
    expect(RESUME_INITIAL_TEXT).toBe('/resume\r')
  })

  it('types "/resume" for a restored agent terminal, ignoring the quality standard entirely', () => {
    const result = resolveTerminalInitialText({
      isRestoredAgent: true,
      qualityStandardEnabled: true,
      qualityStandardPrompt: 'Follow the standard.',
      hasCommand: true,
      existingInitialText: 'some standing instruction',
      canvasFilePaths: ['notes.md'],
      identity: { agentName: 'Agent A', cwd: '/repo' },
    })
    expect(result).toBe(RESUME_INITIAL_TEXT)
  })

  it('still resumes a restored agent terminal even when the quality standard is disabled', () => {
    const result = resolveTerminalInitialText({
      isRestoredAgent: true,
      qualityStandardEnabled: false,
      qualityStandardPrompt: 'Follow the standard.',
      hasCommand: true,
    })
    expect(result).toBe(RESUME_INITIAL_TEXT)
  })

  it('não digita /resume quando o lançamento já aponta para o ID compatível', () => {
    const result = resolveTerminalInitialText({
      isRestoredAgent: true,
      qualityStandardEnabled: true,
      qualityStandardPrompt: 'Follow the standard.',
      hasCommand: true,
      command: 'codex',
      cwd: '/repo',
      resumeAgentSession: true,
      agentSession: {
        version: 1,
        provider: 'codex',
        sessionId: 'codex-session-123',
        cwd: '/repo',
        capturedAt: 1,
      },
    })
    expect(result).toBeUndefined()
  })

  it('exibe fallback honesto quando o diretório salvo mudou', () => {
    const result = resolveTerminalInitialText({
      isRestoredAgent: true,
      qualityStandardEnabled: true,
      qualityStandardPrompt: 'Follow the standard.',
      hasCommand: true,
      command: 'codex',
      cwd: '/other-repo',
      agentSession: {
        version: 1,
        provider: 'codex',
        sessionId: 'codex-session-123',
        cwd: '/repo',
        capturedAt: 1,
      },
    })
    expect(result).toContain('nenhum ID foi usado')
  })

  it('exibe fallback honesto para Gemini sem enviar UUID à CLI', () => {
    const result = resolveTerminalInitialText({
      isRestoredAgent: true,
      qualityStandardEnabled: true,
      qualityStandardPrompt: 'Follow the standard.',
      hasCommand: true,
      command: 'gemini',
      cwd: '/repo',
      agentSession: {
        version: 1,
        provider: 'gemini',
        sessionId: 'gemini-session-123',
        cwd: '/repo',
        capturedAt: 1,
      },
    })

    expect(result).toContain('índice muda')
    expect(result).toContain('Use /resume')
    expect(result).not.toBe(RESUME_INITIAL_TEXT)
  })

  it('does not resume a restored PLAIN SHELL (no command) — "/resume" is an agent CLI slash command, and this function enforces that even if a caller mismarks isRestoredAgent', () => {
    const result = resolveTerminalInitialText({
      isRestoredAgent: true,
      qualityStandardEnabled: true,
      qualityStandardPrompt: 'Follow the standard.',
      hasCommand: false,
      existingInitialText: 'ls -la',
    })
    expect(result).toBe('ls -la')
  })

  it('falls back to the quality-standard prompt for a freshly created agent terminal', () => {
    const result = resolveTerminalInitialText({
      isRestoredAgent: false,
      qualityStandardEnabled: true,
      qualityStandardPrompt: 'Follow the standard.',
      hasCommand: true,
    })
    expect(result).toContain('Follow the standard.')
  })

  it('falls back to the raw existing initialText when the quality standard is disabled', () => {
    const result = resolveTerminalInitialText({
      isRestoredAgent: false,
      qualityStandardEnabled: false,
      qualityStandardPrompt: 'Follow the standard.',
      hasCommand: true,
      existingInitialText: 'do the thing',
    })
    expect(result).toBe('do the thing')
  })

  it('falls back to the raw existing initialText for a plain shell (no command), regardless of the quality toggle', () => {
    const result = resolveTerminalInitialText({
      isRestoredAgent: false,
      qualityStandardEnabled: true,
      qualityStandardPrompt: 'Follow the standard.',
      hasCommand: false,
      existingInitialText: 'ls -la',
    })
    expect(result).toBe('ls -la')
  })
})

// A regra que separa "preparar o agente" de "mandar ele trabalhar". Quando o
// contexto era submetido, o agente subia executando: o usuário perdia a janela
// para escrever a tarefa e a CLI ia caçar um pedido dentro do texto de
// contexto. A quebra final é o que carrega essa intenção até o PTY.
describe('intenção de envio do prompt inicial', () => {
  const contexto = {
    isRestoredAgent: false,
    qualityStandardEnabled: true,
    qualityStandardPrompt: 'Siga o padrão.',
    hasCommand: true,
    canvasFilePaths: ['notas.md'],
    identity: { agentName: 'Agente A', cwd: '/repo' },
  }

  // O relato era de que só ALGUNS agentes enviavam sozinhos; o caminho é o
  // mesmo para os três, então a checagem vale para todos de uma vez.
  it('não submete o contexto permanente de nenhum agente (claude, codex, gemini)', () => {
    const inicial = resolveTerminalInitialText(contexto)

    expect(inicial).toContain('Siga o padrão.')
    expect(inicial).toContain('notas.md')
    expect(inicial).toContain('Agente A')
    expect(isSubmittedTerminalText(inicial ?? '')).toBe(false)
    expect(splitTerminalSubmission(inicial ?? '').submit).toBeNull()
  })

  it('mantém submetida a passagem de responsabilidade, que carrega um pedido de verdade', () => {
    const handoff = toSubmittedTerminalText('Continue de onde o outro agente parou.')
    const inicial = resolveTerminalInitialText({ ...contexto, existingInitialText: handoff })

    expect(inicial).toContain('Continue de onde o outro agente parou.')
    expect(isSubmittedTerminalText(inicial ?? '')).toBe(true)
    expect(splitTerminalSubmission(inicial ?? '').submit).toBe('\r')
  })

  it('mantém submetido o "/resume" de um agente restaurado — é um comando para rodar, não contexto', () => {
    const inicial = resolveTerminalInitialText({ ...contexto, isRestoredAgent: true })

    expect(inicial).toBe(RESUME_INITIAL_TEXT)
    expect(splitTerminalSubmission(inicial ?? '').submit).toBe('\r')
  })

  it('não inventa envio para um terminal comum, que nunca teve instrução permanente', () => {
    const inicial = resolveTerminalInitialText({
      ...contexto,
      hasCommand: false,
      existingInitialText: 'ls -la',
    })

    expect(splitTerminalSubmission(inicial ?? '').submit).toBeNull()
  })
})

describe('terminal initial-text readiness', () => {
  it('waits for the restored-agent capture before spawning a terminal', () => {
    expect(
      isTerminalInitialTextReady({
        restoredAgentsCaptured: false,
        edgesHydrated: true,
        connectedCanvasFileCount: 0,
        resolvedCanvasFileCount: 0,
      }),
    ).toBe(false)
  })

  it('starts only after the restored capture and linked canvas files are ready', () => {
    expect(
      isTerminalInitialTextReady({
        restoredAgentsCaptured: true,
        edgesHydrated: true,
        connectedCanvasFileCount: 1,
        resolvedCanvasFileCount: 0,
      }),
    ).toBe(false)

    expect(
      isTerminalInitialTextReady({
        restoredAgentsCaptured: true,
        edgesHydrated: true,
        connectedCanvasFileCount: 1,
        resolvedCanvasFileCount: 1,
      }),
    ).toBe(true)
  })
})

describe('discovery of the generic DevTools CLI', () => {
  it('informs every new terminal about the isolated UI runner', () => {
    const text = buildCanvasTerminalInitialText('Siga o padrão.')

    expect(text).toContain('felixo devtools --help')
    expect(text).toContain('perfil isolado')
  })
})

describe('planning-file initial text', () => {
  it('accepts any file type and tells the agent to read it before starting', () => {
    const instruction = buildPlanningFileInstruction(' /repo/plans/release-plan.pdf ')

    expect(instruction).toContain('ARQUIVO DE PLANEJAMENTO OBRIGATÓRIO')
    expect(instruction).toContain('/repo/plans/release-plan.pdf')
  })

  it('combines the quality standard and plan into one prompt, without submitting it', () => {
    expect(
      composeTerminalInitialText('Siga o padrão de qualidade.\n', 'Leia o plano.'),
    ).toBe('Siga o padrão de qualidade.\n\nLeia o plano.')
  })

  it('does not create text when neither instruction is configured', () => {
    expect(composeTerminalInitialText(undefined, undefined)).toBeUndefined()
  })
})
