// Benchmark manual da derivação de conexões. Execute com:
// `npx vitest run src/features/canvas/services/canvas-connection-index-benchmark.ts`.
//
// Ele mede o hot path que existia dentro de `renderedNodes`, não o commit do
// React. A medição do commit visual deve continuar sendo feita com React
// Profiler no app, mas este fixture deixa a comparação baseline/indexada
// reproduzível em qualquer runner.
import { expect, it } from 'vitest'
import type { Edge, Node } from '@xyflow/react'
import { createCanvasConnectionIndex } from './canvas-connection-index'

type Fixture = {
  nodes: Node[]
  edges: Edge[]
}

type Scenario = {
  nome: string
  fixture: Fixture
}

type Timing = {
  p50: number
  p95: number
}

const fixtureSizes = [100, 500, 1_000] as const

function makeFixture(nodeCount: number): Fixture {
  const terminalCount = Math.max(5, Math.floor(nodeCount / 10))
  const fileCount = Math.max(10, Math.floor(nodeCount / 5))
  const groupCount = Math.max(5, Math.floor(nodeCount / 10))
  const nodes: Node[] = []

  for (let index = 0; index < nodeCount; index += 1) {
    const type =
      index < terminalCount
        ? 'terminal'
        : index < terminalCount + fileCount
          ? 'file'
          : index < terminalCount + fileCount + groupCount
            ? 'group'
            : 'note'
    const data =
      type === 'file'
        ? {
            fileName:
              index % 7 === 0 ? 'notas/compartilhada.md' : `notas/arquivo-${index}.md`,
          }
        : type === 'terminal'
          ? { label: `Agente ${index}` }
          : {}

    nodes.push({
      id: `${type}-${index}`,
      type,
      position: { x: index % 40, y: Math.floor(index / 40) },
      data,
    })
  }

  const terminals = nodes.filter((node) => node.type === 'terminal')
  const files = nodes.filter((node) => node.type === 'file')
  const edgeCount = Math.min(2_500, Math.max(40, Math.floor(nodeCount * 2.5)))
  const edges: Edge[] = Array.from({ length: edgeCount }, (_, index) => {
    const terminal = terminals[index % terminals.length]
    const file = files[(index * 17) % files.length]
    const source = index % 2 === 0 ? file.id : terminal.id
    const target = index % 2 === 0 ? terminal.id : file.id
    return { id: `edge-${index}`, source, target }
  })

  // Arestas inválidas existem no mundo real durante hidratação/remoção e não
  // devem alterar a resolução nem obrigar o benchmark a tocar o disco.
  edges.push(
    { id: 'edge-missing-source', source: 'deleted-node', target: files[0].id },
    { id: 'edge-missing-target', source: files[0].id, target: 'deleted-node' },
  )

  return { nodes, edges }
}

function linkedIdsBaseline(fileNodeId: string, edges: Edge[]): Set<string> {
  const ids = new Set<string>()
  for (const edge of edges) {
    if (edge.source === fileNodeId) ids.add(edge.target)
    else if (edge.target === fileNodeId) ids.add(edge.source)
  }
  return ids
}

function fileNamesBaseline(terminalId: string, nodes: Node[], edges: Edge[]): string[] {
  const names = edges.flatMap((edge) => {
    if (edge.source !== terminalId && edge.target !== terminalId) return []
    const otherId = edge.source === terminalId ? edge.target : edge.source
    const other = nodes.find((node) => node.id === otherId)
    if (other?.type !== 'file') return []
    const fileName = (other.data as { fileName?: unknown } | undefined)?.fileName
    return typeof fileName === 'string' && fileName ? [fileName] : []
  })
  return [...new Set(names)]
}

function resolveBaseline({ nodes, edges }: Fixture): string[] {
  const terminals = nodes.filter((node) => node.type === 'terminal')
  const result: string[] = []

  for (const node of nodes) {
    if (node.type === 'file') {
      const linkedIds = linkedIdsBaseline(node.id, edges)
      const connected = terminals
        .filter((terminal) => linkedIds.has(terminal.id))
        .map((terminal) => terminal.id)
      const available = terminals
        .filter((terminal) => !linkedIds.has(terminal.id))
        .map((terminal) => terminal.id)
      result.push(`file:${node.id}:connected=${connected.join(',')}:available=${available.join(',')}`)
    }

    if (node.type === 'terminal') {
      result.push(`terminal:${node.id}:files=${fileNamesBaseline(node.id, nodes, edges).join(',')}`)
    }
  }

  return result
}

