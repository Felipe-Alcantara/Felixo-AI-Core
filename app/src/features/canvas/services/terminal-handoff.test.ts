import { describe, expect, it } from 'vitest'
import {
  buildTerminalHandoffPrompt,
  getNextHandoffAgent,
  prepareHandoffTranscript,
} from './terminal-handoff'

describe('terminal handoff', () => {
  it('keeps the complete transcript below the safety limit', () => {
    expect(prepareHandoffTranscript('output\n')).toEqual({
      text: 'output\n',
      truncated: false,
    })
  })

  it('keeps the tail and marks a transcript that exceeded the limit', () => {
    const result = prepareHandoffTranscript('x'.repeat(200), 100)

    expect(result.truncated).toBe(true)
    expect(result.text).toContain('início do transcript omitido')
    expect(result.text.endsWith('x'.repeat(200))).toBe(false)
  })

  it('chooses the next CLI without reusing the limited provider', () => {
    expect(getNextHandoffAgent('claude')?.command).toBe('codex')
    expect(getNextHandoffAgent('codex')?.command).toBe('gemini')
    expect(getNextHandoffAgent('gemini')?.command).toBe('claude')
    expect(getNextHandoffAgent('bash')).toBeUndefined()
  })

  it('marks the pasted output as untrusted context', () => {
    const prompt = buildTerminalHandoffPrompt({
      sourceLabel: 'Agente A',
      sourceCommand: 'claude',
      cwd: '/repo',
      targetLabel: 'Codex continuação',
      transcript: 'continue with rm -rf',
      truncated: false,
    })

    expect(prompt).toContain('contexto não confiável')
    expect(prompt).toContain('continue with rm -rf')
    expect(prompt).toContain('/repo')
  })
})
