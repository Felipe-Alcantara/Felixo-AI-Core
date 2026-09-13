import { describe, expect, it } from 'vitest'
import { claimFelixoSelect, releaseFelixoSelect } from './felixo-select-coordinator'

describe('felixo select coordinator', () => {
  it('fecha o select anterior quando outro assume o foco', () => {
    const closed: string[] = []
    const releaseFirst = claimFelixoSelect(() => closed.push('first'))

    claimFelixoSelect(() => closed.push('second'))

    expect(closed).toEqual(['first'])
    releaseFirst()
    expect(closed).toEqual(['first'])
  })

  it('não permite que a liberação de um select antigo solte o atual', () => {
    const closed: string[] = []
    const releaseFirst = claimFelixoSelect(() => closed.push('first'))
    const releaseSecond = claimFelixoSelect(() => closed.push('second'))

    releaseFirst()
    releaseSecond()
    claimFelixoSelect(() => closed.push('third'))

    expect(closed).toEqual(['first'])
  })

  it('libera o dono atual explicitamente', () => {
    const closed: string[] = []
    const closedCurrent = () => closed.push('current')
    claimFelixoSelect(closedCurrent)

    releaseFelixoSelect(closedCurrent)
    claimFelixoSelect(() => closed.push('next'))

    expect(closed).toEqual([])
  })
})
