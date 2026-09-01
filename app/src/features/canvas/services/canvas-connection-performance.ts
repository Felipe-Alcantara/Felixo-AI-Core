// Fixture e projeções compartilhados pela bancada do canvas e pelo benchmark
// sintético. Manter a carga em um único lugar evita comparar cenários que não
// são realmente equivalentes.
import type { Edge, Node } from '@xyflow/react'
import {
  createCanvasConnectionIndex,
  type CanvasConnectionIndex,
} from './canvas-connection-index'

export const CANVAS_CONNECTION_PERFORMANCE_SIZES = [100, 500, 1_000] as const

export const CANVAS_CONNECTION_PERFORMANCE_SCENARIOS = [
  'render-inicial',
  'drag',
  'resize',
  'criacao-remocao-aresta',
  'mudanca-de-dados',
] as const

export const CANVAS_CONNECTION_PERFORMANCE_MODES = ['baseline', 'indexado'] as const

export type CanvasConnectionPerformanceScenario =
  (typeof CANVAS_CONNECTION_PERFORMANCE_SCENARIOS)[number]

export type CanvasConnectionPerformanceMode =
  (typeof CANVAS_CONNECTION_PERFORMANCE_MODES)[number]

export type CanvasConnectionPerformanceFixture = {
  nodes: Node[]
  edges: Edge[]
}

export type CanvasConnectionPerformanceData = Record<string, unknown> & {
  performanceKind: string
  connectedAgentIds: string[]
  availableAgentIds: string[]
  connectedFileNames: string[]
}

function dataOf(node: Node): Record<string, unknown> {
  return node.data && typeof node.data === 'object'
    ? (node.data as Record<string, unknown>)
    : {}
}

function cloneFixture(fixture: CanvasConnectionPerformanceFixture): CanvasConnectionPerformanceFixture {
  return {
    nodes: fixture.nodes.map((node) => ({
      ...node,
      position: { ...node.position },
      data: { ...dataOf(node) },
    })),
    edges: fixture.edges.map((edge) => ({ ...edge })),
  }
}

/**
 * Cria a carga que representa o canvas real sem consultar persistência, disco
 * ou processo de terminal. Os cinco tipos de bloco aparecem na matriz e as
 * conexões arquivo↔terminal alternam as duas direções.
 */
export function createCanvasConnectionPerformanceFixture(
  nodeCount: number,
): CanvasConnectionPerformanceFixture {
  if (!Number.isInteger(nodeCount) || nodeCount <= 0) {
    throw new Error('o fixture precisa de uma quantidade positiva de nós')
  }

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

    const data: Record<string, unknown> =
      type === 'terminal'
        ? { label: `Agente ${index}` }
        : type === 'file'
          ? {
              fileName:
                index % 7 === 0
                  ? 'notas/compartilhada.md'
                  : `notas/arquivo-${index}.md`,
              label: `Arquivo ${index}`,
            }
          : type === 'group'
            ? { label: `Grupo ${index}` }
            : { label: `Nota ${index}`, text: `Conteúdo da nota ${index}` }

    nodes.push({
      id: `${type}-${index}`,
      type,
      position: {
        x: (index % 20) * 260,
        y: Math.floor(index / 20) * 190,
      },
      width: type === 'group' ? 520 : 240,
      height: type === 'group' ? 360 : 180,
      data,
    })
  }

  const terminals = nodes.filter((node) => node.type === 'terminal')
  const files = nodes.filter((node) => node.type === 'file')
  const notes = nodes.filter((node) => node.type === 'note')
  const edgeCount = Math.min(2_500, Math.max(40, Math.floor(nodeCount * 2.5)))
  const edges: Edge[] = Array.from({ length: edgeCount }, (_, index) => {
    const terminal = terminals[index % terminals.length]
    const file = files[(index * 17) % files.length]
    const source = index % 2 === 0 ? file.id : terminal.id
    const target = index % 2 === 0 ? terminal.id : file.id
    return { id: `edge-${index}`, source, target }
  })

  // O canvas pode hidratar uma aresta depois que uma ponta já foi removida.
  // Também há links de outros tipos de bloco; ambos precisam ser neutros para
  // o índice e para o baseline.
  edges.push(
    { id: 'edge-missing-source', source: 'deleted-node', target: files[0].id },
    { id: 'edge-missing-target', source: files[0].id, target: 'deleted-node' },
  )
  if (notes.length > 0) {
    edges.push({ id: 'edge-file-note', source: files[0].id, target: notes[0].id })
  }

  return { nodes, edges }
}

