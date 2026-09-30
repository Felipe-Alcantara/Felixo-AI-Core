import type { AgentId } from './agent-launch-options'
import {
  AGENT_RESUME_METHODS,
  isCliVersion,
  resolveAgentResumeCapability,
  resumeProvenSince,
  type AgentResumeCapability,
  type AgentResumeMethod,
} from './agent-resume-capability'

export type AgentSessionReference = {
  version: 1
  provider: AgentId
  sessionId: string
  cwd: string
  capturedAt: number
  /**
   * Conta própria em que a conversa nasceu, carimbada pelo processo
   * principal. Ausente = login do sistema (e toda referência gravada antes
   * deste campo existir).
   */
  accountId?: string
  /**
   * Versão da CLI no processo que gravou a conversa, carimbada pelo processo
   * principal. Ausente = não se sabia (a versão não respondeu a tempo, a
   * instância roteirizada, ou uma referência gravada antes deste campo).
   */
  cliVersion?: string
  /**
   * O método de retomada que valia para `cliVersion` quando a conversa foi
   * gravada (ver `withResumeMethod`). É registro, não decisão: a retomada
   * sempre recalcula o método pela versão instalada AGORA, então uma
   * atualização da CLI nunca herda um método que não vale mais — e a
   * referência continua gravada.
   */
  resumeMethod?: AgentResumeMethod
}

/**
 * Por que a retomada vai (ou não vai) acontecer. `expired` e `auth` são os
 * únicos que vêm de depois do spawn (o que a CLI respondeu da última vez); o
 * resto é decidido antes, pela referência gravada — conta errada e conversa
 * inexistente produzem o MESMO texto na CLI do Claude e do Codex, então só a
 * referência distingue as duas.
 */
export type AgentResumeReason =
  /** Mesma conversa, pelo ID: mesmo provider, pasta e conta. */
  | 'exact'
  /** Nenhuma conversa associada ao bloco: a CLI mostra a lista (`/resume`). */
  | 'fallback'
  /**
   * A versão instalada da CLI não retoma pelo ID (Gemini anterior à 0.57, ou
   * versão que o app não conseguiu ler): ver `agent-resume-capability.ts`.
   */
  | 'unsupported'
  | 'cwd-mismatch'
  /** Bloco sem pasta de trabalho: não dá para confirmar que é a mesma conversa. */
  | 'missing-cwd'
  | 'account-mismatch'
  | 'provider-mismatch'
  | 'invalid-reference'
  /** Da última vez a CLI respondeu que essa conversa não existe. */
  | 'expired'
  /** Da última vez a CLI pediu login ao retomar. */
  | 'auth'

/**
 * O que o spawn faz:
 * - `exact`: sobe com os argumentos de retomada, sem texto;
 * - `picker`: digita `/resume` e a CLI mostra a lista para a pessoa escolher;
 * - `new`: conversa nova (o agente recebe um aviso de que não é a anterior);
 * - `pending`: não sobe ainda — a referência existe mas não é exata, e a
 *   pessoa escolhe entre a lista e uma conversa nova. Nada é apagado.
 */
export type AgentResumeOutcome = 'exact' | 'picker' | 'new' | 'pending'

export type AgentResumeChoice = 'picker' | 'new'

/** O que a CLI respondeu na última tentativa de retomar ESTA conversa. */
export type AgentResumeFailure = {
  sessionId: string
  reason: 'expired' | 'auth'
  at: number
}

export type AgentResumePlan = {
  outcome: AgentResumeOutcome
  /** O motivo principal, o que a interface mostra primeiro. */
  reason: AgentResumeReason
  /** Todos os motivos que se aplicam, o principal primeiro (ex.: pasta E conta). */
  reasons: AgentResumeReason[]
  /** O que a CLI do bloco sabe fazer na versão instalada agora. */
  capability: AgentResumeCapability
  /**
   * A CLI mudou de versão desde que a conversa foi gravada. Não muda o
   * desfecho: o método já foi recalculado pela versão nova (`capability`), e
   * a interface só mostra a troca.
   */
  versionChange?: { from: string; to: string }
}

const SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,255}$/

export function isAgentSessionReference(value: unknown): value is AgentSessionReference {
  if (!value || typeof value !== 'object') return false
  const reference = value as Partial<AgentSessionReference>
  return (
    reference.version === 1 &&
    (reference.provider === 'codex' ||
      reference.provider === 'claude' ||
      reference.provider === 'gemini') &&
    typeof reference.sessionId === 'string' &&
    SESSION_ID_PATTERN.test(reference.sessionId) &&
    typeof reference.cwd === 'string' &&
    reference.cwd.trim().length > 0 &&
    typeof reference.capturedAt === 'number' &&
    Number.isFinite(reference.capturedAt) &&
    (reference.accountId === undefined ||
      (typeof reference.accountId === 'string' && reference.accountId.trim().length > 0)) &&
    (reference.cliVersion === undefined || isCliVersion(reference.cliVersion)) &&
    (reference.resumeMethod === undefined || AGENT_RESUME_METHODS.includes(reference.resumeMethod))
  )
}

