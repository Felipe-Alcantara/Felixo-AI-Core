import { describe, expect, it } from 'vitest'
import { detectTerminalUsageLimit } from './terminal-usage-limit'

describe('detectTerminalUsageLimit', () => {
  it('detects an explicit provider limit and preserves the reset label', () => {
    expect(
      detectTerminalUsageLimit("You're out of extra usage · resets 4:40pm"),
    ).toEqual({
      reason: "You're out of extra usage · resets 4:40pm",
      resetLabel: '4:40pm',
    })
  })

  it('detects Portuguese limit messages', () => {
    expect(detectTerminalUsageLimit('Limite de uso atingido.')).toEqual({
      reason: 'Limite de uso atingido.',
    })
  })

  it('returns nothing for normal output', () => {
    expect(detectTerminalUsageLimit('Implemented the fix and tests are green.')).toBeUndefined()
  })
})