/** Cria a mesma carga-base em cada cenário, sem compartilhar referências mutáveis. */
export function createCanvasConnectionPerformanceScenarios(
  fixture: CanvasConnectionPerformanceFixture,
): Array<{ nome: CanvasConnectionPerformanceScenario; fixture: CanvasConnectionPerformanceFixture }> {
  const firstTerminal = fixture.nodes.find((node) => node.type === 'terminal')
  const firstFile = fixture.nodes.find((node) => node.type === 'file')

  if (!firstTerminal || !firstFile) {
    throw new Error('o fixture precisa de terminal e arquivo')
  }

  return [
    { nome: 'render-inicial', fixture: cloneFixture(fixture) },
    {
      nome: 'drag',
      fixture: {
        nodes: fixture.nodes.map((node) => ({
          ...node,
          position: { x: node.position.x + 12, y: node.position.y + 8 },
          data: { ...dataOf(node) },
        })),
        edges: fixture.edges.map((edge) => ({ ...edge })),
      },
    },
    {
      nome: 'resize',
      fixture: {
        nodes: fixture.nodes.map((node) => ({
          ...node,
          width: 520,
          height: 360,
          position: { ...node.position },
          data: { ...dataOf(node) },
        })),
        edges: fixture.edges.map((edge) => ({ ...edge })),
      },
    },
    {
      nome: 'criacao-remocao-aresta',
      fixture: {
        nodes: fixture.nodes.map((node) => ({
          ...node,
          position: { ...node.position },
          data: { ...dataOf(node) },
        })),
        edges: [
          ...fixture.edges.slice(1).map((edge) => ({ ...edge })),
          { id: 'edge-new', source: firstTerminal.id, target: firstFile.id },
        ],
      },
    },
    {
      nome: 'mudanca-de-dados',
      fixture: {
        nodes: fixture.nodes.map((node, index) =>
          node.type === 'file' && index % 11 === 0
            ? {
                ...node,
                position: { ...node.position },
                data: { ...dataOf(node), fileName: 'notas/renomeada.md' },
              }
            : {
                ...node,
                position: { ...node.position },
                data: { ...dataOf(node) },
              },
        ),
        edges: fixture.edges.map((edge) => ({ ...edge })),
      },
    },
  ]
}

function linkedAgentIdsBaseline(fileNodeId: string, edges: readonly Edge[]): Set<string> {
  const ids = new Set<string>()
  for (const edge of edges) {
    if (edge.source === fileNodeId) ids.add(edge.target)
    else if (edge.target === fileNodeId) ids.add(edge.source)
  }
  return ids
}

function connectedFileNamesBaseline(
  terminalId: string,
  nodes: readonly Node[],
  edges: readonly Edge[],
): string[] {
  const names = edges.flatMap((edge) => {
    if (edge.source !== terminalId && edge.target !== terminalId) return []
    const otherId = edge.source === terminalId ? edge.target : edge.source
    const other = nodes.find((node) => node.id === otherId)
    if (other?.type !== 'file') return []
    const fileName = dataOf(other).fileName
    return typeof fileName === 'string' && fileName ? [fileName] : []
  })
  return [...new Set(names)]
}

function linkedAgentIds(
  node: Node,
  edges: readonly Edge[],
  mode: CanvasConnectionPerformanceMode,
  index: CanvasConnectionIndex | undefined,
): ReadonlySet<string> {
  if (mode === 'indexado') {
    return index?.getLinkedAgentIds(node.id) ?? new Set<string>()
  }
  return linkedAgentIdsBaseline(node.id, edges)
}

