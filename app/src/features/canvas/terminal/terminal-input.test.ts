import { describe, expect, it } from 'vitest'
import { toSubmittedTerminalText } from './terminal-input'

describe('toSubmittedTerminalText', () => {
  it('submits a prompt with CR instead of leaving a trailing LF in the PTY', () => {
    expect(toSubmittedTerminalText('Leia o plano\n')).toBe('Leia o plano\r')
    expect(toSubmittedTerminalText('Leia o plano\r\n')).toBe('Leia o plano\r')
  })

  it('preserves internal line breaks while normalizing the final submission key', () => {
    expect(toSubmittedTerminalText('Primeira linha\nSegunda linha')).toBe(
      'Primeira linha\nSegunda linha\r',
    )
  })
})
