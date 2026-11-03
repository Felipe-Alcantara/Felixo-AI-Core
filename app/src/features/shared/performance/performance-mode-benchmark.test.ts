import { describe, expect, it } from 'vitest'
import {
  PERFORMANCE_MODE_BENCHMARK_MODES,
  performanceModeAttributeValue,
} from './performance-mode-benchmark'

describe('eixo de modo dos harnesses de Performance', () => {
  it('mantém Normal e Performance separados dos modos de algoritmo', () => {
    expect(PERFORMANCE_MODE_BENCHMARK_MODES).toEqual(['normal', 'performance'])
    expect(performanceModeAttributeValue('normal')).toBe('off')
    expect(performanceModeAttributeValue('performance')).toBe('on')
  })
})