/**
 * Carimba na referência o método que vale para a versão com que ela foi
 * gravada. É o que o canvas guarda quando o processo principal reporta a
 * conversa (`agentSessionPatch`); sem versão, fica o método que a CLI
 * garante sem ela.
 */
export function withResumeMethod(reference: AgentSessionReference): AgentSessionReference {
  const { method } = resolveAgentResumeCapability({ provider: reference.provider, version: reference.cliVersion })
  return reference.resumeMethod === method ? reference : { ...reference, resumeMethod: method }
}

export function isAgentResumeFailure(value: unknown): value is AgentResumeFailure {
  if (!value || typeof value !== 'object') return false
  const failure = value as Partial<AgentResumeFailure>
  return (
    typeof failure.sessionId === 'string' &&
    (failure.reason === 'expired' || failure.reason === 'auth') &&
    typeof failure.at === 'number' &&
    Number.isFinite(failure.at)
  )
}

/** Conta do bloco comparada com a da conversa; vazio e ausente são o login do sistema. */
function isSameAccount(reference: AgentSessionReference, accountId: string | undefined): boolean {
  return (reference.accountId?.trim() ?? '') === (accountId?.trim() ?? '')
}

/**
 * Decide a retomada de um bloco de agente e diz por quê. É a fonte única: o
 * `canResumeAgentSession`, o texto que o agente recebe, a faixa do cartão e a
 * tabela do guia do usuário derivam daqui.
 *
 * - Sem referência: `picker` com `fallback` — a lista da CLI é a escolha.
 * - Referência que não é exata (pasta, conta, provider, versão da CLI que não
 *   retoma pelo ID, ilegível, ou uma falha já registrada para ELA): `pending`
 *   até a pessoa escolher; com `choice`, vira `picker` ou `new`. O registro
 *   nunca é apagado aqui.
 * - Tudo coincidindo: `exact`.
 *
 * O método sai da versão instalada AGORA (`cliVersion`, lida pelo processo
 * principal), nunca do que foi gravado com a conversa: uma atualização da CLI
 * recalcula a capacidade e mantém a conversa. Sem versão, Claude e Codex
 * seguem pelo ID (o `--help` deles documenta isso) e o Gemini não (só foi
 * provado da 0.57 em diante) — ver `agent-resume-capability.ts`.
 */
export function explainAgentResume(input: {
  command: string | undefined
  cwd: string | undefined
  reference: AgentSessionReference | undefined
  accountId: string | undefined
  failure?: AgentResumeFailure
  choice?: AgentResumeChoice
  /** Versão instalada da CLI do bloco; ausente ou `null` = não se sabe. */
  cliVersion?: string | null
}): AgentResumePlan {
  const { command, cwd, reference, accountId, failure, choice } = input
  const capability = resolveAgentResumeCapability({ provider: command, version: input.cliVersion })
  if (!reference) return { outcome: 'picker', reason: 'fallback', reasons: ['fallback'], capability }

  const reasons: AgentResumeReason[] = []
  let versionChange: AgentResumePlan['versionChange']
  if (!isAgentSessionReference(reference)) {
    reasons.push('invalid-reference')
  } else {
    if (command !== reference.provider) reasons.push('provider-mismatch')
    if (isAgentResumeFailure(failure) && failure.sessionId === reference.sessionId) {
      reasons.push(failure.reason)
    }
    // A conversa de outro provider já é o motivo; a versão da CLI do bloco
    // não diria nada sobre ela.
    if (command === reference.provider && capability.method !== 'exact-id') reasons.push('unsupported')
    if (!cwd?.trim()) reasons.push('missing-cwd')
    else if (cwd !== reference.cwd) reasons.push('cwd-mismatch')
    if (!isSameAccount(reference, accountId)) reasons.push('account-mismatch')
    if (
      command === reference.provider &&
      reference.cliVersion &&
      capability.version &&
      reference.cliVersion !== capability.version
    ) {
      versionChange = { from: reference.cliVersion, to: capability.version }
    }
  }

  const change = versionChange ? { versionChange } : {}
  if (reasons.length === 0) return { outcome: 'exact', reason: 'exact', reasons: ['exact'], capability, ...change }
  return { outcome: choice ?? 'pending', reason: reasons[0], reasons, capability, ...change }
}

