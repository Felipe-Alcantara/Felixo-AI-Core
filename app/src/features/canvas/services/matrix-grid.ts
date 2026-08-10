// Geometria da matriz: dado um conjunto de grupos de blocos, decide célula,
// âncora e em que linha/coluna cada bloco cai. Não conhece arestas nem tipos de
// bloco — só tamanhos e posições.
import type { Node } from '@xyflow/react'
import { getNodeSize } from './node-geometry'

/** Espaço entre células, igual ao usado no posicionamento de novos blocos. */
export const MATRIX_GAP = 32

export type MatrixBounds = {
  x: number
  y: number
  width: number
  height: number
}

export type MatrixSlot = { row: number; column: number }

type Size = { width: number; height: number }

/**
 * Célula única, dimensionada pelo maior bloco presente: mantém linhas e colunas
 * alinhadas mesmo com tipos de tamanhos diferentes (nota 220x160, web 560x420),
 * ao custo de alguma folga em volta dos blocos menores.
 */
export function cellSize(nodes: Node[]): Size {
  return nodes.reduce(
    (largest, node) => {
      const size = getNodeSize(node)
      return {
        width: Math.max(largest.width, size.width),
        height: Math.max(largest.height, size.height),
      }
    },
    { width: 0, height: 0 },
  )
}

/**
 * Âncora da matriz: o canto do bloco que já está mais acima e à esquerda.
 *
 * É o que torna o resultado reproduzível. A versão anterior derivava a âncora
 * do viewport visível, então pan, zoom e tamanho de janela mudavam o destino —
 * a causa de "às vezes organiza, às vezes só junta os blocos".
 */
export function matrixAnchor(nodes: Node[]): { x: number; y: number } {
  return {
    x: Math.min(...nodes.map((node) => node.position.x)),
    y: Math.min(...nodes.map((node) => node.position.y)),
  }
}

/** Colunas de uma matriz quase quadrada para `count` blocos. */
export function matrixColumns(count: number): number {
  return Math.ceil(Math.sqrt(count))
}

/**
 * Distribui grupos de blocos pela grade, preenchendo linha a linha, sem partir
 * um grupo entre duas linhas quando ele ainda caberia inteiro na seguinte.
 *
 * Sem essa regra, dois blocos ligados por uma aresta poderiam cair nas pontas
 * opostas da matriz — exatamente o que a ligação deveria evitar.
 *
 * Grupos maiores que uma linha inteira são partidos: não há como mantê-los
 * contíguos, e eles ocupam linhas completas de qualquer forma.
 */
export function assignSlots(groups: Node[][], columns: number): Map<string, MatrixSlot> {
  const slots = new Map<string, MatrixSlot>()
  let row = 0
  let column = 0

  for (const group of groups) {
    const fitsInOneRow = group.length <= columns
    const remainingInRow = columns - column
    if (fitsInOneRow && group.length > remainingInRow && column > 0) {
      row += 1
      column = 0
    }

    for (const node of group) {
      slots.set(node.id, { row, column })
      column += 1
      if (column === columns) {
        row += 1
        column = 0
      }
    }
  }

  return slots
}

/** Converte uma célula (linha/coluna) na posição absoluta do bloco no canvas. */
export function slotPosition(
  slot: MatrixSlot,
  anchor: { x: number; y: number },
  cell: Size,
): { x: number; y: number } {
  return {
    x: anchor.x + slot.column * (cell.width + MATRIX_GAP),
    y: anchor.y + slot.row * (cell.height + MATRIX_GAP),
  }
}

/** Área total ocupada pela matriz, para a view poder enquadrá-la. */
export function matrixBounds(
  anchor: { x: number; y: number },
  cell: Size,
  columns: number,
  rows: number,
): MatrixBounds {
  return {
    x: anchor.x,
    y: anchor.y,
    width: columns * cell.width + (columns - 1) * MATRIX_GAP,
    height: rows * cell.height + (rows - 1) * MATRIX_GAP,
  }
}
