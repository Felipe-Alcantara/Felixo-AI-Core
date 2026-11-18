// Modelo de visão das perguntas de troca de provedor do orquestrador. Funções
// puras: quem decide e executa é o runner no processo principal; aqui só se
// mantém a lista do que está pendente e se monta o texto do card.
import type {
  OrchestrationCliType,
  ProviderSwitchErrorCode,
  ProviderSwitchRequest,
  ProviderSwitchRequestStreamEvent,
  ProviderSwitchResolvedStreamEvent,
  ProviderSwitchRespondResult,
} from '../types'

const PROVIDER_LABELS: Record<OrchestrationCliType, string> = {
  claude: 'Claude',
  codex: 'Codex',
  'codex-app-server': 'Codex',
  gemini: 'Gemini',
  'gemini-acp': 'Gemini',
}

const RULE_LABELS: Record<string, string> = {
  'provider-fallback': 'Fallback para outro provedor (o pedido está indisponível)',
  'last-resort': 'Último recurso (nenhum provedor sem limite)',
  'best-available-model': 'Melhor modelo disponível',
  'preferred-model': 'Modelo preferido',
  'account-chain': 'Próxima conta apta da cadeia (a conta atual bateu o limite)',
  'cost-cap': 'Teto de custo da execução',
  'cli-permission': 'Pedido de permissão da CLI (ação sensível)',
}

function formatUsd(value: number) {
  const digits = value > 0 && value < 0.01 ? 4 : 2
  return `US$ ${value.toFixed(digits).replace('.', ',')}`
}

/** Título do card, por tipo de pergunta. */
export function formatProviderSwitchTitle(request: ProviderSwitchRequest) {
  if (request.kind === 'cost') return 'Continuar acima do teto de custo?'
  if (request.kind === 'permission') return `Permitir? ${request.reason ?? 'A CLI pede permissão'}`
  return request.kind === 'account' ? 'Trocar de conta?' : 'Trocar de provedor?'
}

/** Rótulos dos dois botões. */
export function formatProviderSwitchActions(request: ProviderSwitchRequest) {
  if (request.kind === 'cost') return { accept: 'Continuar', refuse: 'Parar' }
  if (request.kind === 'permission') return { accept: 'Permitir', refuse: 'Negar' }
  return { accept: `Trocar para ${formatProviderSwitchTarget(request)}`, refuse: 'Não trocar' }
}

/** O que acontece sem resposta no prazo. */
export function formatProviderSwitchTimeoutNote(request: ProviderSwitchRequest) {
  if (request.kind === 'cost') return 'sem resposta, a execução para no teto.'
  if (request.kind === 'permission') {
    return request.onTimeout === 'allow'
      ? 'sem resposta, vale a opção recomendada: permitir.'
      : 'sem resposta, a permissão é negada.'
  }
  return 'sem resposta, conta como recusa e nada é trocado.'
}

/**
 * Linhas de contexto do card. No teto de custo, quanto se gastou e o que a
 * soma não cobre (só o Claude informa custo); no pedido de permissão, o que a
 * CLI quer fazer.
 */
export function formatProviderSwitchDetails(request: ProviderSwitchRequest): string[] {
  if (request.kind === 'cost') {
    const lines = [
      `Gasto informado: ${formatUsd(request.spentUsd ?? 0)} de ${formatUsd(request.capUsd ?? 0)}.`,
      'Continuar libera mais um teto; Parar não abre mais nenhum sub-agente nesta execução.',
    ]
    const unknown = request.unknownCostCount ?? 0
    if (unknown > 0) {
      lines.push(
        `${unknown} ${unknown === 1 ? 'resposta ficou' : 'respostas ficaram'} fora da soma: só o Claude informa custo (Codex e Gemini, não).`,
      )
    }
    return lines
  }
  if (request.kind === 'permission') {
    return (request.permissionDetail ?? '').split('\n').filter(Boolean)
  }
  return []
}