function connectedFileNames(
  node: Node,
  nodes: readonly Node[],
  edges: readonly Edge[],
  mode: CanvasConnectionPerformanceMode,
  index: CanvasConnectionIndex | undefined,
): readonly string[] {
  if (mode === 'indexado') {
    return index?.getConnectedCanvasFileNames(node.id) ?? []
  }
  return connectedFileNamesBaseline(node.id, nodes, edges)
}

/**
 * Reproduz a projeção que alimenta os nós do Canvas. O modo baseline mantém as
 * buscas completas; o modo indexado recebe a mesma instância derivada de
 * `nodes`/`edges` que o CanvasView reutiliza.
 */
export function deriveCanvasConnectionPerformanceNodes(
  fixture: CanvasConnectionPerformanceFixture,
  mode: CanvasConnectionPerformanceMode,
  index?: CanvasConnectionIndex,
): Node[] {
  const terminals = fixture.nodes.filter((node) => node.type === 'terminal')
  const resolvedIndex =
    mode === 'indexado'
      ? index ?? createCanvasConnectionIndex(fixture.nodes, fixture.edges)
      : undefined

  return fixture.nodes.map((node) => {
    const baseData = dataOf(node)
    if (node.type === 'file') {
      const linkedIds = linkedAgentIds(
        node,
        fixture.edges,
        mode,
        resolvedIndex,
      )
      const connectedAgents = terminals
        .filter((terminal) => linkedIds.has(terminal.id))
        .map((terminal) => terminal.id)
      const availableAgents = terminals
        .filter((terminal) => !linkedIds.has(terminal.id))
        .map((terminal) => terminal.id)

      return {
        ...node,
        data: {
          ...baseData,
          performanceKind: 'file',
          connectedAgentIds: connectedAgents,
          availableAgentIds: availableAgents,
          connectedFileNames: [],
        } satisfies CanvasConnectionPerformanceData,
      }
    }

    if (node.type === 'terminal') {
      return {
        ...node,
        data: {
          ...baseData,
          performanceKind: 'terminal',
          connectedAgentIds: [],
          availableAgentIds: [],
          connectedFileNames: [
            ...connectedFileNames(
              node,
              fixture.nodes,
              fixture.edges,
              mode,
              resolvedIndex,
            ),
          ],
        } satisfies CanvasConnectionPerformanceData,
      }
    }

    return {
      ...node,
      data: {
        ...baseData,
        performanceKind: node.type ?? 'node',
        connectedAgentIds: [],
        availableAgentIds: [],
        connectedFileNames: [],
      } satisfies CanvasConnectionPerformanceData,
    }
  })
}

/** Assinatura observável para provar que baseline e índice produzem o mesmo resultado. */
export function connectionPerformanceProjection(nodes: readonly Node[]): string[] {
  return nodes.map((node) => {
    const data = dataOf(node) as Partial<CanvasConnectionPerformanceData>
    return [
      node.id,
      data.performanceKind ?? '',
      ...(data.connectedAgentIds ?? []),
      '|',
      ...(data.availableAgentIds ?? []),
      '|',
      ...(data.connectedFileNames ?? []),
    ].join(':')
  })
}

export function countNamedCanvasConnections(
  fixture: CanvasConnectionPerformanceFixture,
): number {
  const nodeById = new Map(fixture.nodes.map((node) => [node.id, node]))
  const pairs = new Set<string>()

  for (const edge of fixture.edges) {
    const source = nodeById.get(edge.source)
    const target = nodeById.get(edge.target)
    if (!source || !target) continue

    const fileNode = source.type === 'file' ? source : target.type === 'file' ? target : null
    const terminalNode =
      source.type === 'terminal' ? source : target.type === 'terminal' ? target : null
    const fileName = fileNode ? dataOf(fileNode).fileName : undefined
    if (fileNode && terminalNode && typeof fileName === 'string' && fileName) {
      pairs.add(`${fileNode.id}:${terminalNode.id}:${fileName}`)
    }
  }

  return pairs.size
}
