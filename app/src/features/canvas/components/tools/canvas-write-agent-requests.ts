import type { CanvasWriteAgentRequest } from '../../types'

/**
 * Como o pedido de ESCRITA de um agente é anunciado para a pessoa.
 *
 * Mesmo espírito de `fetch-all-agent-requests.ts`: a frase que autoriza uma
 * escrita mora em funções puras, fora do componente, para ter teste — não
 * revisão visual. É o ponto de atenção que a própria task nomeia como maior
 * risco de segurança do app.
 */

const PREVIEW_MAX = 240

/** O pedido mais antigo ainda pendente: a fila é atendida em ordem. */
export function pickPendingWriteRequest(
  requests: CanvasWriteAgentRequest[] | null | undefined,
): CanvasWriteAgentRequest | null {
  const pendentes = (requests ?? []).filter((pedido) => pedido.estado === 'pendente')
  return pendentes.length > 0 ? pendentes[0] : null
}

/** Rótulo do bloco alvo, para a pessoa saber ONDE o agente quer escrever sem precisar decorar um id. */
export function findTargetLabel(
  request: CanvasWriteAgentRequest,
  nodes: Array<{ id: string; data?: { label?: unknown; text?: unknown } }>,
): string {
  const node = nodes.find((candidato) => candidato.id === request.idDoElemento)
  if (!node) return request.idDoElemento

  const label = typeof node.data?.label === 'string' ? node.data.label.trim() : ''
  if (label) return label

  const text = typeof node.data?.text === 'string' ? node.data.text.trim() : ''
  const firstLine = text.split('\n')[0]?.trim()
  return firstLine || request.idDoElemento
}

/**
 * Descreve o pedido em uma frase, dizendo o que ele NÃO fez — e mostra o
 * próprio conteúdo, truncado: a pessoa precisa ver o que vai ser escrito,
 * não só que "algo" foi pedido.
 */
export function describeWriteRequest(
  request: CanvasWriteAgentRequest,
  nodes: Array<{ id: string; data?: { label?: unknown; text?: unknown } }>,
): string {
  const alvo = findTargetLabel(request, nodes)
  const origem = request.origem ? ` a partir de ${request.origem}` : ''
  return `Um agente pediu para escrever na nota "${alvo}"${origem}. Nada foi escrito — depende de você.`
}

/** O conteúdo do pedido, truncado para exibição — nunca o texto cru sem limite na tela. */
export function previewWriteContent(request: CanvasWriteAgentRequest): string {
  const conteudo = request.conteudo ?? ''
  if (conteudo.length <= PREVIEW_MAX) return conteudo
  return `${conteudo.slice(0, PREVIEW_MAX)}…`
}

/** Hora do pedido no formato curto, para a pessoa saber se é de agora. */
export function formatWriteRequestTime(request: CanvasWriteAgentRequest): string {
  const instante = new Date(request.pedidoEm)
  return Number.isNaN(instante.getTime())
    ? ''
    : instante.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

type WriteRequestResponse = {
  ok?: boolean
  message?: string
  resultado?: { ok?: boolean; message?: string }
}

export type WriteRequestUiUpdate = {
  error: string | null
  applied: boolean
}

/**
 * Projeta a resposta do IPC no estado que o painel pode alterar.
 *
 * O nó vivo em si NÃO é atualizado por aqui: chega separado, pelo evento
 * `canvas:agent-node-updated`, empurrado pelo processo principal só depois
 * de persistir — a mesma ordem que evita anunciar como aplicado algo que
 * não aconteceu.
 */
export function applyWriteRequestResult(
  result: WriteRequestResponse | null | undefined,
  aceito: boolean,
): WriteRequestUiUpdate {
  if (!result?.ok) {
    return { error: result?.message ?? 'Falha ao responder o pedido do agente.', applied: false }
  }
  if (!aceito) {
    return { error: null, applied: false }
  }
  if (result.resultado?.ok !== true) {
    return { error: result.resultado?.message ?? 'Não foi possível escrever.', applied: false }
  }
  return { error: null, applied: true }
}
