import { describe, expect, it } from 'vitest'
import {
  buildPlanningFileInstruction,
  composeTerminalInitialText,
  isTerminalInitialTextReady,
  RESUME_INITIAL_TEXT,
  resolveTerminalInitialText,
} from './quality-standard-prompt'

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

describe('planning-file initial text', () => {
  it('accepts any file type and tells the agent to read it before starting', () => {
    const instruction = buildPlanningFileInstruction(' /repo/plans/release-plan.pdf ')

    expect(instruction).toContain('ARQUIVO DE PLANEJAMENTO OBRIGATÓRIO')
    expect(instruction).toContain('/repo/plans/release-plan.pdf')
  })

  it('combines the quality standard and plan into one submitted prompt', () => {
    expect(
      composeTerminalInitialText('Siga o padrão de qualidade.\n', 'Leia o plano.'),
    ).toBe('Siga o padrão de qualidade.\n\nLeia o plano.\r')
  })

  it('does not create text when neither instruction is configured', () => {
    expect(composeTerminalInitialText(undefined, undefined)).toBeUndefined()
  })
})
