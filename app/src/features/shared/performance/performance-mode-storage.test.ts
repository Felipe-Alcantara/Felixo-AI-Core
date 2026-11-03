import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  loadPerformanceMode,
  PERFORMANCE_MODE_STORAGE_KEY,
  savePerformanceMode,
} from './performance-mode-storage'

const LEGACY_KEY = 'felixo-ai-core.performance-mode'

function useStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))
  const localStorage = {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
  }
  vi.stubGlobal('window', { localStorage })
  return { values, localStorage }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('preferência versionada do Modo Performance', () => {
  it('usa Normal como padrão quando não há valor salvo', () => {
    useStorage()

    expect(loadPerformanceMode()).toBe(false)
  })

  it('lê o valor atual versionado antes de consultar a chave antiga', () => {
    const { localStorage } = useStorage({
      [PERFORMANCE_MODE_STORAGE_KEY]: 'off',
      [LEGACY_KEY]: 'on',
    })

    expect(loadPerformanceMode()).toBe(false)
    expect(localStorage.getItem).toHaveBeenCalledExactlyOnceWith(PERFORMANCE_MODE_STORAGE_KEY)
  })

  it.each(['on', 'off'] as const)('migra a preferência antiga %s sem alterar seu valor', (value) => {
    const { values } = useStorage({ [LEGACY_KEY]: value })

    expect(loadPerformanceMode()).toBe(value === 'on')
    expect(values.get(PERFORMANCE_MODE_STORAGE_KEY)).toBe(value)
    expect(values.get(LEGACY_KEY)).toBe(value)
  })

  it('grava os dois estados no formato versionado', () => {
    const { values } = useStorage()

    savePerformanceMode(true)
    expect(values.get(PERFORMANCE_MODE_STORAGE_KEY)).toBe('on')
    savePerformanceMode(false)
    expect(values.get(PERFORMANCE_MODE_STORAGE_KEY)).toBe('off')
  })

  it('continua usando o padrão Normal se o armazenamento não estiver disponível', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => { throw new Error('indisponível') },
        setItem: () => { throw new Error('indisponível') },
      },
    })

    expect(loadPerformanceMode()).toBe(false)
    expect(() => savePerformanceMode(true)).not.toThrow()
  })
})
