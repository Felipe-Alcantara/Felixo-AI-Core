// Faixa de retomada de um bloco de agente e as decisões puras em volta dela:
// o que o cartão mostra ANTES do spawn quando a conversa gravada não pode ser
// retomada pelo ID, o que cada botão grava no bloco e com que texto o bloco
// (re)sobe. Mora fora dos componentes porque o cartão, a gaveta e os dois
// botões de Reiniciar precisam da MESMA resposta — e só .ts puro é testável
// neste projeto (o vitest roda em node, sem DOM).
import {
  describeAgentResumeForPerson,
  describeAgentResumeTarget,
  explainAgentResume,
  isAgentSessionReference,
  type AgentResumeChoice,
  type AgentResumeFailure,
  type AgentResumePlan,
  type AgentResumeReason,
  type AgentSessionReference,
} from './agent-session'
import { resolveTerminalInitialText } from './quality-standard-prompt'
import type { PreviousAgentSession } from '../types'

/**
 * `picker` e `new` resolvem a pendência; `retry` volta a tentar a mesma
 * conversa; `dismiss` tira o aviso de falha de um processo que segue de pé,
 * sem relançar nada.
 */
export type TerminalResumeActionId = AgentResumeChoice | 'retry' | 'dismiss'

export type TerminalResumeAction = {
  id: TerminalResumeActionId
  label: string
}

/**
 * O que a faixa mostra. Nenhum texto leva o ID da conversa nem o da conta:
 * para decidir basta saber o agente, a pasta, quando a conversa foi vista e
 * se é a conta certa — o ID completo continua no painel de detalhes.
 */
export type TerminalResumeBanner = {
  title: string
  detail: string
  /** Agente · pasta · quando · tipo de conta; ausente se o registro é ilegível. */
  target?: string
  actions: TerminalResumeAction[]
  /**
   * A CLI já recusou esta conversa (inexistente ou login). É o único motivo
   * que fala do processo que está de pé — os outros só valem para o próximo
   * spawn (ver `shouldShowTerminalResumeBanner`).
   */
  failure: boolean
}

const isFailureReason = (reason: AgentResumeReason) => reason === 'expired' || reason === 'auth'

/**
 * Estado do bloco segurado pela faixa. Sem ele o cartão diria "iniciando…"
 * para sempre, e quem olha acharia que o app travou — mas nada está subindo:
 * o bloco espera a pessoa.
 */
export const TERMINAL_RESUME_PENDING_LABEL = 'aguardando escolha'

const CHOICE_ACTIONS: readonly TerminalResumeAction[] = [
  { id: 'picker', label: 'Escolher na lista (/resume)' },
  { id: 'new', label: 'Abrir conversa nova' },
]

const RETRY_ACTION: TerminalResumeAction = { id: 'retry', label: 'Tentar retomar de novo' }

const DISMISS_ACTION: TerminalResumeAction = { id: 'dismiss', label: 'Dispensar aviso' }

/**
 * Monta a faixa de um plano pendente, ou `null` quando não há o que decidir
 * (retomada exata, lista automática sem conversa associada, ou escolha já
 * feita).
 *
 * "Tentar retomar de novo" só aparece quando a falha registrada pela CLI
 * (conversa inexistente ou login) é o ÚNICO obstáculo: aí limpar a falha leva
 * de volta à retomada exata — a pessoa pode ter feito login, ou restaurado a
 * conversa. Se também houver pasta, conta ou agente divergente, tentar de novo
 * cairia na mesma faixa por outro motivo, e o botão prometeria uma retomada
 * que não vai acontecer.
 */
