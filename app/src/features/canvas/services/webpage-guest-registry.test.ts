import { describe, expect, it } from 'vitest'

import { describeGuestAddress, findWebpageGuest, registerWebpageGuest } from './webpage-guest-registry'

describe('webpage-guest-registry', () => {
  it('liga o bloco ao guest e solta só o que o próprio registro pôs', () => {
    const first = { guestId: 1, getUrl: () => 'https://a.test/', profileName: 'Padrão' }
    const second = { guestId: 2, getUrl: () => 'https://b.test/', profileName: 'Trabalho' }
    const releaseFirst = registerWebpageGuest('w1', first)
    registerWebpageGuest('w1', second)
    releaseFirst()
    expect(findWebpageGuest('w1')).toBe(second)
    expect(findWebpageGuest('nao-existe')).toBeNull()
  })

  it('mostra o endereço sem query nem hash', () => {
    expect(describeGuestAddress('https://example.com/a/b?token=abc#x')).toBe('https://example.com/a/b')
    expect(describeGuestAddress('')).toBe('Página em branco')
  })
})
