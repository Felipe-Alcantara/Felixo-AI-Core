// Reorganização explícita dos blocos do canvas ("Organizar").
//
// Este módulo apenas orquestra: decide o que é organizável, delega o
// agrupamento por ligações para node-connectivity.ts e a geometria da grade
// para matrix-grid.ts, e devolve os blocos reposicionados.
//
// O layout é DETERMINÍSTICO — a matriz é ancorada no bloco que já está mais ao
// topo-esquerda e não depende de pan, zoom ou tamanho da janela.
import type { Edge, Node } from '@xyflow/react'
import { connectedComponents } from './node-connectivity'
import {
  assignSlots,
  cellSize,
  matrixAnchor,
  matrixBounds,
  matrixColumns,
  slotPosition,
  type MatrixBounds,
} from './matrix-grid'

export type { MatrixBounds }

/** Número mínimo de blocos para que organizar faça alguma diferença. */
const MINIMUM_ARRANGEABLE = 2

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
 * Reposiciona os blocos de topo numa matriz quase quadrada, mantendo blocos
 * ligados por arestas em células vizinhas.
 *
 * @returns Os blocos (com as novas posições) e a área ocupada pela matriz, ou
 *   `bounds: null` quando não há blocos suficientes para organizar.
 */
export function arrangeNodesAsMatrix<TNode extends Node>(
  nodes: TNode[],
  edges: Edge[] = [],
): { nodes: TNode[]; bounds: MatrixBounds | null } {
  const arrangeable = nodes.filter(isArrangeable)
  if (arrangeable.length < MINIMUM_ARRANGEABLE) {
    return { nodes, bounds: null }
  }

  const components = connectedComponents(arrangeable, edges)
  const cell = cellSize(arrangeable)
  const anchor = matrixAnchor(arrangeable)
  const columns = matrixColumns(arrangeable.length)
  const slots = assignSlots(components, columns)
  const rows = Math.max(...[...slots.values()].map((slot) => slot.row)) + 1

  return {
    nodes: nodes.map((node) => {
      const slot = slots.get(node.id)
      return slot ? { ...node, position: slotPosition(slot, anchor, cell) } : node
    }),
    bounds: matrixBounds(anchor, cell, columns, rows),
  }
}
