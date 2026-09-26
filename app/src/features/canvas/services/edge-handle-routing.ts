// Por qual handle de cada bloco uma conexão do canvas passa. Os handles não
// são persistidos: a cada render a conexão é roteada pelos lados que se
// encaram, calculados das posições atuais (ver nearestSides).
import type { Node } from '@xyflow/react'
import { nearestSides } from './node-geometry'

/**
 * Tipos de bloco que desenham um par de handles com id em cada um dos quatro
 * lados (`s-top`/`t-top`, `s-right`/`t-right`...): `TerminalSideHandles` em
 * TerminalNode.tsx e `FourSideHandles` em FileNode.tsx.
 *
 * Os demais blocos (nota, desenho, página web, Tarefas Notion...) têm um único
 * handle de entrada à esquerda e um de saída à direita, **sem id**. Pedir
 * `t-top` a um deles faz o React Flow não achar o handle e descartar a
 * conexão: ela continua gravada e contada na barra de status, mas não é
 * desenhada nem pode ser clicada para ser removida.
 *
 * Ao dar handles laterais a outro bloco, inclua o tipo aqui — o teste deste
 * módulo confere os componentes contra esta lista.
 */
export const SIDE_HANDLE_NODE_TYPES: ReadonlySet<string> = new Set(['terminal', 'file'])

export type EdgeHandles = {
  /** `null` = o único handle de saída do bloco (o React Flow usa o primeiro). */
  sourceHandle: string | null
  /** `null` = o único handle de entrada do bloco. */
  targetHandle: string | null
}

function hasSideHandles(node: Node): boolean {
  return node.type !== undefined && SIDE_HANDLE_NODE_TYPES.has(node.type)
}

/**
 * Handles que a conexão `source → target` deve usar: o do lado voltado para o
 * outro bloco quando ele tem handles laterais; senão, o handle único dele.
 */
export function edgeHandlesBetween(source: Node, target: Node): EdgeHandles {
  const sides = nearestSides(source, target)
  return {
    sourceHandle: hasSideHandles(source) ? `s-${sides.source}` : null,
    targetHandle: hasSideHandles(target) ? `t-${sides.target}` : null,
  }
}
