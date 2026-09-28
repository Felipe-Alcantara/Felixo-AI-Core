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
}

const ERROR_MESSAGES: Record<ProviderSwitchErrorCode, string> = {
  DECISION_NOT_PENDING: 'Essa troca já foi respondida ou expirou.',
  RUN_FINISHED: 'A orquestração já terminou; nenhum provedor foi trocado.',
  RUN_FAILED: 'A orquestração falhou ao aplicar a resposta.',
  INVALID_PARAMS: 'Resposta inválida; tente de novo.',
}

/** Custo da troca, sempre visível no card (decisão 1: confirmar sabendo o custo). */
export const PROVIDER_SWITCH_COST_NOTICE =
  'Muda de provedor e de conta de cobrança; roda no login do sistema do destino.'

export function formatProviderLabel(cliType: OrchestrationCliType | string) {
  return PROVIDER_LABELS[cliType as OrchestrationCliType] ?? cliType
}

export function formatProviderSwitchRoute(request: ProviderSwitchRequest) {
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
