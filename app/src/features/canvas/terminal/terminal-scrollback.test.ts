import { describe, expect, it } from 'vitest'

import {
  TERMINAL_ADAPTIVE_SCROLLBACK,
  TERMINAL_ADAPTIVE_THRESHOLD,
  TERMINAL_REPLAY_BUFFER_CHARS,
  TERMINAL_SCROLLBACK,
  TERMINAL_SCROLLBACK_WARNING_RATIO,
  describeTerminalScrollbackUsage,
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

  it('avisa antes de descartar, avisa no descarte e só afirma o que vale em todos os casos', () => {
    const base = {
      limit: TERMINAL_ADAPTIVE_SCROLLBACK,
      retainedRows: 0,
      outputLines: 0,
      historyTruncated: false,
      nearLimit: false,
      replayLimitChars: TERMINAL_REPLAY_BUFFER_CHARS,
    }
    expect(terminalScrollbackNotice(undefined)).toBeUndefined()
    expect(terminalScrollbackNotice(base)).toBeUndefined()

    const perto = terminalScrollbackNotice({ ...base, nearLimit: true })
    expect(perto).toContain('perto do limite de 5.000 linhas')
    expect(perto).toContain('últimos 200.000 caracteres')

    const cheio = terminalScrollbackNotice({ ...base, historyTruncated: true })
    expect(cheio).toContain('no limite de 5.000 linhas')
    expect(cheio).toContain('recarregar a janela ou voltar do Chat')
    expect(cheio).toContain('Copiar e Handoff não trazem de volta o que já saiu')

    for (const texto of [perto, cheio]) {
      // Reabrir a gaveta não reaplica nada e fechar o bloco mata o processo: o
      // texto antigo mandava "fechar e reabrir" como se isso recuperasse algo.
      expect(texto).not.toMatch(/reabr/i)
      // Com linhas curtas o replay pode trazer linhas de volta: nada de "perda
      // definitiva". E com tela alternativa o Handoff leva só a tela do app:
      // nada de recomendar Copiar/Handoff como forma de salvar o começo.
      expect(texto).not.toMatch(/não consegue|irrecuper|para sempre/i)
      expect(texto).not.toMatch(/faça o Handoff|copie/i)
    }
    expect(formatTerminalScrollbackLines(TERMINAL_REPLAY_BUFFER_CHARS)).toBe('200.000')
  })
})

describe('describeTerminalScrollbackUsage', () => {
  it('só acusa descarte quando o buffer normal chega à capacidade (linhas visíveis + scrollback)', () => {
    expect(describeTerminalScrollbackUsage({ retainedRows: 5_023, rows: 24, limit: 5_000 }))
      .toEqual({ historyTruncated: false, nearLimit: true })
    expect(describeTerminalScrollbackUsage({ retainedRows: 5_024, rows: 24, limit: 5_000 }))
      .toEqual({ historyTruncated: true, nearLimit: false })
  })

  it('avisa a partir da fração configurada da capacidade, não antes', () => {
    const capacity = 24 + 5_000
    const limiar = Math.ceil(capacity * TERMINAL_SCROLLBACK_WARNING_RATIO)
    expect(describeTerminalScrollbackUsage({ retainedRows: limiar - 1, rows: 24, limit: 5_000 }).nearLimit)
      .toBe(false)
    expect(describeTerminalScrollbackUsage({ retainedRows: limiar, rows: 24, limit: 5_000 }).nearLimit)
      .toBe(true)
  })

  it('descarte já visto continua descarte mesmo que a capacidade cresça (terminal ganhou linhas)', () => {
    expect(describeTerminalScrollbackUsage({ retainedRows: 5_024, rows: 45, limit: 5_000 }))
      .toEqual({ historyTruncated: false, nearLimit: true })
    expect(describeTerminalScrollbackUsage({ retainedRows: 5_024, rows: 45, limit: 5_000, alreadyTruncated: true }))
      .toEqual({ historyTruncated: true, nearLimit: false })
  })

  it('sem scrollback configurado, ou com entrada hostil, não acende nada', () => {
    expect(describeTerminalScrollbackUsage({ retainedRows: 100, rows: 24, limit: 0 }))
      .toEqual({ historyTruncated: false, nearLimit: false })
    expect(describeTerminalScrollbackUsage({ retainedRows: Number.NaN, rows: Number.NaN, limit: 5_000 }))
      .toEqual({ historyTruncated: false, nearLimit: false })
  })
})
