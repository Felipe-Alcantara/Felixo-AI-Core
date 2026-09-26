import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { NoticeToast } from '../hardware/HardwareNotices'
import {
  describeLowCpuSuggestion,
  loadSuggestionAnswered,
  saveSuggestionAnswered,
  shouldSuggestPerformanceMode,
  type HardwareProfile,
} from './performance-suggestion'

const LOW_CPU: HardwareProfile = { logicalCpuCount: 4, lowCpu: true, lowCpuThreshold: 4, suggestPerformanceMode: true }

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
  }
}

describe('sugestão do Modo Performance em máquina com poucas CPUs', () => {
  it('sugere só com poucas CPUs, modo desligado e sem resposta anterior', () => {
    expect(shouldSuggestPerformanceMode({ profile: LOW_CPU, performanceMode: false, answered: false })).toBe(true)
    expect(shouldSuggestPerformanceMode({ profile: LOW_CPU, performanceMode: true, answered: false })).toBe(false)
    expect(shouldSuggestPerformanceMode({ profile: LOW_CPU, performanceMode: false, answered: true })).toBe(false)
    expect(
      shouldSuggestPerformanceMode({
        profile: { ...LOW_CPU, logicalCpuCount: 8, lowCpu: false, suggestPerformanceMode: false },
        performanceMode: false,
        answered: false,
      }),
    ).toBe(false)
    expect(shouldSuggestPerformanceMode({ profile: null, performanceMode: false, answered: false })).toBe(false)
  })

  it('na automação não sugere, mesmo com poucas CPUs', () => {
    expect(
      shouldSuggestPerformanceMode({
        profile: { ...LOW_CPU, suggestPerformanceMode: false },
        performanceMode: false,
        answered: false,
      }),
    ).toBe(false)
  })

  it('lembra a resposta, e sem armazenamento não quebra', () => {
    const storage = memoryStorage()
    expect(loadSuggestionAnswered(storage)).toBe(false)
    saveSuggestionAnswered(storage)
    expect(loadSuggestionAnswered(storage)).toBe(true)
    expect(loadSuggestionAnswered(null)).toBe(false)
    const broken = {
      getItem: () => {
        throw new Error('bloqueado')
      },
      setItem: () => {
        throw new Error('bloqueado')
      },
    }
    expect(loadSuggestionAnswered(broken)).toBe(false)
    expect(() => saveSuggestionAnswered(broken)).not.toThrow()
  })

  it('o texto traz o número desta máquina e o ganho medido', () => {
    expect(describeLowCpuSuggestion(LOW_CPU)).toMatch(/4 processadores lógicos.*16% a 23%/)
    expect(describeLowCpuSuggestion({ ...LOW_CPU, logicalCpuCount: 1 })).toContain('1 processador lógico')
  })

  it('o aviso tem papel de status, as duas respostas e o fechar com rótulo', () => {
    const html = renderToStaticMarkup(
      createElement(NoticeToast, {
        icon: null,
        title: 'Ligar o Modo Performance?',
        description: describeLowCpuSuggestion(LOW_CPU),
        primaryLabel: 'Ligar Modo Performance',
        onPrimary: () => {},
        secondaryLabel: 'Agora não',
        onSecondary: () => {},
        dismissLabel: 'Dispensar sugestão do Modo Performance',
      }),
    )
    expect(html).toContain('role="status"')
    expect(html).toContain('aria-live="polite"')
    expect(html).toContain('Ligar Modo Performance')
    expect(html).toContain('Agora não')
    expect(html).toContain('aria-label="Dispensar sugestão do Modo Performance"')
  })
})
