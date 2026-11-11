// Bancada manual do quadro de arrasto do canvas. Execute com:
// `$env:FELIXO_CANVAS_DRAG_BENCHMARK='1'; npx vitest run src/features/canvas/services/canvas-drag-frame-benchmark.test.ts`.
//
// Reproduz o que o CanvasView faz a cada quadro de arrasto, antes e depois de
// 11/11/2026, sobre os mesmos fixtures de 300 e 1.000 blocos:
//
// - `anterior`: `{ ...node }` novo para todo bloco, índice de conexões e
//   assinatura de agentes (O(arquivos × terminais)) recalculados por quadro,
//   `nodes.find` por bloco no minimapa e objeto novo por aresta;
// - `atual`: lista estrutural estável (`stableNodeStructure`), derivados
//   estruturais só quando ela muda, reuso dos objetos de nó e de aresta
//   (`createReusePass`) e rótulo do minimapa por `Map`.
//
// Além do tempo, conta quantos objetos de nó mudam de identidade por quadro:
// o React Flow 12 re-renderiza o NodeWrapper de todo bloco cujo objeto mudou
// (`userNode === internalNode.internals.userNode`), então esse número é o de
// blocos re-renderizados. Não mede o commit do React: para isso, o app com
// `?canvas-profiler=1`.
import { expect, it } from 'vitest'
import type { Edge, Node } from '@xyflow/react'
import { createCanvasConnectionIndex } from './canvas-connection-index'
import {
  createNodeDataReuse,
  createReusePass,
  createNodeStructureTracker,
  type NodeDataCacheEntry,
  type ReuseCacheEntry,
} from './node-data-cache'

const SIZES = [300, 1_000] as const
const FRAMES = 60

type Fixture = { nodes: Node[]; edges: Edge[] }

function makeFixture(nodeCount: number): Fixture {
  const terminalCount = Math.floor(nodeCount / 3)
  const fileCount = Math.floor(nodeCount / 3)
  const nodes: Node[] = Array.from({ length: nodeCount }, (_, index) => {
    const type = index < terminalCount ? 'terminal' : index < terminalCount + fileCount ? 'file' : 'note'
    return {
      id: `${type}-${index}`,
      type,
      position: { x: (index % 40) * 320, y: Math.floor(index / 40) * 240 },
      data: type === 'terminal' ? { label: `Agente ${index}` } : type === 'file' ? { fileName: `notas/${index}.md` } : {},
    }
  })
  const terminals = nodes.filter((node) => node.type === 'terminal')
  const files = nodes.filter((node) => node.type === 'file')
  const edges: Edge[] = Array.from({ length: Math.min(files.length, terminals.length) }, (_, index) => ({
    id: `edge-${index}`,
    source: files[index].id,
    target: terminals[(index * 7) % terminals.length].id,
  }))
  return { nodes, edges }
}

/** O quadro de um arrasto: só o bloco arrastado vira objeto novo (applyNodeChanges). */
function dragFrame(nodes: Node[], draggedIndex: number, frame: number): Node[] {
  const next = nodes.slice()
  const dragged = nodes[draggedIndex]
  next[draggedIndex] = { ...dragged, position: { x: dragged.position.x + frame, y: dragged.position.y } }
  return next
}

const labelOf = (node: Node) => String((node.data as { label?: unknown }).label ?? 'Agente')
const handlesOf = (source: Node, target: Node) => ({
  sourceHandle: source.position.x < target.position.x ? 's-right' : 's-left',
  targetHandle: source.position.x < target.position.x ? 't-left' : 't-right',
})

function createAnterior() {
  const dataCache = new Map<string, NodeDataCacheEntry>()
  return ({ nodes, edges }: Fixture) => {
    const index = createCanvasConnectionIndex(nodes, edges)
    const terminals = index.terminalNodes
    const { reuseData, commit } = createNodeDataReuse(dataCache)
    const rendered = nodes.map((node) => {
      const withHandle = { ...node, dragHandle: '.felixo-node-drag-handle' }
      if (node.type !== 'file') return withHandle
      const linked = index.getLinkedAgentIds(node.id)
      const signature = terminals
        .map((terminal) => `${linked.has(terminal.id) ? '+' : '-'}${terminal.id}:${labelOf(terminal)}`)
        .join('|')
      return {
        ...withHandle,
        data: reuseData(node.id, [node.data, signature], () => ({
          ...node.data,
          connectedAgents: terminals.filter((terminal) => linked.has(terminal.id)).map((terminal) => terminal.id),
        })),
      }
    })
    commit()
    const minimapLabels = nodes.map((item) => {
      const node = nodes.find((candidate) => candidate.id === item.id)
      return node?.type === 'terminal' ? labelOf(node) : ''
    })
    const byId = new Map(nodes.map((node) => [node.id, node]))
    const routed = edges.map((edge) => ({ ...edge, ...handlesOf(byId.get(edge.source)!, byId.get(edge.target)!) }))
    return { rendered, routed, minimapLabels }
  }
}

