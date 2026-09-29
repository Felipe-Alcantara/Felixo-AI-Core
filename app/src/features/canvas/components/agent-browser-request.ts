import type { CanvasAgentBrowserRequest } from '../types'

/**
 * Quanto os botões esperam para valer depois que o cartão passa a mostrar
 * outro pedido (ou o mesmo com outro conteúdo). O cartão troca na hora em que
 * um pedido é atendido: sem essa espera, um clique apressado decidiria o
 * próximo pedido sem a pessoa lê-lo.
 */
export const BROWSER_REQUEST_ARM_MS = 600

/** O que o cartão mostra de um pedido. Mudou isto, os botões esperam de novo. */
export function browserRequestArmKey(request: CanvasAgentBrowserRequest | null): string | null {
  return request ? JSON.stringify([request.id, request.url, request.modo, request.perfil ?? '']) : null
}

/**
 * Segundo (ou terceiro) clique de uma sequência rápida. Nunca é uma decisão
 * nova: o primeiro já decidiu, e o cartão pode estar mostrando o próximo. O
 * teclado chega com `detail` 0.
 */
export function isRepeatedClick(detail: number): boolean {
  return detail > 1
}

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

/**
 * O que o cartão manda ao decidir. A URL e o perfil não escolhem nada: são o
 * que a pessoa viu, e o main só executa se o pedido gravado ainda for esse
 * (um arquivo reescrito depois de o cartão aparecer não abre).
 */
export function browserDecisionParams(
  request: CanvasAgentBrowserRequest,
  destino: 'externo' | 'embutido' | null,
): { id: string; destino: 'externo' | 'embutido' | null; url: string; perfil?: string } {
  return {
    id: request.id,
    destino,
    url: request.url,
    ...(typeof request.perfil === 'string' && request.perfil ? { perfil: request.perfil } : {}),
  }
}

/**
 * O que o cartão diz depois de uma decisão, ou `null` quando ela foi atendida.
 * O main devolve `resolved: null` com o motivo quando não fez nada (o pedido
 * mudou depois de aparecer, já está sendo atendido, não está mais pendente) e
 * `ok: false` quando tentou e não conseguiu.
 */
export function browserDecisionError(
  result: { ok: boolean; message?: string; resolved?: unknown } | null | undefined,
): string | null {
  if (result?.ok && result.resolved && !result.message) return null
  return result?.message || 'Não foi possível atender o pedido.'
}
