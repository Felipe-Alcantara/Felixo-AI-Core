// A forma visual do dock "Elementos": os blocos ficam em faixas por pasta de
// trabalho, mas cada linha conserva o índice da lista plana original. Assim os
// cabeçalhos são só uma camada visual: não entram no cálculo de drag, navegação,
// numeração ou no contrato de reordenação por id.
import type { Node } from '@xyflow/react'
import { groupByRepository } from '../../services/repository-grouping'

export type DockGroup<TNode extends Node> = {
  key: string
  label: string
  nodes: Array<{
    node: TNode
    /** Índice do bloco na lista plana que veio do canvas. */
    index: number
  }>
}

type GroupedDockRow = { groupKey: string }

/** Retorna o intervalo visual contíguo da pasta de uma linha do dock. */
export function dockGroupRange(
  rows: readonly GroupedDockRow[],
  rowIndex: number,
): { start: number; end: number } | null {
  const row = rows[rowIndex]
  if (!row) {
    return null
  }

  let start = rowIndex
  while (start > 0 && rows[start - 1]?.groupKey === row.groupKey) {
    start -= 1
  }

  let end = rowIndex
  while (end + 1 < rows.length && rows[end + 1]?.groupKey === row.groupKey) {
    end += 1
  }

  return { start, end }
}

/** Cabeçalhos separam pastas: um drag nunca pode cruzar essa fronteira. */
export function canReorderDockRows(
  rows: readonly GroupedDockRow[],
  fromRowIndex: number,
  toRowIndex: number,
): boolean {
  const from = rows[fromRowIndex]
  const to = rows[toRowIndex]
  return Boolean(from && to && from.groupKey === to.groupKey)
}

/**
 * Agrupa o que o dock exibe pela mesma chave usada pelo canvas.
 *
 * A ordem dos grupos e dos seus membros vem de `groupByRepository`; o índice,
 * porém, vem da entrada plana. Essa separação é deliberada: organizar a tela
 * por pasta não deve fingir que a lista persistida mudou, nem fazer um
 * cabeçalho ocupar uma posição que pertenceria a um bloco.
 */
export function groupDockElements<TNode extends Node>(
  nodes: readonly TNode[],
): DockGroup<TNode>[] {
  const indexById = new Map(nodes.map((node, index) => [node.id, index]))

  return groupByRepository([...nodes]).map((group) => ({
    key: group.key,
    label: group.label,
    nodes: group.nodes.flatMap((node) => {
      const index = indexById.get(node.id)
      return index === undefined ? [] : [{ node, index }]
    }),
  }))
}
