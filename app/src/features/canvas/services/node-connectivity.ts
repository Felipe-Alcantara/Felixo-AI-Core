// Agrupamento de blocos por conectividade: quem está ligado por arestas forma
// um componente. Isolado do layout porque é grafo puro — não conhece grade,
// células nem posições finais, só quem está ligado a quem.
import type { Edge, Node } from '@xyflow/react'

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
 * **A ordem de entrada manda, e é a identidade dos blocos.** A lista chega na
 * ordem do dock "Elementos" — a mesma que numera os terminais (`#N`) e que a
 * pessoa reordena arrastando lá. Os membros de cada componente saem nessa
 * ordem, e os componentes saem na ordem do seu primeiro membro.
 *
 * Duas coisas que esta função deliberadamente NÃO faz, porque cada uma
 * embaralhava a matriz a cada clique:
 *
 * - Não ordena por posição atual. Arrastar um bloco pelo canvas mudava a
 *   ordem de leitura e, com ela, a célula de destino — a pessoa perdia a
 *   referência de qual terminal era qual.
 * - Não põe os componentes maiores primeiro. Ligar ou desligar uma aresta
 *   mudava o tamanho de um componente e reorganizava a matriz inteira em
 *   cascata.
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
  for (const node of nodes) {
    const root = groups.find(node.id)
    const members = components.get(root)
    if (members) {
      members.push(node)
    } else {
      components.set(root, [node])
    }
  }

  // A ordem de inserção do Map já é a do primeiro membro de cada componente,
  // que é a ordem de entrada. Não há nada a reordenar depois.
  return [...components.values()]
}
