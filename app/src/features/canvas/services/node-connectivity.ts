// Agrupamento de blocos por conectividade: quem está ligado por arestas forma
// um componente. Isolado do layout porque é grafo puro — não conhece grade,
// células nem posições finais, só quem está ligado a quem.
import type { Edge, Node } from '@xyflow/react'

/**
 * Tolerância vertical para considerar dois blocos na mesma faixa visual. Sem
 * ela, poucos pixels de diferença trocariam a ordem de blocos que o usuário vê
 * lado a lado.
 */
const SAME_ROW_TOLERANCE = 80

/**
 * Ordem de leitura (cima→baixo, esquerda→direita) a partir das posições atuais.
 * Preserva aproximadamente o arranjo que o usuário já tinha, em vez de
 * embaralhar os blocos pela ordem de criação.
 *
 * O desempate por id garante determinismo: blocos exatamente sobrepostos não
 * podem trocar de lugar entre duas execuções.
 */
export function inReadingOrder<TNode extends Node>(nodes: TNode[]): TNode[] {
  return [...nodes].sort((left, right) => {
    const verticalGap = left.position.y - right.position.y
    if (Math.abs(verticalGap) > SAME_ROW_TOLERANCE) {
      return verticalGap
    }
    const horizontalGap = left.position.x - right.position.x
    return horizontalGap !== 0 ? horizontalGap : left.id.localeCompare(right.id)
  })
}

/** Union-find com compressão de caminho, sobre os ids dos blocos. */
function createDisjointSet(ids: string[]) {
  const parent = new Map(ids.map((id) => [id, id]))

  const find = (id: string): string => {
    let root = id
    while (parent.get(root) !== root) {
      root = parent.get(root) as string
    }
    let cursor = id
    while (parent.get(cursor) !== root) {
      const next = parent.get(cursor) as string
      parent.set(cursor, root)
      cursor = next
    }
    return root
  }

  return {
    has: (id: string) => parent.has(id),
    find,
    union: (left: string, right: string) => {
      const leftRoot = find(left)
      const rightRoot = find(right)
      if (leftRoot !== rightRoot) {
        parent.set(leftRoot, rightRoot)
      }
    },
  }
}

/**
 * Separa os blocos em componentes conectados. Blocos sem nenhuma ligação viram
 * componentes de um elemento só.
 *
 * Os componentes saem ordenados do maior para o menor, e blocos dentro de cada
 * componente saem em ordem de leitura — assim o layout pode colocá-los em
 * células consecutivas sem precisar reordenar nada.
 *
 * Arestas que citam blocos ausentes da lista (filhos de grupo, blocos já
 * removidos) são ignoradas, mantendo a união restrita ao que será organizado.
 */
export function connectedComponents<TNode extends Node>(
  nodes: TNode[],
  edges: Edge[],
): TNode[][] {
  const groups = createDisjointSet(nodes.map((node) => node.id))

  for (const edge of edges) {
    if (groups.has(edge.source) && groups.has(edge.target)) {
      groups.union(edge.source, edge.target)
    }
  }

  const components = new Map<string, TNode[]>()
  for (const node of inReadingOrder(nodes)) {
    const root = groups.find(node.id)
    const members = components.get(root)
    if (members) {
      members.push(node)
    } else {
      components.set(root, [node])
    }
  }

  const ordering = new Map(inReadingOrder(nodes).map((node, index) => [node.id, index]))

  return [...components.values()].sort((left, right) => {
    // Componentes maiores primeiro: as ligações ficam agrupadas no topo da
    // matriz, e blocos soltos preenchem o restante.
    if (left.length !== right.length) {
      return right.length - left.length
    }
    // Empate resolvido pela ordem de leitura do primeiro membro.
    return (ordering.get(left[0].id) ?? 0) - (ordering.get(right[0].id) ?? 0)
  })
}
