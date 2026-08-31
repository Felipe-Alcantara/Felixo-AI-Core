import type { FetchAllActionResult, FetchAllAgentRequest, FetchAllPlan } from '../../types'

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

type AgentRequestExecutionResult = {
  ok?: boolean
  message?: string
  results?: FetchAllActionResult[]
  reportPath?: string
}

type AgentRequestResponse = {
  ok?: boolean
  message?: string
  resultado?: AgentRequestExecutionResult
}

export type AgentRequestUiUpdate = {
  error: string | null
  clearPlan: boolean
  results: FetchAllActionResult[] | null
  reportPath: string
}

/**
 * Projeta a resposta do IPC no estado que o painel pode alterar.
 *
 * Uma confirmação humana não autoriza limpar o plano por si só: a execução
 * precisa voltar com `resultado.ok === true`. Manter essa regra pura permite
 * testá-la sem montar o painel inteiro e evita que uma resposta parcial do IPC
 * deixe a interface parecendo concluída.
 */
export function applyAgentRequestResult(
  result: AgentRequestResponse | null | undefined,
  aceito: boolean,
): AgentRequestUiUpdate {
  const semExecucao = {
    clearPlan: false,
    results: null,
    reportPath: '',
  } satisfies Omit<AgentRequestUiUpdate, 'error'>

  if (!result?.ok) {
    return {
      ...semExecucao,
      error: result?.message ?? 'Falha ao responder o pedido do agente.',
    }
  }

  if (!aceito) {
    return { ...semExecucao, error: null }
  }

  if (result.resultado?.ok !== true) {
    return {
      ...semExecucao,
      error: result.resultado?.message ?? 'Falha ao executar o plano.',
    }
  }

  return {
    error: null,
    clearPlan: true,
    results: result.resultado.results ?? [],
    reportPath: result.resultado.reportPath ?? '',
  }
}
