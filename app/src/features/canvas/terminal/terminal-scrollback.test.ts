import { describe, expect, it } from 'vitest'

import {
  TERMINAL_ADAPTIVE_SCROLLBACK,
  TERMINAL_ADAPTIVE_THRESHOLD,
  TERMINAL_REPLAY_BUFFER_CHARS,
  TERMINAL_SCROLLBACK,
  formatTerminalScrollbackLines,
  terminalScrollbackForSessionCount,
  terminalScrollbackNotice,
} from './terminal-scrollback'

describe('política de scrollback do terminal', () => {
  it('mantém o limite completo medido para poucos terminais', () => {
    expect(TERMINAL_SCROLLBACK).toBe(20_000)
    expect(terminalScrollbackForSessionCount(1)).toBe(TERMINAL_SCROLLBACK)
    expect(terminalScrollbackForSessionCount(TERMINAL_ADAPTIVE_THRESHOLD - 1)).toBe(
      TERMINAL_SCROLLBACK,
    )
  })

  it('compacta novas sessões a partir de dez terminais', () => {
    expect(terminalScrollbackForSessionCount(TERMINAL_ADAPTIVE_THRESHOLD)).toBe(
      TERMINAL_ADAPTIVE_SCROLLBACK,
    )
    expect(terminalScrollbackForSessionCount(20)).toBe(TERMINAL_ADAPTIVE_SCROLLBACK)
  })

  it('permite manter o contrato completo quando a política adaptativa não está ativa', () => {
    expect(terminalScrollbackForSessionCount(20, 'full')).toBe(TERMINAL_SCROLLBACK)
    expect(terminalScrollbackForSessionCount(Number.NaN)).toBe(TERMINAL_SCROLLBACK)
  })

  it('explica o rollover visual e o caminho do replay', () => {
    expect(terminalScrollbackNotice(undefined)).toBeUndefined()
    expect(
      terminalScrollbackNotice({
        limit: TERMINAL_ADAPTIVE_SCROLLBACK,
        retainedRows: 5_032,
        outputLines: 8_000,
        historyTruncated: true,
        replayLimitChars: TERMINAL_REPLAY_BUFFER_CHARS,
      }),
    ).toContain('5.000 linhas')
    expect(terminalScrollbackNotice({
      limit: 20_000,
      retainedRows: 32,
      outputLines: 1,
      historyTruncated: false,
      replayLimitChars: TERMINAL_REPLAY_BUFFER_CHARS,
    })).toBeUndefined()
    expect(formatTerminalScrollbackLines(TERMINAL_REPLAY_BUFFER_CHARS)).toBe('200.000')
  })
})
