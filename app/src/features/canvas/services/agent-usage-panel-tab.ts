/**
 * Aba com que o painel "Limites e uso" abre na próxima vez. Serve para
 * "Configurar cadeia" (no diálogo de troca) levar direto à aba Cadeia sem o
 * canvas precisar guardar o estado interno do painel.
 *
 * Com o painel já aberto, o pedido vai na hora para quem assinou (o painel
 * montado), que troca de aba e põe o foco nela: antes ele esperava a próxima
 * montagem, a aba não mudava e o foco caía no `body`.
 */
export type AgentUsagePanelTab = 'uso' | 'cadeia' | 'trocas'

let requestedTab: AgentUsagePanelTab | null = null
const listeners = new Set<(tab: AgentUsagePanelTab) => void>()

export function requestAgentUsageTab(tab: AgentUsagePanelTab): void {
  if (listeners.size > 0) {
    listeners.forEach((listener) => listener(tab))
    return
  }
  requestedTab = tab
}

/** Lida uma vez, ao montar o painel; depois volta ao padrão. */
export function consumeRequestedAgentUsageTab(): AgentUsagePanelTab | null {
  const tab = requestedTab
  requestedTab = null
  return tab
}

/** O painel montado recebe os pedidos seguintes na hora. Devolve quem cancela. */
export function subscribeAgentUsageTabRequests(listener: (tab: AgentUsagePanelTab) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
