import { describe, expect, it } from 'vitest'
import { createRollingText } from './rolling-text'

/** PRNG com semente: a mesma sequência em toda rodada. */
function seeded(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('janela rolante das telas de aceite', () => {
  it('propriedade: sempre igual ao concat + slice que ela substitui, lendo no meio ou não', () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const random = seeded(seed)
      const limit = 1 + Math.floor(random() * 40)
      const rolling = createRollingText(limit)
      let expected = ''
      for (let step = 0; step < 80; step += 1) {
        const size = Math.floor(random() * 25)
        const chunk = Array.from({ length: size }, () => String.fromCharCode(97 + Math.floor(random() * 26))).join('')
        rolling.append(chunk)
        expected = (expected + chunk).slice(-limit)
        if (random() < 0.4) expect(rolling.toString(), `semente ${seed}`).toBe(expected)
      }
      expect(rolling.toString(), `semente ${seed}`).toBe(expected)
    }
  })

  it('lendo a cada pedaço, a memória segura no máximo o limite mais um pedaço', () => {
    // O defeito pego na medição: a junção inteira ficava guardada e crescia sem teto.
    const rolling = createRollingText(100)
    let maximo = 0
    for (let index = 0; index < 5000; index += 1) {
      rolling.append('x'.repeat(30))
      rolling.toString()
      maximo = Math.max(maximo, rolling.heldChars)
    }
    expect(maximo).toBeLessThanOrEqual(100 + 30)
  })

  it('pedaço maior que o limite e clear', () => {
    const rolling = createRollingText(5)
    rolling.append('abc')
    rolling.append('0123456789')
    expect(rolling.toString()).toBe('56789')
    rolling.clear()
    expect(rolling.toString()).toBe('')
    rolling.append('xy')
    expect(rolling.toString()).toBe('xy')
  })
})