export function buildTerminalResumeBanner(input: {
  plan: AgentResumePlan
  reference?: AgentSessionReference
  cwd?: string
  command?: string
}): TerminalResumeBanner | null {
  const { plan, reference, cwd, command } = input
  if (plan.outcome !== 'pending') return null

  const { title, detail } = describeAgentResumeForPerson(plan, { reference, cwd, command })
  const failureOnly = plan.reasons.every(isFailureReason)

  return {
    title,
    detail,
    ...(isAgentSessionReference(reference) ? { target: describeAgentResumeTarget(reference) } : {}),
    actions: failureOnly ? [...CHOICE_ACTIONS, RETRY_ACTION] : [...CHOICE_ACTIONS],
    failure: plan.reasons.some(isFailureReason),
  }
}

/**
 * Se a faixa aparece agora. Ela decide o PRÓXIMO spawn, então aparece quando
 * há um spawn por decidir:
 *
 * - bloco segurado, sem processo (restaurado com retomada pendente);
 * - processo encerrado ou com erro (a CLI recusou a retomada e saiu);
 * - a CLI acabou de recusar a conversa com o processo de pé (esperando login);
 * - a pessoa pediu Reiniciar deste processo (`revealed`).
 *
 * Com o agente de pé por outro motivo, ela fica guardada: um Gemini aberto
 * agora, cuja conversa acabou de ser registrada, é "pendente" para a próxima
 * abertura (o Gemini não retoma por ID) — mas uma faixa sobre um agente que
 * está funcionando pareceria um erro, e escolher nela reiniciaria o trabalho.
 */
export function shouldShowTerminalResumeBanner(input: {
  banner: TerminalResumeBanner | null
  hasProcess: boolean
  processLive: boolean
  revealed: boolean
}): boolean {
  if (!input.banner) return false
  if (!input.hasProcess || !input.processLive || input.revealed) return true
  return input.banner.failure
}

/**
 * A faixa que o cartão e a gaveta mostram agora (ver
 * `shouldShowTerminalResumeBanner`), com as ações que valem para o estado do
 * processo; `null` quando ela fica guardada.
 *
 * Falha com o processo de pé ganha "Dispensar aviso": a pessoa pode ter feito
 * login no próprio terminal que a CLI abriu, e o agente seguiu funcionando —
 * sem a saída, a faixa ficaria sobre ele até um Reiniciar que ninguém pediu.
 * Com o processo encerrado não há o que dispensar: a faixa decide o próximo
 * spawn.
 */
export function visibleTerminalResumeBanner(input: {
  banner: TerminalResumeBanner | null
  hasProcess: boolean
  processLive: boolean
  revealed: boolean
}): TerminalResumeBanner | null {
  const { banner } = input
  if (!banner || !shouldShowTerminalResumeBanner(input)) return null
  if (!banner.failure || !input.hasProcess || !input.processLive) return banner
  return { ...banner, actions: [...banner.actions, DISMISS_ACTION] }
}

/** Se o botão da faixa relança o bloco (e pede a confirmação do Reiniciar). */
export function terminalResumeActionRelaunches(action: TerminalResumeActionId): boolean {
  return action !== 'dismiss'
}

/**
 * O que o cartão diz enquanto o terminal ainda não imprimiu nada, conforme o
 * desfecho — no lugar do "Sem saída ainda…" genérico. Some sozinho com a
 * primeira linha da CLI. Só afirma o que o spawn de fato faz: "retomando" só
 * no desfecho exato, que sobe com os argumentos de retomada. `null` fora do
 * plano (e no pendente, que tem a faixa e o próprio aviso).
 */
export function describeTerminalResumeStart(plan: AgentResumePlan | undefined): string | null {
  if (!plan) return null
  switch (plan.outcome) {
    case 'exact':
      return 'Retomando a conversa anterior…'
    case 'picker':
      return plan.reason === 'fallback'
        ? 'Sem conversa associada: a CLI vai mostrar a lista (/resume)…'
        : 'Abrindo a lista de conversas da CLI (/resume)…'
    case 'new':
      return 'Abrindo uma conversa nova…'
    case 'pending':
      return null
  }
}