/**
 * Retomar pelo ID só vale no mesmo provedor, diretório e conta, sem falha
 * registrada para a conversa. A conta é obrigatória no parâmetro (pode ser
 * `undefined`, o login do sistema) para nenhum chamador esquecer de passá-la:
 * retomar em outra conta abriria o histórico de uma conta na cobrança de
 * outra. Referência antiga, sem conta, só vale em bloco sem conta.
 */
export function canResumeAgentSession(
  command: string | undefined,
  cwd: string | undefined,
  reference: AgentSessionReference | undefined,
  accountId: string | undefined,
  failure?: AgentResumeFailure,
  cliVersion?: string | null,
): boolean {
  return explainAgentResume({ command, cwd, reference, accountId, failure, cliVersion }).outcome === 'exact'
}

/**
 * Builds the provider's resume-by-ID invocation, without a prompt.
 *
 * Só sai argumento quando o plano é `exact` para a versão instalada
 * (`cliVersion`): Codex `resume …args <id>`, Claude `--resume <id> …args` e
 * Gemini `--resume <id> …args` (da 0.57 em diante). O formato é o que
 * `resolveResumeTarget`, no processo principal, reconhece. Fora disso o
 * chamador recebe `undefined` e segue o `picker`/`new`/`pending` do plano.
 */
export function buildAgentResumeArgs(
  command: string | undefined,
  args: readonly string[] = [],
  cwd: string | undefined,
  reference: AgentSessionReference | undefined,
  accountId: string | undefined,
  failure?: AgentResumeFailure,
  cliVersion?: string | null,
): string[] | undefined {
  if (!reference || !canResumeAgentSession(command, cwd, reference, accountId, failure, cliVersion)) {
    return undefined
  }

  switch (command) {
    case 'codex':
      return ['resume', ...args, reference.sessionId]
    case 'claude':
    case 'gemini':
      return ['--resume', reference.sessionId, ...args]
    default:
      return undefined
  }
}

const PROVIDER_LABELS: Record<AgentId, string> = {
  claude: 'Claude Code',
  codex: 'Codex',
  gemini: 'Gemini CLI',
  openia: 'Openia',
}

function providerLabel(provider: string | undefined): string {
  return provider && provider in PROVIDER_LABELS ? PROVIDER_LABELS[provider as AgentId] : provider || 'outro agente'
}

/** O limite de cada método que não é pelo ID, completando "O Gemini CLI 0.56.2 …". */
const METHOD_LIMITS: Record<Exclude<AgentResumeMethod, 'exact-id'>, string> = {
  'numeric-index':
    'só garante retomar a conversa mais recente ou pela posição na lista, e a posição muda quando surgem conversas novas',
  'latest-only': 'só garante retomar a conversa mais recente da pasta, que pode não ser esta',
  'interactive-only': 'só retoma escolhendo na lista dentro da própria CLI',
  unsupported: 'não tem um jeito conhecido de voltar a uma conversa',
}

/** Por que a versão instalada não retoma pelo ID, sem ID nenhum. */
function unsupportedSentence(capability: AgentResumeCapability): string {
  const label = providerLabel(capability.provider)
  const limit = capability.method === 'exact-id' ? METHOD_LIMITS.unsupported : METHOD_LIMITS[capability.method]
  const since = resumeProvenSince(capability.provider)
  if (capability.basis === 'unknown-version' && since) {
    return `O app não conseguiu ler a versão do ${label} instalado. A retomada pelo ID só foi provada a partir da ${since}, e sem a versão o ${label} ${limit}.`
  }
  if (capability.basis === 'below-proven' && since) {
    return `O ${label} ${capability.version} ${limit}; a retomada pelo ID só foi provada a partir da ${since}. Atualize o ${label} para o app voltar direto à conversa.`
  }
  return `O ${label} ${limit}; o app não adivinha.`
}

type ResumeTextContext = { reference?: AgentSessionReference; cwd?: string; command?: string }

/**
 * O que a pessoa lê sobre cada motivo. Nunca leva o ID da conversa nem o da
 * conta: para agir basta saber provider, pasta e se é a conta certa, e o ID
 * completo continua no painel de detalhes para quem precisar.
 */
