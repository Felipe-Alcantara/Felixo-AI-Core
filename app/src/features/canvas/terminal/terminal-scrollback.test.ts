import { describe, expect, it } from 'vitest'

import { TERMINAL_SCROLLBACK } from './terminal-scrollback'

describe('política de scrollback do terminal', () => {
  it('mantém o limite medido para o buffer visual', () => {
    expect(TERMINAL_SCROLLBACK).toBe(20_000)
  })
})
