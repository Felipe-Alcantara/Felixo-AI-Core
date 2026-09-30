import type { AgentId } from './agent-launch-options'

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
  /** O provider não garante retomar por ID na versão suportada (Gemini). */
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
      (typeof reference.accountId === 'string' && reference.accountId.trim().length > 0))
  )
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
 * - Referência que não é exata (pasta, conta, provider, Gemini, ilegível, ou
 *   uma falha já registrada para ELA): `pending` até a pessoa escolher; com
 *   `choice`, vira `picker` ou `new`. O registro nunca é apagado aqui.
 * - Tudo coincidindo: `exact`.
 *
 * Gemini: o help público do Gemini CLI 0.57 só garante `--resume latest` ou um
 * índice da lista, e o índice muda quando surgem conversas novas. O bundle
 * dessa versão aceita UUID na prática, mas o app não se apoia em
 * comportamento não documentado — e `latest` abriria em silêncio uma
 * conversa nova quando a pasta não tem nenhuma retomável.
 */
export function explainAgentResume(input: {
  command: string | undefined
  cwd: string | undefined
  reference: AgentSessionReference | undefined
  accountId: string | undefined
  failure?: AgentResumeFailure
  choice?: AgentResumeChoice
}): AgentResumePlan {
  const { command, cwd, reference, accountId, failure, choice } = input
  if (!reference) return { outcome: 'picker', reason: 'fallback', reasons: ['fallback'] }

  const reasons: AgentResumeReason[] = []
  if (!isAgentSessionReference(reference)) {
    reasons.push('invalid-reference')
  } else {
    if (command !== reference.provider) reasons.push('provider-mismatch')
    if (isAgentResumeFailure(failure) && failure.sessionId === reference.sessionId) {
      reasons.push(failure.reason)
    }
    if (command === 'gemini') reasons.push('unsupported')
    if (!cwd?.trim()) reasons.push('missing-cwd')
    else if (cwd !== reference.cwd) reasons.push('cwd-mismatch')
    if (!isSameAccount(reference, accountId)) reasons.push('account-mismatch')
  }

  if (reasons.length === 0) return { outcome: 'exact', reason: 'exact', reasons: ['exact'] }
  return { outcome: choice ?? 'pending', reason: reasons[0], reasons }
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
): boolean {
  return explainAgentResume({ command, cwd, reference, accountId, failure }).outcome === 'exact'
}

/**
 * Builds the provider's documented resume invocation, without a prompt.
 *
 * Codex and Claude accept the persisted conversation ID. Gemini is never
 * resumed by ID (see `explainAgentResume`), so the caller gets `undefined`
 * and uses the plan's `picker`/`new`/`pending` path instead.
 */
export function buildAgentResumeArgs(
  command: string | undefined,
  args: readonly string[] = [],
  cwd: string | undefined,
  reference: AgentSessionReference | undefined,
  accountId: string | undefined,
  failure?: AgentResumeFailure,
): string[] | undefined {
  if (!reference || !canResumeAgentSession(command, cwd, reference, accountId, failure)) return undefined

  switch (command) {
    case 'codex':
      return ['resume', ...args, reference.sessionId]
    case 'claude':
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

/**
 * O que a pessoa lê sobre cada motivo. Nunca leva o ID da conversa nem o da
 * conta: para agir basta saber provider, pasta e se é a conta certa, e o ID
 * completo continua no painel de detalhes para quem precisar.
 */
function reasonSentence(
  reason: AgentResumeReason,
  context: { reference?: AgentSessionReference; cwd?: string; command?: string },
): string {
  const { reference, cwd, command } = context
  switch (reason) {
    case 'exact':
      return 'É a mesma conversa, na mesma pasta e na mesma conta.'
    case 'fallback':
      return 'Este bloco não guardou qual conversa estava aberta, então a CLI mostra a lista de conversas desta pasta para você escolher (/resume).'
    case 'unsupported':
      return 'O Gemini CLI só garante retomar a conversa mais recente ou pela posição na lista, e a posição muda quando surgem conversas novas; o app não adivinha.'
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
  unsupported: 'Retomada automática indisponível no Gemini',
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
  context: { reference?: AgentSessionReference; cwd?: string; command?: string },
): { title: string; detail: string } {
  return {
    title: REASON_TITLES[plan.reason],
    detail: plan.reasons.map((reason) => reasonSentence(reason, context)).join(' '),
  }
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
export function buildResumeFallbackNotice(
  plan: AgentResumePlan,
  context: { reference?: AgentSessionReference; cwd?: string; command?: string },
): string {
  return [
    'A conversa anterior deste bloco não foi retomada; esta é uma conversa nova.',
    `Motivo: ${plan.reasons.map((reason) => reasonSentence(reason, context)).join(' ')}`,
    'Não presuma o que foi dito na conversa anterior: peça à pessoa o contexto de que precisar.',
  ].join('\n')
}
