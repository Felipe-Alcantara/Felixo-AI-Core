import type { FetchAllAgentRequest, FetchAllPlan } from '../../types'

/**
 * Como o pedido de um agente é anunciado para a pessoa.
 *
 * Funções puras, fora do componente, porque é aqui que mora a frase que a
 * pessoa lê antes de autorizar uma escrita — e frase que autoriza escrita
 * precisa de teste, não de revisão visual.
 */

/** O pedido mais antigo ainda pendente: a fila é atendida em ordem. */
export function pickPendingRequest(
  requests: FetchAllAgentRequest[] | null | undefined,
): FetchAllAgentRequest | null {
  const pendentes = (requests ?? []).filter((pedido) => pedido.estado === 'pendente')
  return pendentes.length > 0 ? pendentes[0] : null
}

/**
 * Descreve o pedido em uma frase, dizendo o que ele NÃO fez.
 *
 * O "ainda não aconteceu nada" é a parte importante: sem ele, a pessoa pode ler
 * o aviso como notificação de algo já executado e só clicar para dispensar.
 */
export function describeAgentRequest(request: FetchAllAgentRequest): string {
  const escopo = request.comCommit
    ? 'pull, push e commit dos repositórios cuja única pendência é commitar'
    : 'pull e push'

  const origem = request.origem ? ` a partir de ${request.origem}` : ''

  return `Um agente pediu para aplicar o plano (${escopo})${origem}. Nada foi executado — depende de você.`
}

/** Hora do pedido no formato curto, para a pessoa saber se é de agora. */
export function formatRequestTime(request: FetchAllAgentRequest): string {
  const instante = new Date(request.pedidoEm)

  return Number.isNaN(instante.getTime())
    ? ''
    : instante.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

/**
 * O que o botão de confirmação deve oferecer neste momento.
 *
 * A pessoa nunca autoriza no escuro: enquanto não há plano na tela, a única
 * ação oferecida é varrer. O botão que escreve só aparece depois que existe um
 * plano visível — e some enquanto a varredura está em andamento.
 */
export function agentRequestAction(
  plan: FetchAllPlan | null,
  busy: boolean,
): 'aguardar' | 'varrer' | 'aplicar' {
  if (busy) return 'aguardar'
  return plan ? 'aplicar' : 'varrer'
}