function resolveIndexed({ nodes, edges }: Fixture): string[] {
  const index = createCanvasConnectionIndex(nodes, edges)
  const result: string[] = []

  for (const node of nodes) {
    if (node.type === 'file') {
      const linkedIds = index.getLinkedAgentIds(node.id)
      const connected = index.terminalNodes
        .filter((terminal) => linkedIds.has(terminal.id))
        .map((terminal) => terminal.id)
      const available = index.terminalNodes
        .filter((terminal) => !linkedIds.has(terminal.id))
        .map((terminal) => terminal.id)
      result.push(`file:${node.id}:connected=${connected.join(',')}:available=${available.join(',')}`)
    }

    if (node.type === 'terminal') {
      result.push(
        `terminal:${node.id}:files=${index.getConnectedCanvasFileNames(node.id).join(',')}`,
      )
    }
  }

  return result
}

function withScenarioChanges(fixture: Fixture): Scenario[] {
  const firstTerminal = fixture.nodes.find((node) => node.type === 'terminal')
  const firstFile = fixture.nodes.find((node) => node.type === 'file')

  if (!firstTerminal || !firstFile) {
    throw new Error('fixture precisa de terminal e arquivo')
  }

  return [
    { nome: 'render-inicial', fixture },
    {
      nome: 'drag',
      fixture: {
        nodes: fixture.nodes.map((node) => ({
          ...node,
          position: { x: node.position.x + 12, y: node.position.y + 8 },
        })),
        edges: fixture.edges,
      },
    },
    {
      nome: 'resize',
      fixture: {
        nodes: fixture.nodes.map((node) => ({
          ...node,
          width: 520,
          height: 360,
        })),
        edges: fixture.edges,
      },
    },
    {
      nome: 'criacao-remocao-aresta',
      fixture: {
        nodes: fixture.nodes,
        edges: [
          ...fixture.edges.slice(1),
          { id: 'edge-new', source: firstTerminal.id, target: firstFile.id },
        ],
      },
    },
    {
      nome: 'mudanca-de-dados',
      fixture: {
        nodes: fixture.nodes.map((node, index) =>
          node.type === 'file' && index % 11 === 0
            ? { ...node, data: { ...node.data, fileName: 'notas/renomeada.md' } }
            : node,
        ),
        edges: fixture.edges,
      },
    },
  ]
}

function measure(callback: () => unknown, iterations: number): Timing {
  for (let index = 0; index < 2; index += 1) callback()

  const samples = Array.from({ length: iterations }, () => {
    const startedAt = performance.now()
    callback()
    return performance.now() - startedAt
  }).sort((left, right) => left - right)

  return {
    p50: samples[Math.floor((samples.length - 1) * 0.5)],
    p95: samples[Math.floor((samples.length - 1) * 0.95)],
  }
}

function countNamedConnections({ nodes, edges }: Fixture): number {
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const pairs = new Set<string>()
  for (const edge of edges) {
    const source = nodeById.get(edge.source)
    const target = nodeById.get(edge.target)
    if (!source || !target) continue
    const fileNode = source.type === 'file' ? source : target.type === 'file' ? target : null
    const terminalNode =
      source.type === 'terminal' ? source : target.type === 'terminal' ? target : null
    const fileName = (fileNode?.data as { fileName?: unknown } | undefined)?.fileName
    if (fileNode && terminalNode && typeof fileName === 'string' && fileName) {
      pairs.add(`${fileNode.id}:${terminalNode.id}:${fileName}`)
    }
  }
  return pairs.size
}

const benchmarkTest =
  process.env.FELIXO_CONNECTION_BENCHMARK === '1' ? it : it.skip

benchmarkTest('mede baseline e índice por tamanho e cenário', () => {
  const report: Array<Record<string, string | number>> = []

  for (const nodeCount of fixtureSizes) {
    const base = makeFixture(nodeCount)
    for (const scenario of withScenarioChanges(base)) {
      const baselineResult = resolveBaseline(scenario.fixture)
      expect(resolveIndexed(scenario.fixture)).toEqual(baselineResult)

      const iterations = nodeCount === 1_000 ? 3 : 7
      const baseline = measure(() => resolveBaseline(scenario.fixture), iterations)
      const indexed = measure(() => resolveIndexed(scenario.fixture), iterations)
      report.push({
        nós: nodeCount,
        cenário: scenario.nome,
        arestas: scenario.fixture.edges.length,
        'conexões nomeadas': countNamedConnections(scenario.fixture),
        'baseline p50 ms': Number(baseline.p50.toFixed(2)),
        'baseline p95 ms': Number(baseline.p95.toFixed(2)),
        'índice p50 ms': Number(indexed.p50.toFixed(2)),
        'índice p95 ms': Number(indexed.p95.toFixed(2)),
      })
    }
  }

  console.info('[canvas-connection-index benchmark]', JSON.stringify(report, null, 2))
})