function createAtual() {
  const dataCache = new Map<string, NodeDataCacheEntry>()
  const nodeCache = new Map<string, ReuseCacheEntry<Node>>()
  const edgeCache = new Map<string, ReuseCacheEntry<Edge>>()
  const trackStructure = createNodeStructureTracker<Node>()
  let structure: readonly Node[] | null = null
  let dataById = new Map<string, Node['data']>()
  let minimap = new Map<string, string>()

  return ({ nodes, edges }: Fixture) => {
    const structural = trackStructure(nodes)
    if (structural !== structure) {
      structure = structural
      const index = createCanvasConnectionIndex(structural, edges)
      const terminals = index.terminalNodes
      const terminalsSignature = terminals.map((terminal) => `${terminal.id}:${labelOf(terminal)}`).join('|')
      const { reuseData, commit } = createNodeDataReuse(dataCache)
      dataById = new Map()
      for (const node of structural) {
        if (node.type !== 'file') continue
        const linked = index.getLinkedAgentIds(node.id)
        dataById.set(
          node.id,
          reuseData(node.id, [node.data, terminalsSignature, [...linked].join('|')], () => ({
            ...node.data,
            connectedAgents: terminals.filter((terminal) => linked.has(terminal.id)).map((terminal) => terminal.id),
          })),
        )
      }
      commit()
      minimap = new Map(structural.filter((node) => node.type === 'terminal').map((node) => [node.id, labelOf(node)]))
    }

    const nodePass = createReusePass(nodeCache)
    const rendered = nodes.map((node) => {
      const data = dataById.get(node.id) ?? node.data
      return nodePass.reuse(node.id, [node, data], () => ({ ...node, dragHandle: '.felixo-node-drag-handle', data }))
    })
    nodePass.commit()
    const minimapLabels = nodes.map((node) => minimap.get(node.id) ?? '')
    const byId = new Map(nodes.map((node) => [node.id, node]))
    const edgePass = createReusePass(edgeCache)
    const routed = edges.map((edge) => {
      const { sourceHandle, targetHandle } = handlesOf(byId.get(edge.source)!, byId.get(edge.target)!)
      return edgePass.reuse(edge.id, [edge, sourceHandle, targetHandle], () => ({ ...edge, sourceHandle, targetHandle }))
    })
    edgePass.commit()
    return { rendered, routed, minimapLabels }
  }
}

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b)
  return Number(sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))].toFixed(4))
}

function runDrag(size: number, create: () => (fixture: Fixture) => ReturnType<ReturnType<typeof createAtual>>) {
  const fixture = makeFixture(size)
  const step = create()
  let previous = step(fixture)
  const times: number[] = []
  const changedNodes: number[] = []
  const changedEdges: number[] = []
  let nodes = fixture.nodes
  // Arrasta um arquivo ligado a um terminal: a aresta dele também muda de alça.
  const dragged = nodes.findIndex((node) => node.type === 'file')
  for (let frame = 1; frame <= FRAMES; frame += 1) {
    nodes = dragFrame(nodes, dragged, frame * 5)
    const startedAt = performance.now()
    const current = step({ nodes, edges: fixture.edges })
    times.push(performance.now() - startedAt)
    changedNodes.push(current.rendered.filter((node, index) => node !== previous.rendered[index]).length)
    changedEdges.push(current.routed.filter((edge, index) => edge !== previous.routed[index]).length)
    previous = current
  }
  return {
    msPerFrame: { p50: percentile(times, 0.5), p95: percentile(times, 0.95) },
    nodeObjectsChangedPerFrame: percentile(changedNodes, 0.5),
    edgeObjectsChangedPerFrame: percentile(changedEdges, 0.5),
  }
}

const runIt = process.env.FELIXO_CANVAS_DRAG_BENCHMARK === '1' ? it : it.skip

runIt('quadro de arrasto com 300 e 1.000 blocos: anterior × atual', () => {
  const report = SIZES.map((size) => ({
    blocos: size,
    anterior: runDrag(size, createAnterior),
    atual: runDrag(size, createAtual),
  }))
  for (const row of report) {
    // O que importa para o React Flow: só o bloco arrastado muda de identidade.
    expect(row.atual.nodeObjectsChangedPerFrame).toBe(1)
    expect(row.anterior.nodeObjectsChangedPerFrame).toBe(row.blocos)
  }
  console.info('[canvas-drag-frame benchmark]', JSON.stringify(report, null, 2))
})
