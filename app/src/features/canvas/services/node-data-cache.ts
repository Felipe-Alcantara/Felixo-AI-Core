// Memoização do `data` de cada bloco do canvas e numeração dos terminais.
//
// Extraído do `useMemo` de renderização do CanvasView: são as duas partes
// puras daquele bloco, e as que mais importam para desempenho — sem o cache,
// todo bloco recebe um `data` novo a cada render e o React.memo deixa de
// pular blocos intocados durante drag/pan, o que pesa em hardware modesto.

export type NodeDataCacheEntry = {
  deps: unknown[]
  data: Record<string, unknown>
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
  const previous = new Map(cache)
  const next = new Map<string, NodeDataCacheEntry>()

  const reuseData = (
    id: string,
    deps: unknown[],
    build: () => Record<string, unknown>,
  ) => {
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

  return { reuseData, commit }
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