/**
 * O que cada botão da faixa grava no bloco. Nenhum apaga `agentSession`: a
 * conversa associada é o registro que explica a faixa, e some só quando a
 * pessoa pede em "Esquecer associação" (painel de detalhes).
 *
 * - `picker`/`new`: a escolha é transitória (não sobrevive ao reload), então
 *   reabrir o app pergunta de novo em vez de decidir em silêncio;
 * - `retry`: limpa a falha registrada — e a escolha, para a retomada exata
 *   voltar a valer;
 * - `dismiss`: limpa só a falha, sem relançar (ver
 *   `terminalResumeActionRelaunches`). O próximo Reiniciar volta a tentar a
 *   conversa; se a CLI recusar de novo, a falha nova traz a faixa de volta.
 */
export function terminalResumeActionPatch(action: TerminalResumeActionId): {
  resumeChoice?: AgentResumeChoice
  resumeFailure?: AgentResumeFailure
} {
  if (action === 'retry') return { resumeFailure: undefined, resumeChoice: undefined }
  if (action === 'dismiss') return { resumeFailure: undefined }
  return { resumeChoice: action }
}

/**
 * Se o bloco segue o plano de retomada ao (re)subir: agente restaurado de uma
 * execução anterior, ou qualquer agente que já tenha conversa associada — é o
 * caso do Reiniciar de um bloco aberto nesta execução, que também tenta
 * voltar para a mesma conversa. Um agente novo, sem conversa, sobe com a
 * instrução de largada de sempre; um shell nunca recebe `/resume`.
 */
export function followsTerminalResumePlan(input: {
  isRestoredAgent: boolean
  hasAgentCommand: boolean
  reference: AgentSessionReference | undefined
}): boolean {
  return input.hasAgentCommand && (input.isRestoredAgent || input.reference !== undefined)
}

export type TerminalRelaunch =
  /** Retomada pendente: não sobe nada; a faixa espera a escolha. */
  | { kind: 'hold'; plan: AgentResumePlan }
  | {
      kind: 'spawn'
      resumeAgentSession: boolean
      initialText: string | undefined
      initialTextIsHandoff: boolean
    }

/**
 * Com que opções o bloco (re)sobe — a mesma resposta para o Reiniciar do
 * cartão, o da gaveta e os botões da faixa. Antes, a gaveta relançava com o
 * `initialText` cru e o cartão com o texto já resolvido; agora os dois passam
 * por aqui:
 *
 * - bloco fora do plano: o texto de largada que ele já tinha (instrução
 *   padrão ou passagem);
 * - `exact`: argumentos de retomada, sem texto;
 * - `pending`: `hold` — nada sobe, nem o processo atual é derrubado;
 * - `picker`/`new`: o texto que `resolveTerminalInitialText` devolve (a fonte
 *   única): `/resume` ou o aviso ao agente de que a conversa é nova.
 */
export function resolveTerminalRelaunch(input: {
  followsResumePlan: boolean
  command?: string
  cwd?: string
  reference?: AgentSessionReference
  accountId?: string
  failure?: AgentResumeFailure
  choice?: AgentResumeChoice
  /** Texto de largada de um bloco fora do plano. */
  initialText?: string
  initialTextIsHandoff?: boolean
}): TerminalRelaunch {
  if (!input.followsResumePlan) {
    return {
      kind: 'spawn',
      resumeAgentSession: false,
      initialText: input.initialText,
      initialTextIsHandoff: Boolean(input.initialTextIsHandoff),
    }
  }

  const plan = explainAgentResume({
    command: input.command,
    cwd: input.cwd,
    reference: input.reference,
    accountId: input.accountId,
    failure: input.failure,
    choice: input.choice,
  })
  if (plan.outcome === 'pending') return { kind: 'hold', plan }

  const resumeAgentSession = plan.outcome === 'exact'
  return {
    kind: 'spawn',
    resumeAgentSession,
    // O padrão de qualidade fica de fora de propósito: no ramo de retomada
    // ele não entra nem no primeiro spawn (retomar vem antes de repetir a
    // instrução de largada que o agente já viu).
    initialText: resolveTerminalInitialText({
      isRestoredAgent: true,
      hasCommand: true,
      qualityStandardEnabled: false,
      qualityStandardPrompt: '',
      command: input.command,
      cwd: input.cwd,
      agentSession: input.reference,
      accountId: input.accountId,
      resumeAgentSession,
      resumeFailure: input.failure,
      resumeChoice: input.choice,
    }),
    // `/resume` e o aviso ao agente nunca são uma passagem de responsabilidade.
    initialTextIsHandoff: false,
  }
}

