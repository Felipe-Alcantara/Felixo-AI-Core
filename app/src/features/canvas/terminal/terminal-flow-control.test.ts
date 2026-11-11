import { describe, expect, it } from 'vitest'
import { createFlowControl, FLOW_HIGH_WATERMARK_CHARS, FLOW_LOW_WATERMARK_CHARS } from './terminal-flow-control'

describe('controle de fluxo do terminal', () => {
  it('pausa só acima da marca alta e retoma só abaixo da baixa, uma vez por mudança', () => {
    const changes: boolean[] = []
    const flow = createFlowControl((paused) => changes.push(paused))

    flow.written(FLOW_HIGH_WATERMARK_CHARS)
    expect(changes).toEqual([])
    flow.written(1)
    flow.written(1000)
    expect(changes).toEqual([true])

    // Entre as marcas fica pausado: escoar um pouco não retoma.
    flow.parsed(FLOW_HIGH_WATERMARK_CHARS - FLOW_LOW_WATERMARK_CHARS)
    expect(flow.paused).toBe(true)
    flow.parsed(2000)
    expect(changes).toEqual([true, false])
  })

  it('o ritmo de um agente (pedaços pequenos escoando) nunca pausa', () => {
    const changes: boolean[] = []
    const flow = createFlowControl((paused) => changes.push(paused))
    for (let index = 0; index < 100_000; index += 1) {
      flow.written(120)
      if (index % 3 === 0) flow.parsed(360)
    }
    expect(changes).toEqual([])
  })

  it('release retoma o que estava pausado e não faz nada no resto', () => {
    const changes: boolean[] = []
    const flow = createFlowControl((paused) => changes.push(paused))
    flow.release()
    flow.written(FLOW_HIGH_WATERMARK_CHARS + 1)
    flow.release()
    expect(changes).toEqual([true, false])
    // Contagem que passaria de zero não vira negativa e não pausa sozinha.
    flow.parsed(10 * FLOW_HIGH_WATERMARK_CHARS)
    flow.written(FLOW_LOW_WATERMARK_CHARS)
    expect(changes).toEqual([true, false])
  })
})
