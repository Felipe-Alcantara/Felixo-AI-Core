import { describe, expect, it } from 'vitest'
import { DEVTOOLS_FAULT_KEY, readDevtoolsFault } from './onboarding-devtools'

const sessionWith = (value: string | null) => ({ getItem: (key: string) => (key === DEVTOOLS_FAULT_KEY ? value : null) })

describe('falha forçada do tutorial (U-boot)', () => {
  it('vale só na instância devtools', () => {
    expect(readDevtoolsFault({ felixo: { devtools: {} }, sessionStorage: sessionWith('render') })).toBe('render')
  })

  it('é ignorada sem a ponte window.felixo.devtools (app normal)', () => {
    expect(readDevtoolsFault({ felixo: {}, sessionStorage: sessionWith('render') })).toBeNull()
    expect(readDevtoolsFault({ sessionStorage: sessionWith('render') })).toBeNull()
    expect(readDevtoolsFault(undefined)).toBeNull()
  })

  it('outros valores e storage que lança não disparam nada', () => {
    expect(readDevtoolsFault({ felixo: { devtools: {} }, sessionStorage: sessionWith('outra') })).toBeNull()
    expect(readDevtoolsFault({ felixo: { devtools: {} }, sessionStorage: sessionWith(null) })).toBeNull()
    expect(
      readDevtoolsFault({
        felixo: { devtools: {} },
        sessionStorage: {
          getItem: () => {
            throw new Error('SecurityError')
          },
        },
      }),
    ).toBeNull()
  })
})
