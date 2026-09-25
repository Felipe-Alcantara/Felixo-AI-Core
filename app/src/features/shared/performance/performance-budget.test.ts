import { describe, expect, it } from 'vitest'

import {
  PERFORMANCE_BUDGET_MS,
  PERFORMANCE_SCENARIO_THRESHOLDS,
  classifyPerformanceScenario,
} from './performance-budget'

describe('orçamento de performance do canvas', () => {
  it('classifica como leve abaixo dos dois limiares', () => {
    expect(classifyPerformanceScenario(0, 0)).toBe('leve')
    expect(
      classifyPerformanceScenario(
        PERFORMANCE_SCENARIO_THRESHOLDS.terminalCountForCarregado - 1,
        PERFORMANCE_SCENARIO_THRESHOLDS.nodeCountForCarregado - 1,
      ),
    ).toBe('leve')
  })

  it('classifica como carregado ao cruzar o limiar de terminais, mesmo com poucos nós', () => {
    expect(
      classifyPerformanceScenario(PERFORMANCE_SCENARIO_THRESHOLDS.terminalCountForCarregado, 0),
    ).toBe('carregado')
  })

  it('classifica como carregado ao cruzar o limiar de nós, mesmo com poucos terminais', () => {
    expect(
      classifyPerformanceScenario(0, PERFORMANCE_SCENARIO_THRESHOLDS.nodeCountForCarregado),
    ).toBe('carregado')
  })

  it('meta de carregado nunca é mais rígida que a de leve — carga maior tolera mais tempo, não menos', () => {
    expect(PERFORMANCE_BUDGET_MS.carregado.frameP95).toBeGreaterThanOrEqual(
      PERFORMANCE_BUDGET_MS.leve.frameP95,
    )
    expect(PERFORMANCE_BUDGET_MS.carregado.longTaskP95).toBeGreaterThanOrEqual(
      PERFORMANCE_BUDGET_MS.leve.longTaskP95,
    )
    expect(PERFORMANCE_BUDGET_MS.carregado.resumeSeconds).toBeGreaterThanOrEqual(
      PERFORMANCE_BUDGET_MS.leve.resumeSeconds,
    )
  })
})
