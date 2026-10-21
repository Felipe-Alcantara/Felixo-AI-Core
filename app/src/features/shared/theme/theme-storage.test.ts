import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { THEME_OPTIONS } from './theme-options'
import { THEME_STORAGE_KEY, isAppTheme, loadTheme, saveTheme } from './theme-storage'

function installLocalStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  })
  return values
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('tema salvo', () => {
  it('guarda o claro e devolve o claro na próxima abertura', () => {
    const values = installLocalStorage()

    saveTheme('light')

    expect(values.get(THEME_STORAGE_KEY)).toBe('light')
    expect(loadTheme()).toBe('light')
  })

  it('mantém os temas que já existiam', () => {
    installLocalStorage({ [THEME_STORAGE_KEY]: 'high_contrast' })
    expect(loadTheme()).toBe('high_contrast')
  })

  it('cai no escuro quando não há escolha ou o valor salvo é desconhecido', () => {
    installLocalStorage()
    expect(loadTheme()).toBe('dark')

    installLocalStorage({ [THEME_STORAGE_KEY]: 'sepia' })
    expect(loadTheme()).toBe('dark')
  })

  it('cai no escuro quando o localStorage não está disponível', () => {
    vi.stubGlobal('window', {
      get localStorage(): Storage {
        throw new Error('bloqueado')
      },
    })
    expect(loadTheme()).toBe('dark')
    expect(() => saveTheme('light')).not.toThrow()
  })

  it('reconhece só os três temas', () => {
    expect(['dark', 'light', 'high_contrast'].every(isAppTheme)).toBe(true)
    expect(isAppTheme('Light')).toBe(false)
    expect(isAppTheme(undefined)).toBe(false)
  })
})

describe('opções do seletor', () => {
  it('oferece Escuro, Claro e Alto contraste, nessa ordem, todas válidas', () => {
    expect(THEME_OPTIONS.map((option) => [option.value, option.label])).toEqual([
      ['dark', 'Escuro'],
      ['light', 'Claro'],
      ['high_contrast', 'Alto contraste'],
    ])
    expect(THEME_OPTIONS.every((option) => isAppTheme(option.value))).toBe(true)
  })
})

describe('tema antes do React', () => {
  it('o script do index.html lê a mesma chave e aplica só temas conhecidos', () => {
    const html = readFileSync(new URL('../../../../index.html', import.meta.url), 'utf8')
    const head = html.slice(0, html.indexOf('</head>'))

    expect(head).toContain(`localStorage.getItem('${THEME_STORAGE_KEY}')`)
    expect(head).toContain("temaSalvo === 'light' || temaSalvo === 'high_contrast'")
  })
})
