import type { CanvasAgentBrowserRequest } from '../types'

/** O pedido mais antigo: a fila é atendida em ordem, um cartão por vez. */
export function pickBrowserRequest(
  requests: CanvasAgentBrowserRequest[] | null | undefined,
): CanvasAgentBrowserRequest | null {
  return requests?.[0] ?? null
}

/**
 * De onde o pedido veio, para a pessoa saber qual agente pediu.
 *
 * Os campos vêm de um arquivo que qualquer um escreve na pasta de pedidos: o
 * main já confere os tipos, e o cartão confere de novo porque um valor que
 * não é texto lança ao entrar num template — e derrubaria a interface.
 */
export function describeBrowserRequestOrigin(request: CanvasAgentBrowserRequest): string {
  return typeof request.origem === 'string' && request.origem
    ? `Pedido de um agente em ${request.origem}`
    : 'Pedido de um agente'
}

/** O destino que o agente sugeriu. É só sugestão: os dois botões estão sempre lá. */
export function describeBrowserRequestSuggestion(request: CanvasAgentBrowserRequest): string {
  if (request.modo !== 'embutido') return 'O agente sugeriu o navegador.'
  return typeof request.perfil === 'string' && request.perfil
    ? `O agente sugeriu a Página Web, no perfil ${request.perfil}.`
    : 'O agente sugeriu a Página Web.'
}
