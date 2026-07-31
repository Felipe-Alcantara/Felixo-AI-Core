import { describe, expect, it } from 'vitest'
import { RESUME_INITIAL_TEXT, resolveTerminalInitialText } from './quality-standard-prompt'

describe('resolveTerminalInitialText', () => {
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