const ERROR_MESSAGES: Record<ProviderSwitchErrorCode, string> = {
  DECISION_NOT_PENDING: 'Essa troca já foi respondida ou expirou.',
  RUN_FINISHED: 'A orquestração já terminou; nenhum provedor foi trocado.',
  RUN_FAILED: 'A orquestração falhou ao aplicar a resposta.',
  INVALID_PARAMS: 'Resposta inválida; tente de novo.',
}

/** Custo da troca, sempre visível no card (decisão 1: confirmar sabendo o custo). */
export const PROVIDER_SWITCH_COST_NOTICE =
  'Muda de provedor e de conta de cobrança; o destino roda na conta escolhida no chat para ele, ou no Login do sistema.'

/** Troca de conta: o provedor e o modelo ficam; muda a conta (e a cota que ela gasta). */
export const ACCOUNT_SWITCH_COST_NOTICE = 'Mesmo provedor e modelo; muda a conta e a cota que ela gasta.'

export function isAccountSwitch(request: ProviderSwitchRequest) {
  return request.kind === 'account'
}

/** Para onde a troca leva: a conta, na troca de conta; o provedor, nas outras. */
export function formatProviderSwitchTarget(request: ProviderSwitchRequest) {
  return isAccountSwitch(request) ? (request.toAccountLabel ?? 'outra conta') : formatProviderLabel(request.toCliType)
}

export function formatProviderLabel(cliType: OrchestrationCliType | string) {
  return PROVIDER_LABELS[cliType as OrchestrationCliType] ?? cliType
}

export function formatProviderSwitchRoute(request: ProviderSwitchRequest) {
  if (request.kind === 'cost' || request.kind === 'permission') {
    return `(${formatProviderLabel(request.toCliType)})`
  }

  if (isAccountSwitch(request)) {
    const from = request.fromAccountLabel ?? 'conta atual'
    return `${from} → ${formatProviderSwitchTarget(request)} (${formatProviderLabel(request.toCliType)})`
  }

  const target = request.toModelName
    ? `${formatProviderLabel(request.toCliType)} (${request.toModelName})`
    : formatProviderLabel(request.toCliType)

  return `${formatProviderLabel(request.fromCliType)} → ${target}`
}

export function formatProviderSwitchRule(rule: string | null) {
  if (!rule) {
    return null
  }

  return RULE_LABELS[rule] ?? rule
}

export function formatProviderSwitchStage(request: ProviderSwitchRequest) {
  if (request.kind === 'cost') return `O sub-agente ${request.agentId} espera para abrir.`
  if (request.kind === 'permission') {
    return request.agentId === 'conversa'
      ? 'A conversa está parada esperando a resposta.'
      : `O sub-agente ${request.agentId} está parado esperando a resposta.`
  }
  return request.kind === 'initial'
    ? `O sub-agente ${request.agentId} ainda não começou.`
    : `O sub-agente ${request.agentId} parou no meio da tarefa.`
}

/** "até 14:32 (em 9 min)", no fuso da pessoa. */
export function formatProviderSwitchDeadline(expiresAt: string, now: number = Date.now()) {
  const expiresAtMs = Date.parse(expiresAt)

  if (!Number.isFinite(expiresAtMs)) {
    return null
  }

  const time = new Date(expiresAtMs).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })
  const minutesLeft = Math.max(0, Math.ceil((expiresAtMs - now) / 60_000))
  const remaining = minutesLeft === 0 ? 'vencida' : `em ${minutesLeft} min`

  return `até ${time} (${remaining})`
}

/**
 * O prazo da pergunta passou: o main já trata a resposta como recusa, então
 * o card não oferece mais "Trocar" (vale mesmo antes de a varredura fechar
 * a decisão). Data inválida não vence: quem decide é o main.
 */
export function isProviderSwitchExpired(expiresAt: string, now: number = Date.now()) {
  const expiresAtMs = Date.parse(expiresAt)
  return Number.isFinite(expiresAtMs) && now >= expiresAtMs
}

/** Texto da linha de status do chat enquanto há pergunta pendente. */
export function formatProviderSwitchWaitingStatus(requests: ProviderSwitchRequest[]) {
  const [first] = requests

  if (!first) {
    return null
  }

  const route = `${formatProviderLabel(first.fromCliType)} → ${formatProviderLabel(first.toCliType)}`
  const extra = requests.length > 1 ? ` (+${requests.length - 1})` : ''

  return `Aguardando sua confirmação para trocar ${route}…${extra}`
}

