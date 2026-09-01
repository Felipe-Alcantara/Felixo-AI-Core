import { describe, expect, it } from 'vitest'
import {
  CANVAS_CONNECTION_PERFORMANCE_SCENARIOS,
  CANVAS_CONNECTION_PERFORMANCE_SIZES,
  connectionPerformanceProjection,
  countNamedCanvasConnections,
  createCanvasConnectionPerformanceFixture,
  createCanvasConnectionPerformanceScenarios,
  deriveCanvasConnectionPerformanceNodes,
} from './canvas-connection-performance'
import { createCanvasConnectionIndex } from './canvas-connection-index'

describe('fixture de performance do índice do canvas', () => {
  it('contém os tipos de bloco e arestas arquivo↔terminal nas duas direções', () => {
    for (const size of CANVAS_CONNECTION_PERFORMANCE_SIZES) {
      const fixture = createCanvasConnectionPerformanceFixture(size)
      const types = new Set(fixture.nodes.map((node) => node.type))
      const linkedEdges = fixture.edges.filter((edge) => {
        const source = fixture.nodes.find((node) => node.id === edge.source)
        const target = fixture.nodes.find((node) => node.id === edge.target)
        return (
          (source?.type === 'file' && target?.type === 'terminal') ||
          (source?.type === 'terminal' && target?.type === 'file')
        )
      })
      const fileToTerminal = linkedEdges.some((edge) => {
        const source = fixture.nodes.find((node) => node.id === edge.source)
        return source?.type === 'file'
      })
      const terminalToFile = linkedEdges.some((edge) => {
        const source = fixture.nodes.find((node) => node.id === edge.source)
        return source?.type === 'terminal'
      })

      expect(types).toEqual(new Set(['terminal', 'file', 'group', 'note']))
      expect(fileToTerminal).toBe(true)
      expect(terminalToFile).toBe(true)
      expect(fixture.edges.length).toBeGreaterThan(fixture.nodes.length)
      expect(countNamedCanvasConnections(fixture)).toBeGreaterThan(0)
    }
  })

  it('mantém a projeção equivalente entre baseline e índice em todos os cenários', () => {
    for (const size of CANVAS_CONNECTION_PERFORMANCE_SIZES) {
      const base = createCanvasConnectionPerformanceFixture(size)
      for (const scenario of createCanvasConnectionPerformanceScenarios(base)) {
        const baseline = deriveCanvasConnectionPerformanceNodes(scenario.fixture, 'baseline')
        const index = createCanvasConnectionIndex(scenario.fixture.nodes, scenario.fixture.edges)
        const indexed = deriveCanvasConnectionPerformanceNodes(
          scenario.fixture,
          'indexado',
          index,
        )

        expect(connectionPerformanceProjection(indexed)).toEqual(
          connectionPerformanceProjection(baseline),
        )
      }
    }
  })

  it('altera somente a carga declarada em cada cenário', () => {
    const base = createCanvasConnectionPerformanceFixture(100)
    const scenarios = createCanvasConnectionPerformanceScenarios(base)
    expect(scenarios.map((scenario) => scenario.nome)).toEqual([
      ...CANVAS_CONNECTION_PERFORMANCE_SCENARIOS,
    ])

    const drag = scenarios.find((scenario) => scenario.nome === 'drag')?.fixture
    const resize = scenarios.find((scenario) => scenario.nome === 'resize')?.fixture
    const edgeChange = scenarios.find(
      (scenario) => scenario.nome === 'criacao-remocao-aresta',
    )?.fixture
    const dataChange = scenarios.find((scenario) => scenario.nome === 'mudanca-de-dados')?.fixture

    expect(drag?.nodes[0].position).toEqual({ x: base.nodes[0].position.x + 12, y: base.nodes[0].position.y + 8 })
    expect(resize?.nodes.every((node) => node.width === 520 && node.height === 360)).toBe(true)
    expect(edgeChange?.edges.length).toBe(base.edges.length)
    expect(edgeChange?.edges.some((edge) => edge.id === 'edge-new')).toBe(true)
    expect(dataChange?.nodes.some((node, index) =>
      node.type === 'file' && index % 11 === 0 && node.data.fileName === 'notas/renomeada.md',
    )).toBe(true)
  })

  it('recusa tamanho inválido', () => {
    expect(() => createCanvasConnectionPerformanceFixture(0)).toThrow(/quantidade positiva/i)
    expect(() => createCanvasConnectionPerformanceFixture(1.5)).toThrow(/quantidade positiva/i)
  })
})
