import { afterEach, describe, expect, it } from 'vitest'
import {
  CONSERVATIVE_BOOT_SIGNALS,
  FIRST_BOOT_MARKER_KEY,
  captureOnboardingBootSignals,
  clearFirstBootMarker,
  getOnboardingBootSignals,
  resetOnboardingBootSignalsForTests,
} from './onboarding-boot-signals'

/** localStorage em memória com a interface completa usada pela captura (`key`/`length`). */
function localStorageWith(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    data,
    get length() {
      return data.size
    },
    key: (index: number) => [...data.keys()][index] ?? null,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  }
}

afterEach(() => {
  resetOnboardingBootSignalsForTests()
})

describe('sinais de boot do tutorial (U-boot)', () => {
  it('sem nenhuma chave do app: grava o marcador e diz primeiro boot', () => {
    const storage = localStorageWith({ 'outra-app.tema': 'x' })
    expect(captureOnboardingBootSignals(storage)).toEqual({ chavesFelixo: false, marcadorPrimeiroBoot: true })
    expect(storage.data.get(FIRST_BOOT_MARKER_KEY)).toBe('1')
    expect(getOnboardingBootSignals()).toEqual({ chavesFelixo: false, marcadorPrimeiroBoot: true })
  })

  it.each([['felixo-ai-core.theme'], ['felixo:canvas-sidebar-collapsed'], ['felixo.legado']])(
    'a chave %s conta como uso anterior e o marcador não é gravado',
    (key) => {
      const storage = localStorageWith({ [key]: '1' })
      expect(captureOnboardingBootSignals(storage)).toEqual({ chavesFelixo: true, marcadorPrimeiroBoot: false })
      expect(storage.data.has(FIRST_BOOT_MARKER_KEY)).toBe(false)
    },
  )

  it('chaves do próprio tutorial (felixo:onboarding:*) não contam como uso', () => {
    const storage = localStorageWith({ 'felixo:onboarding:outra': 'x' })
    expect(captureOnboardingBootSignals(storage)).toEqual({ chavesFelixo: false, marcadorPrimeiroBoot: true })
  })

  it('marcador existente é reconhecido junto com as chaves do tema (boot interrompido)', () => {
    const storage = localStorageWith({ [FIRST_BOOT_MARKER_KEY]: '1', 'felixo-ai-core.theme': 'dark' })
    expect(captureOnboardingBootSignals(storage)).toEqual({ chavesFelixo: true, marcadorPrimeiroBoot: true })
  })

  it('localStorage que lança, ou ausente, devolve o padrão conservador', () => {
    const throwing = {
      get length(): number {
        throw new Error('SecurityError')
      },
      key: () => null,
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {},
    }
    expect(captureOnboardingBootSignals(throwing)).toEqual(CONSERVATIVE_BOOT_SIGNALS)
    expect(captureOnboardingBootSignals(null)).toEqual(CONSERVATIVE_BOOT_SIGNALS)

    const quotaFull = { ...localStorageWith(), setItem: () => {
      throw new Error('QuotaExceededError')
    } }
    expect(captureOnboardingBootSignals(quotaFull)).toEqual(CONSERVATIVE_BOOT_SIGNALS)
  })

  it('sem captura, o padrão conservador (nunca abre por engano)', () => {
    expect(getOnboardingBootSignals()).toEqual({ chavesFelixo: true, marcadorPrimeiroBoot: false })
  })

  it('apagar o marcador é seguro com storage ausente ou que lança', () => {
    const storage = localStorageWith({ [FIRST_BOOT_MARKER_KEY]: '1' })
    clearFirstBootMarker(storage)
    expect(storage.data.has(FIRST_BOOT_MARKER_KEY)).toBe(false)
    expect(() => clearFirstBootMarker(null)).not.toThrow()
    expect(() =>
      clearFirstBootMarker({
        removeItem: () => {
          throw new Error('SecurityError')
        },
      }),
    ).not.toThrow()
  })
})
