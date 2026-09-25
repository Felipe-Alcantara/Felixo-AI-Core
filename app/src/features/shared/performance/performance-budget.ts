/**
 * Orçamento numérico do canvas — ver docs/projeto/POLITICA-PERFORMANCE.md
 * para o baseline medido e o raciocínio por trás de cada valor.
 *
 * Centralizado aqui (em vez de espalhado em comentário) para que qualquer
 * lugar do código que precise decidir "estamos dentro do orçamento?" — hoje
 * nenhum, é o gap de ativação automática por carga listado na política —
 * tenha uma única fonte de verdade a importar, e os testes possam travar
 * regressão nos números em vez de só no comentário.
 */

export type PerformanceScenario = 'leve' | 'carregado'

export const PERFORMANCE_SCENARIO_THRESHOLDS = {
  /** Nº de terminais abertos a partir do qual o cenário deixa de ser "leve". */
  terminalCountForCarregado: 10,
  /** Nº de nós no canvas a partir do qual o cenário deixa de ser "leve". */
  nodeCountForCarregado: 300,
} as const

export const PERFORMANCE_BUDGET_MS = {
  leve: {
    frameP95: 120,
    longTaskP95: 250,
    resumeSeconds: 5,
  },
  carregado: {
    frameP95: 160,
    longTaskP95: 420,
    resumeSeconds: 9,
  },
} as const satisfies Record<PerformanceScenario, Record<string, number>>

/**
 * Classifica a carga atual do canvas num dos dois cenários com meta definida.
 * Carga acima de `carregado` não tem meta no modo normal — a política
 * recomenda o Modo Performance nesse ponto em vez de prometer fluidez.
 */
export function classifyPerformanceScenario(
  terminalCount: number,
  nodeCount: number,
): PerformanceScenario {
  const isCarregado =
    terminalCount >= PERFORMANCE_SCENARIO_THRESHOLDS.terminalCountForCarregado ||
    nodeCount >= PERFORMANCE_SCENARIO_THRESHOLDS.nodeCountForCarregado

  return isCarregado ? 'carregado' : 'leve'
}
