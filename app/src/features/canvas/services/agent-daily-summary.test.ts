import { describe, expect, it } from 'vitest'
import { formatActiveTime, localDateString, localDayBounds, personAlerts } from './agent-daily-summary'

describe('resumo diário dos agentes', () => {
  it('converte o dia local em limites ISO de 24 h e recusa data inválida', () => {
    const bounds = localDayBounds('2026-11-17')
    expect(bounds).not.toBeNull()
    expect(new Date(bounds!.from).getDate()).toBe(17)
    expect(new Date(bounds!.to).getDate()).toBe(18)
    expect(localDayBounds('2026-02-31')).toBeNull()
    expect(localDayBounds('hoje')).toBeNull()
    expect(localDateString(new Date(2026, 10, 5))).toBe('2026-11-05')
  })

  it('formata o tempo ativo', () => {
    expect(formatActiveTime(30_000)).toBe('menos de 1 min')
    expect(formatActiveTime(12 * 60_000)).toBe('12 min')
    expect(formatActiveTime(65 * 60_000)).toBe('1 h 05 min')
  })

  it('lista só o que chama atenção', () => {
    const base = { responsible: 'Ana', sessions: 2, interactions: 4, active_ms: 0, wall_ms: 0, open: 0, interrupted: 0, idle: 0, agents: [] }
    expect(personAlerts(base)).toEqual([])
    expect(personAlerts({ ...base, open: 1, interrupted: 2, idle: 1 })).toHaveLength(3)
  })
})