function reasonSentence(reason: AgentResumeReason, plan: AgentResumePlan, context: ResumeTextContext): string {
  const { reference, cwd, command } = context
  switch (reason) {
    case 'exact':
      return 'É a mesma conversa, na mesma pasta e na mesma conta.'
    case 'fallback':
      return 'Este bloco não guardou qual conversa estava aberta, então a CLI mostra a lista de conversas desta pasta para você escolher (/resume).'
    case 'unsupported':
      return unsupportedSentence(plan.capability)
    case 'cwd-mismatch':
      return `A conversa foi aberta em ${reference?.cwd ?? 'outra pasta'}, e este bloco está em ${cwd ?? 'outra pasta'}. A lista da CLI filtra por pasta, então ela pode não aparecer aqui.`
    case 'missing-cwd':
      return 'Este bloco não tem pasta de trabalho definida, então não dá para confirmar que é a mesma conversa.'
    case 'account-mismatch':
      return 'A conversa é de outra conta: retomar aqui abriria o histórico de uma conta na cobrança de outra. Volte o bloco para a conta original para retomá-la.'
    case 'provider-mismatch':
      return `A conversa foi aberta no ${providerLabel(reference?.provider)}, e este bloco usa ${providerLabel(command)}.`
    case 'invalid-reference':
      return 'O registro salvo da conversa não está num formato que o app reconheça. Nada foi apagado.'
    case 'expired':
      return 'Na última tentativa, a CLI respondeu que essa conversa não existe mais (apagada, arquivada, ou de outra pasta ou conta). O app não repete a mesma retomada.'
    case 'auth':
      // Não sugere trocar a conta do bloco: a conversa é da conta em que nasceu,
      // e em outra conta a retomada exata passa a ser proibida (outra faixa).
      return 'Na última tentativa, a CLI pediu login antes de retomar. Faça login na CLI desta conta e tente retomar de novo; o registro da conversa continua salvo.'
  }
}

const REASON_TITLES: Record<AgentResumeReason, string> = {
  exact: 'Retomando a conversa anterior',
  fallback: 'Sem conversa associada',
  unsupported: 'Retomada pelo ID indisponível nesta versão',
  'cwd-mismatch': 'A conversa nasceu em outra pasta',
  'missing-cwd': 'Bloco sem pasta de trabalho',
  'account-mismatch': 'A conversa é de outra conta',
  'provider-mismatch': 'A conversa é de outro agente',
  'invalid-reference': 'Registro da conversa ilegível',
  expired: 'A CLI não encontrou a conversa',
  auth: 'A CLI pediu login ao retomar',
}

/**
 * Título e explicação do plano, para a pessoa (faixa do cartão, gaveta,
 * detalhes). O primeiro motivo vira o título; todos os motivos entram no
 * texto, para pasta e conta divergentes aparecerem juntas.
 */
export function describeAgentResumeForPerson(
  plan: AgentResumePlan,
  context: ResumeTextContext,
): { title: string; detail: string } {
  const title =
    plan.reason === 'unsupported'
      ? `${REASON_TITLES.unsupported} do ${providerLabel(plan.capability.provider)}`
      : REASON_TITLES[plan.reason]
  return {
    title,
    detail: plan.reasons.map((reason) => reasonSentence(reason, plan, context)).join(' '),
  }
}

const METHOD_LABELS: Record<AgentResumeMethod, string> = {
  'exact-id': 'pelo ID da conversa',
  'numeric-index': 'só pela posição na lista',
  'latest-only': 'só a mais recente',
  'interactive-only': 'só pela lista da CLI',
  unsupported: 'sem retomada',
}

/**
 * Uma linha para os detalhes do bloco: como a CLI instalada retoma e, quando
 * a versão mudou desde a gravação, de qual para qual. Ex.: "Gemini CLI 0.57.0:
 * pelo ID da conversa (gravada na 0.56.2)".
 */
export function describeAgentResumeCapability(plan: AgentResumePlan): string {
  const { capability, versionChange } = plan
  const version = capability.version ?? 'versão desconhecida'
  const recorded = versionChange ? ` (gravada na ${versionChange.from})` : ''
  return `${providerLabel(capability.provider)} ${version}: ${METHOD_LABELS[capability.method]}${recorded}`
}

/**
 * O alvo de uma retomada, para mostrar antes do spawn: provider, pasta, quando
 * a conversa foi vista e de que conta — sem ID nenhum.
 */
export function describeAgentResumeTarget(reference: AgentSessionReference): string {
  const when = new Date(reference.capturedAt).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
  const account = reference.accountId ? 'conta própria' : 'login do sistema'
  return `${providerLabel(reference.provider)} · ${reference.cwd} · conversa de ${when} · ${account}`
}

/**
 * Texto para o AGENTE de uma conversa que não é a anterior (desfecho `new`).
 * Vai como contexto, não para a pessoa: ela vê o motivo na faixa do cartão.
 * Diz ao agente para não presumir o histórico, sem ID nenhum.
 */
export function buildResumeFallbackNotice(plan: AgentResumePlan, context: ResumeTextContext): string {
  return [
    'A conversa anterior deste bloco não foi retomada; esta é uma conversa nova.',
    `Motivo: ${plan.reasons.map((reason) => reasonSentence(reason, plan, context)).join(' ')}`,
    'Não presuma o que foi dito na conversa anterior: peça à pessoa o contexto de que precisar.',
  ].join('\n')
}