/**
 * O que gravar quando o processo principal descobre a conversa do bloco.
 *
 * `cwd` acompanha a referência: é o diretório real em que o PTY rodou — não
 * necessariamente `node.data.cwd`, que fica vazio para qualquer terminal
 * aberto sem projeto explícito ("Local (sem projeto)"): o processo cai no
 * diretório do usuário (`resolveWorkingDirectory` em
 * pty-process-manager.cjs), mas isso nunca era escrito de volta no node. Na
 * retomada, o plano compararia `node.data.cwd` (vazio) com `agentSession.cwd`
 * (preenchido) e falharia sempre — mesmo com uma sessão descoberta e válida.
 * É a mesma pasta onde o terminal já está, nunca uma pasta nova (achado de
 * 28/08/2026).
 *
 * Quando o ID muda (a pessoa escolheu outra conversa na lista, ou abriu uma
 * nova), a anterior vira `previousAgentSession` em vez de sumir: o registro
 * explica de onde o bloco veio. A escolha transitória da faixa perde o
 * sentido e sai. Mesmo ID não mexe na escolha nem na falha: uma descoberta
 * logo depois de um spawn que falhou pode apontar para a mesma conversa, e
 * isso não prova que ela voltou a existir.
 *
 * `current.agentSession` vem do canvas salvo e não é confiável: só uma
 * referência legível conta como conversa anterior. `null` ou lixo gravado não
 * é conversa nenhuma para guardar — e ler `sessionId` de `null` derrubava o
 * `setNodes` na primeira descoberta.
 */
export function agentSessionPatch(
  current: { agentSession?: unknown },
  reference: AgentSessionReference,
  now: number,
): {
  agentSession: AgentSessionReference
  cwd: string
  previousAgentSession?: PreviousAgentSession
  resumeChoice?: AgentResumeChoice
} {
  const previous = isAgentSessionReference(current.agentSession) ? current.agentSession : undefined
  const replaced = previous !== undefined && previous.sessionId !== reference.sessionId
  return {
    agentSession: reference,
    cwd: reference.cwd,
    ...(replaced
      ? { previousAgentSession: { reference: previous, replacedAt: now }, resumeChoice: undefined }
      : {}),
  }
}

/**
 * O que gravar quando a CLI recusa a retomada (conversa inexistente, login).
 * A falha fica presa ao ID da conversa TENTADA (`attempted`, que o store
 * informa; na falta dele, a associada): se a conversa associada mudar depois,
 * a falha antiga deixa de valer sozinha, sem ser apagada. A escolha da faixa
 * sai para a falha nova ser vista e decidida. Sem conversa associada não há o
 * que registrar (`null`).
 */
export function resumeFailurePatch(
  current: { agentSession?: AgentSessionReference },
  reason: AgentResumeFailure['reason'],
  now: number,
  attempted?: AgentSessionReference,
): { resumeFailure: AgentResumeFailure; resumeChoice?: AgentResumeChoice } | null {
  if (!current.agentSession) return null
  const sessionId = attempted?.sessionId ?? current.agentSession.sessionId
  return {
    resumeFailure: { sessionId, reason, at: now },
    resumeChoice: undefined,
  }
}
