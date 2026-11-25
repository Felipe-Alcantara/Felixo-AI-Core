import { describe, expect, it } from 'vitest'
import {
  broadcastSequentially,
  bulkSelectableIds,
  needsBroadcastConfirmation,
  toggleGroup,
  toggleSelected,
} from './terminals-panel-broadcast'

describe('seleção do envio em massa', () => {
  const targets = [
    { id: 'a', activity: 'idle' },
    { id: 'b', activity: 'waiting_approval' },
    { id: 'c', activity: 'working' },
    { id: 'd', activity: 'exited' },
  ]

  it('pasta e todos deixam de fora quem espera aprovação e quem saiu', () => {
    expect(bulkSelectableIds(targets)).toEqual(['a', 'c'])
  })

  it('alterna um id sem duplicar', () => {
    expect(toggleSelected(['a'], 'b')).toEqual(['a', 'b'])
    expect(toggleSelected(['a', 'b'], 'a')).toEqual(['b'])
  })

  it('a pasta marca os que faltam e, com todos marcados, desmarca só ela', () => {
    expect(toggleGroup(['x', 'a'], ['a', 'c'])).toEqual(['x', 'a', 'c'])
    expect(toggleGroup(['x', 'a', 'c'], ['a', 'c'])).toEqual(['x'])
    expect(toggleGroup(['x'], [])).toEqual(['x'])
  })

  it('pede confirmação só acima de 5 destinatários', () => {
    expect(needsBroadcastConfirmation(5)).toBe(false)
    expect(needsBroadcastConfirmation(6)).toBe(true)
  })
})

describe('broadcastSequentially', () => {
  it('envia um por vez, em ordem, e reporta o resultado de cada um', async () => {
    const order: string[] = []
    let running = 0
    let maxRunning = 0
    const progress: string[] = []
    const results = await broadcastSequentially(
      ['a', 'b', 'c'],
      async (id) => {
        running += 1
        maxRunning = Math.max(maxRunning, running)
        order.push(id)
        await Promise.resolve()
        running -= 1
        if (id === 'b') throw new Error('pty caiu')
        return id !== 'c'
      },
      (r) => progress.push(JSON.stringify(r)),
    )
    expect(order).toEqual(['a', 'b', 'c'])
    expect(maxRunning).toBe(1)
    expect(results).toEqual({ a: 'delivered', b: 'failed', c: 'failed' })
    expect(JSON.parse(progress[0])).toEqual({ a: 'sending', b: 'sending', c: 'sending' })
  })
})
