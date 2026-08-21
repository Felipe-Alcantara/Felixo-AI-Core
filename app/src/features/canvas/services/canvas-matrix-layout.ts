// Reorganização explícita dos blocos do canvas ("Organizar").
//
// Este módulo apenas orquestra: decide o que é organizável, delega o
// agrupamento por ligações para node-connectivity.ts, o agrupamento por
// repositório para repository-grouping.ts e a geometria da grade para
// matrix-grid.ts, e devolve os blocos reposicionados.
//
// O layout é DETERMINÍSTICO em dois sentidos, e os dois custaram bug:
//
// 1. Não depende de pan, zoom nem tamanho da janela — a matriz é ancorada no
//    bloco que já está mais ao topo-esquerda.
// 2. Não depende de onde os blocos foram arrastados. A ordem das células é a
//    ordem do dock "Elementos" (o `#N` do cabeçalho), que é identidade e não
//    posição: o mesmo conjunto de blocos cai sempre nas mesmas células.
import type { Edge, Node } from '@xyflow/react'
import { connectedComponents } from './node-connectivity'
import { groupByRepository } from './repository-grouping'
import {
  assignSlots,
  cellSize,
  matrixAnchor,
  matrixBounds,
  matrixColumns,
  slotPosition,
  MATRIX_GAP,
  type MatrixBounds,
} from './matrix-grid'

export type { MatrixBounds }

/**
 * Como o "Organizar" distribui os blocos:
 * - `single`: uma matriz só, com todos os blocos (comportamento padrão).
 * - `by-repository`: uma faixa por repositório (`cwd`), empilhadas.
 */
export type ArrangeMode = 'single' | 'by-repository'

/** Número mínimo de blocos para que organizar faça alguma diferença. */
const MINIMUM_ARRANGEABLE = 2

/**
 * Respiro entre duas faixas de repositórios, maior que o vão entre células.
 *
 * É o que faz a separação ser lida como separação: com o mesmo vão das células,
 * duas faixas viram uma matriz só com um buraco no meio.
 */
const BAND_GAP = MATRIX_GAP * 3

/**
 * Blocos que o "Organizar" reposiciona: todo bloco de topo, de qualquer tipo.
 *
 * Filhos de grupo ficam de fora porque suas coordenadas são relativas ao pai —
 * movê-los aqui os arrancaria do grupo. O grupo em si entra na matriz e leva os
 * filhos junto.
 */
function isArrangeable(node: Node): boolean {
  return !node.parentId
}

export function countArrangeableNodes(nodes: Node[]): number {
  return nodes.filter(isArrangeable).length
}

/**
 * Reposiciona os blocos de topo, mantendo blocos ligados por arestas em células
 * vizinhas.
 *
 * @param nodes - Na ordem do dock; é ela que decide qual bloco vai para qual
 *   célula. Ver o comentário no topo do módulo.
 * @param edges - Ligações entre blocos; mantêm os ligados lado a lado.
 * @param mode - Uma matriz só, ou uma faixa por repositório.
 * @returns Os blocos (com as novas posições) e a área ocupada, ou
 *   `bounds: null` quando não há blocos suficientes para organizar.
 */
export function arrangeNodesAsMatrix<TNode extends Node>(
  nodes: TNode[],
  edges: Edge[] = [],
  mode: ArrangeMode = 'single',
): { nodes: TNode[]; bounds: MatrixBounds | null } {
  const arrangeable = nodes.filter(isArrangeable)
  if (arrangeable.length < MINIMUM_ARRANGEABLE) {
    return { nodes, bounds: null }
  }

  // A célula é dimensionada por todos os blocos, inclusive nas faixas: colunas
  // desalinhadas entre uma faixa e outra leem-se como desalinho, não como
  // agrupamento.
  const cell = cellSize(arrangeable)
  const anchor = matrixAnchor(arrangeable)
  const bands =
    mode === 'by-repository'
      ? groupByRepository(arrangeable).map((band) => band.nodes)
      : [arrangeable]

  const positions = new Map<string, { x: number; y: number }>()
  let bandTop = anchor.y
  let widestBand = 0

  for (const band of bands) {
    const columns = matrixColumns(band.length)
    const slots = assignSlots(connectedComponents(band, edges), columns)
    const rows = Math.max(...[...slots.values()].map((slot) => slot.row)) + 1
    const bandAnchor = { x: anchor.x, y: bandTop }

    for (const [id, slot] of slots) {
      positions.set(id, slotPosition(slot, bandAnchor, cell))
    }

    const bounds = matrixBounds(bandAnchor, cell, columns, rows)
    widestBand = Math.max(widestBand, bounds.width)
    bandTop = bounds.y + bounds.height + BAND_GAP
  }

  return {
    nodes: nodes.map((node) => {
      const position = positions.get(node.id)
      return position ? { ...node, position } : node
    }),
    bounds: {
      x: anchor.x,
      y: anchor.y,
      width: widestBand,
      // O último BAND_GAP é folga depois da última faixa, e não faz parte do
      // que precisa caber na tela.
      height: bandTop - anchor.y - BAND_GAP,
    },
  }
}
