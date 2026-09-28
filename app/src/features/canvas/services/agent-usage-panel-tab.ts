/**
 * Aba com que o painel "Limites e uso" abre na próxima vez. Serve para
 * "Configurar cadeia" (no diálogo de troca) levar direto à aba Cadeia sem o
 * canvas precisar guardar o estado interno do painel.
 */
export type AgentUsagePanelTab = 'uso' | 'cadeia' | 'trocas'

let requestedTab: AgentUsagePanelTab | null = null

export function requestAgentUsageTab(tab: AgentUsagePanelTab): void {
  requestedTab = tab
}

/** Lida uma vez, ao montar o painel; depois volta ao padrão. */
export function consumeRequestedAgentUsageTab(): AgentUsagePanelTab | null {
  const tab = requestedTab
  requestedTab = null
  return tab
}
