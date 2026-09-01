import { describe, expect, it } from 'vitest'
import {
  appendTerminalOutputPerformanceEvents,
  createEmptyTerminalOutputPerformanceState,
  createTerminalOutputPerformanceFixture,
  TERMINAL_OUTPUT_PERFORMANCE_SCENARIOS,
} from './terminal-output-performance'

describe('fixture de performance dos logs da CLI', () => {
  it('cobre streams curtos, longos, de alta frequência e múltiplas sessões', () => {
    const sizes = TERMINAL_OUTPUT_PERFORMANCE_SCENARIOS.map((scenario) => ({
      scenario,
      events: createTerminalOutputPerformanceFixture(scenario),
    }))

    expect(sizes.map(({ scenario }) => scenario)).toEqual([
      'curta',
      'longa',
      'alta-frequencia',
      'multiplas-sessoes',
    ])
    expect(sizes[0].events.length).toBeGreaterThan(0)
    expect(sizes[1].events.length).toBeGreaterThan(sizes[0].events.length)
    expect(sizes[2].events.length).toBeGreaterThan(sizes[1].events.length)
    expect(
      new Set(sizes[3].events.map((event) => event.sessionId)).size,
    ).toBe(4)
    expect(sizes[2].events.some((event) => event.kind === 'tool')).toBe(true)
    expect(sizes[2].events.some((event) => event.kind === 'assistant')).toBe(true)
  })

  it('compara baseline e política atual sem alterar a carga de entrada', () => {
    const fixture = createTerminalOutputPerformanceFixture('longa')
    const baseline = appendTerminalOutputPerformanceEvents(
      createEmptyTerminalOutputPerformanceState(),
      fixture,
      'baseline',
      '2026-09-01T12:00:00.000Z',
    )
    const current = appendTerminalOutputPerformanceEvents(
      createEmptyTerminalOutputPerformanceState(),
      fixture,
      'atual',
      '2026-09-01T12:00:00.000Z',
    )

    expect(fixture.length).toBeGreaterThan(600)
    expect(baseline.sessions['benchmark-session-1'].totalChunkCount).toBe(
      current.sessions['benchmark-session-1'].totalChunkCount,
    )
    expect(current.sessions['benchmark-session-1'].chunks.length).toBeLessThanOrEqual(240)
    expect(current.sessions['benchmark-session-1'].droppedChunkCount).toBeGreaterThan(0)
    expect(current.sessions['benchmark-session-1'].outputSize).toBe(
      baseline.sessions['benchmark-session-1'].outputSize,
    )
    expect(current.sessions['benchmark-session-1'].chunks.at(-1)?.chunk).toBe(
      baseline.sessions['benchmark-session-1'].chunks.at(-1)?.chunk,
    )
  })

  it('aplica batching por lote sem misturar identidades de sessão', () => {
    const fixture = createTerminalOutputPerformanceFixture('multiplas-sessoes')
    const firstBatch = fixture.slice(0, 37)
    const secondBatch = fixture.slice(37)
    const first = appendTerminalOutputPerformanceEvents(
      createEmptyTerminalOutputPerformanceState(),
      firstBatch,
      'atual',
      '2026-09-01T12:00:00.000Z',
    )
    const final = appendTerminalOutputPerformanceEvents(
      first,
      secondBatch,
      'atual',
      '2026-09-01T12:00:01.000Z',
    )

    expect(Object.keys(final.sessions)).toHaveLength(4)
    expect(final.sessions['benchmark-session-1'].parentThreadId).toBeUndefined()
    expect(final.sessions['benchmark-session-1'].totalChunkCount).toBeGreaterThan(0)
    expect(final.sessions['benchmark-session-4'].totalChunkCount).toBeGreaterThan(0)
  })
})