export function describeProviderSwitchError(result: ProviderSwitchRespondResult | null | undefined) {
  if (result?.code && ERROR_MESSAGES[result.code]) {
    return ERROR_MESSAGES[result.code]
  }

  return result?.message ?? 'Não foi possível responder à troca de provedor.'
}

/** Aplica um evento do stream à lista pendente, sem duplicar nem reordenar. */
export function applyProviderSwitchEvent(
  requests: ProviderSwitchRequest[],
  event: ProviderSwitchRequestStreamEvent | ProviderSwitchResolvedStreamEvent,
): ProviderSwitchRequest[] {
  if (event.type === 'provider_switch_resolved') {
    return requests.some((request) => request.decisionId === event.decisionId)
      ? requests.filter((request) => request.decisionId !== event.decisionId)
      : requests
  }

  if (requests.some((request) => request.decisionId === event.decisionId)) {
    return requests
  }

  return [...requests, toProviderSwitchRequest(event)]
}

/**
 * Junta a lista recuperada do main (ao montar) com o que chegou pelo stream
 * enquanto a chamada estava em voo: a lista do main é a fonte da verdade.
 */
export function mergeProviderSwitchList(
  current: ProviderSwitchRequest[],
  fromMain: ProviderSwitchRequest[],
) {
  const known = new Set(fromMain.map((request) => request.decisionId))

  return [...fromMain, ...current.filter((request) => !known.has(request.decisionId))]
}

function toProviderSwitchRequest(event: ProviderSwitchRequestStreamEvent): ProviderSwitchRequest {
  return {
    decisionId: event.decisionId,
    kind: event.kind,
    runId: event.runId,
    agentId: event.agentId,
    parentThreadId: event.parentThreadId,
    sessionId: event.sessionId,
    fromCliType: event.fromCliType,
    toCliType: event.toCliType,
    toModelId: event.toModelId,
    toModelName: event.toModelName,
    // Campos de cada tipo: sem eles o card de conta, de teto ou de permissão sai vazio.
    fromAccountLabel: event.fromAccountLabel ?? null,
    toAccountLabel: event.toAccountLabel ?? null,
    spentUsd: event.spentUsd ?? null,
    capUsd: event.capUsd ?? null,
    unknownCostCount: event.unknownCostCount ?? null,
    permissionDetail: event.permissionDetail ?? null,
    onTimeout: event.onTimeout,
    rule: event.rule,
    reason: event.reason,
    requestedAt: event.requestedAt,
    expiresAt: event.expiresAt,
  }
}

/**
 * Uma resposta por decisão: clique duplo, Enter repetido ou os dois botões
 * apertados em sequência geram uma única chamada ao main enquanto a primeira
 * está em voo ou depois que ela deu certo. Se falhar, a pessoa pode tentar de
 * novo.
 */
export function createProviderSwitchResponder(
  send: (params: { decisionId: string; accept: boolean }) => Promise<ProviderSwitchRespondResult>,
) {
  const inFlight = new Map<string, Promise<ProviderSwitchRespondResult>>()
  const settled = new Set<string>()

  return function respond(decisionId: string, accept: boolean) {
    if (settled.has(decisionId)) {
      return Promise.resolve<ProviderSwitchRespondResult>({
        ok: false,
        code: 'DECISION_NOT_PENDING',
      })
    }

    const pending = inFlight.get(decisionId)
    if (pending) {
      return pending
    }

    const call = send({ decisionId, accept })
      .then((result) => {
        if (result.ok || result.code === 'DECISION_NOT_PENDING' || result.code === 'RUN_FINISHED') {
          settled.add(decisionId)
        }
        return result
      })
      .catch((): ProviderSwitchRespondResult => ({
        ok: false,
        message: 'Não foi possível responder à troca de provedor.',
      }))
      .finally(() => {
        inFlight.delete(decisionId)
      })

    inFlight.set(decisionId, call)
    return call
  }
}
