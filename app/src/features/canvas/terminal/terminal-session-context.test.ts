import { describe, expect, it } from 'vitest'
import { createStableValue } from './terminal-session-context'
import { sameIdSet } from './session-notifications'

describe('createStableValue (seletor sobre todos os snapshots)', () => {
  it('devolve o MESMO valor enquanto o novo for igual, e o novo quando muda', () => {
    const stabilize = createStableValue(sameIdSet)
    const first = stabilize(new Set(['a']))
    // Uma transição de outra sessão recalcula o derivado, mas ele não mudou.
    expect(stabilize(new Set(['a']))).toBe(first)
    const changed = stabilize(new Set(['a', 'b']))
    expect(changed).not.toBe(first)
    expect(stabilize(new Set(['b', 'a']))).toBe(changed)
  })

  it('o primeiro valor sai como veio, mesmo vazio', () => {
    const stabilize = createStableValue<readonly string[]>((a, b) => a.join() === b.join())
    const empty: readonly string[] = []
    expect(stabilize(empty)).toBe(empty)
  })
})
