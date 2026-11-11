// Memoização do `data` de cada bloco do canvas, dos objetos de nó e de aresta
// e numeração dos terminais.
//
// Extraído do `useMemo` de renderização do CanvasView: são as partes puras
// daquele bloco, e as que mais importam para desempenho — sem o cache, todo
// bloco recebe um `data` novo a cada render e o React.memo deixa de pular
// blocos intocados durante drag/pan, o que pesa em hardware modesto.
//
// O mesmo vale para o objeto do nó em si: o React Flow só reaproveita o nó
// interno (e o NodeWrapper não re-renderiza) quando recebe o MESMO objeto
// (`userNode === internalNode.internals.userNode`, @xyflow/system). Um
// `{ ...node }` novo por quadro de arrasto re-renderizava todo bloco montado.

export type ReuseCacheEntry<T> = {
  deps: unknown[]
  data: T
}

export type NodeDataCacheEntry = ReuseCacheEntry<Record<string, unknown>>

export type ReusePass<T> = {
  /**
   * Devolve o valor já existente da chave quando nenhuma dependência mudou,
   * ou constrói um novo. A comparação é por identidade (`===`), item a item.
   */
  reuse: (id: string, deps: unknown[], build: () => T) => T
  /** Fecha a passagem: o cache fica só com as chaves visitadas nela. */
  commit: () => void
}

/**
 * Abre uma passagem de reuso sobre um cache persistente (um Map estável
 * mantido pelo componente). Serve para o `data` dos blocos, para os objetos
 * de nó e de aresta entregues ao React Flow e para o que mais precise manter
 * a identidade quando nada mudou.
 */
export function createReusePass<T>(cache: Map<string, ReuseCacheEntry<T>>): ReusePass<T> {
  const previous = new Map(cache)
  const next = new Map<string, ReuseCacheEntry<T>>()

  const reuse = (id: string, deps: unknown[], build: () => T): T => {
    const cached = previous.get(id)
    if (
      cached &&
      cached.deps.length === deps.length &&
      cached.deps.every((dep, index) => dep === deps[index])
    ) {
      next.set(id, cached)
      return cached.data
    }

    const entry = { deps, data: build() }
    next.set(id, entry)
    return entry.data
  }

  const commit = () => {
    cache.clear()
    for (const [id, entry] of next) {
      cache.set(id, entry)
    }
  }

  return { reuse, commit }
}

/** O que identifica a estrutura de um bloco: tudo menos posição, tamanho e seleção. */
type StructuralNode = {
  id: string
  type?: string
  data?: unknown
  parentId?: string
}

/**
 * Devolve a lista anterior quando só posição, tamanho ou seleção mudaram
 * (mesmos blocos, na mesma ordem, com o mesmo `data`), ou a nova.
 *
 * Os derivados estruturais (índice de conexões, `data` injetado, rótulo do
 * minimapa) partem desta lista, então um quadro de arrasto não os recalcula.
 * Quem a usa não pode ler posição dela: os itens podem ser de antes do arrasto.
 */
export function stableNodeStructure<N extends StructuralNode>(
  previous: readonly N[] | null,
  nodes: readonly N[],
): readonly N[] {
  if (
    previous &&
    previous.length === nodes.length &&
    nodes.every((node, index) => {
      const before = previous[index]
      return (
        before === node ||
        (before.id === node.id &&
          before.type === node.type &&
          before.data === node.data &&
          before.parentId === node.parentId)
      )
    })
  ) {
    return previous
  }
  return nodes
}

/**
 * A última estrutura vista, guardada fora do React (o componente a mantém num
 * `useState` estável, como o cache do `data`): ver `stableNodeStructure`.
 */
export function createNodeStructureTracker<N extends StructuralNode>(): (
  nodes: readonly N[],
) => readonly N[] {
  let last: readonly N[] | null = null
  return (nodes) => (last = stableNodeStructure(last, nodes))
}

/** Só o que a numeração precisa saber de um bloco. */
type OrderableNode = {
  id: string
  type?: string
}

export type NodeDataReuse = {
  /**
   * Devolve o `data` já existente do bloco quando nenhuma dependência mudou,
   * ou constrói um novo. A comparação é por identidade (`===`), item a item.
   */
  reuseData: (
    id: string,
    deps: unknown[],
    build: () => Record<string, unknown>,
  ) => Record<string, unknown>
  /**
   * Fecha a passagem: o cache passa a conter apenas os blocos visitados,
   * descartando os que saíram do canvas para o Map não crescer sem limite.
   */
  commit: () => void
}

/**
 * Abre uma passagem de reuso sobre o cache persistente.
 *
 * O cache é lido durante a render, então precisa ser um Map estável mantido
 * pelo componente; esta função só coordena leitura/escrita de uma passagem.
 */
export function createNodeDataReuse(
  cache: Map<string, NodeDataCacheEntry>,
): NodeDataReuse {
  const { reuse, commit } = createReusePass(cache)
  return { reuseData: reuse, commit }
}

/**
 * Posição de cada terminal entre os terminais abertos, 1-based e na ordem do
 * array (que é a ordem de criação, já que blocos são acrescentados ao fim).
 *
 * Recalculado a cada render de propósito: fechar um terminal renumera os
 * seguintes em vez de deixar buraco, como faria um contador acumulado.
 */
export function countTerminalOrder(
  nodes: readonly OrderableNode[],
): Map<string, number> {
  const order = new Map<string, number>()
  let count = 0

  for (const node of nodes) {
    if (node.type === 'terminal') {
      count += 1
      order.set(node.id, count)
    }
  }

  return order
}
