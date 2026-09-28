/**
 * Continuação confirmada da cadeia: do "Abrir bloco novo" ao bloco criado
 * (§9.1). Separado do hook para a ordem dos passos ser testada sem React:
 *
 * 1. o histórico é redigido no main ANTES de qualquer confirmação — se isso
 *    falhar, nada é confirmado e nada é enviado;
 * 2. um bloco que já nasceu desta proposta é reaproveitado (clique duplo);
 * 3. `confirm` no main devolve o ticket de uso único;
 * 4. o bloco novo nasce com a conta de destino, modo `chain`, ticket e origem;
 * 5. o bloco antigo só ganha a marca "continuado em": o processo dele não é
 *    tocado, não recebe texto e não é encerrado (decisão 6).
 */
import type {
  AccountChainBridge,
  AccountSwitchProposal,
} from '../../shared/types/account-chain'
import type { NewTerminalOptions } from './new-terminal-options'
import { confirmErrorText, formatClockTime, type TimeOptions } from './account-chain-view'
import { buildContinuationLaunch, countLines, type ContinuationSource } from './account-switch-dialog'
import { buildTerminalHandoffPrompt } from './terminal-handoff'

export type RedactedTranscript = { text: string; chars: number; lines: number }

export type TranscriptPreparation =
  | ({ ok: true } & RedactedTranscript)
  | { ok: false; message: string }

const REDACTION_FAILED =
  'Não foi possível mascarar os segredos do histórico; nada será enviado ao bloco novo.'

/** Redige o histórico no main (`redactSecrets`). Sem a ponte, não envia nada. */
export async function prepareRedactedTranscript(
  bridge: AccountChainBridge | null,
  rawText: string,
): Promise<TranscriptPreparation> {
  if (!bridge) return { ok: false, message: REDACTION_FAILED }
  try {
    const result = await bridge.redactTranscript({ text: rawText })
    if (!result.ok) return { ok: false, message: result.message ?? REDACTION_FAILED }
    return { ok: true, text: result.text, chars: result.chars, lines: countLines(result.text) }
  } catch {
    return { ok: false, message: REDACTION_FAILED }
  }
}

export type ContinuationSourceNode = ContinuationSource & { cwd?: string }

export type ContinuationNodeOptions = NewTerminalOptions & {
  handoffText: string
  /** Desmarcado: o contexto vai sem submissão, esperando a pessoa. */
  handoffAutoSubmit: boolean
}

export type ContinuationEnv = {
  bridge: AccountChainBridge | null
  /** Bloco já criado por esta troca (idempotência no renderer). */
  findNodeByOrigin: (switchEventId: string) => string | null
  getSource: (nodeId: string) => ContinuationSourceNode | null
  createNode: (sourceId: string, options: ContinuationNodeOptions) => string | null
  /** Marca "continuado em" no bloco antigo. Nunca escreve no processo dele. */
  markSource: (sourceId: string, successorId: string) => void
  now: () => Date
  timeOptions?: TimeOptions
}

export type ContinuationRequest = {
  proposal: AccountSwitchProposal
  sourceNodeId: string
  destinationAccountId: string
  autoSubmit: boolean
  acknowledgeSourceActive: boolean
  transcript: RedactedTranscript
}

export type ContinuationOutcome =
  | { ok: true; nodeId: string; reused: boolean }
  | {
      ok: false
      code: string | null
      message: string
      /** Proposta recalculada pelo main (SUPERSEDED/NOT_ELIGIBLE). */
      proposal?: AccountSwitchProposal
    }

export async function performContinuation(
  request: ContinuationRequest,
  env: ContinuationEnv,
): Promise<ContinuationOutcome> {
  const { proposal } = request
  const existing = env.findNodeByOrigin(proposal.id)
  if (existing) return { ok: true, nodeId: existing, reused: true }

  const source = env.getSource(request.sourceNodeId)
  if (!source) {
    return { ok: false, code: null, message: 'O terminal de origem não está mais disponível.' }
  }
  if (!env.bridge) {
    return { ok: false, code: null, message: 'A cadeia de contas não está disponível nesta versão do app.' }
  }

  let confirmation
  try {
    confirmation = await env.bridge.confirm({
      proposalId: proposal.id,
      destinationAccountId: request.destinationAccountId,
      transcriptChars: request.transcript.chars,
      ...(request.acknowledgeSourceActive ? { acknowledgeSourceActive: true } : {}),
    })
  } catch {
    return { ok: false, code: null, message: 'Não foi possível falar com o processo principal. Nada foi aberto.' }
  }
  if (!confirmation.ok) {
    return {
      ok: false,
      code: confirmation.code ?? null,
      message: confirmErrorText(confirmation.code, confirmation.message),
      ...('proposal' in confirmation && confirmation.proposal ? { proposal: confirmation.proposal } : {}),
    }
  }

  const destination = confirmation.destination
  const launch = buildContinuationLaunch({
    source,
    sourceProviderId: proposal.from.providerId,
    destinationProviderId: destination.providerId,
    destinationLabel: destination.label,
  })
  if (!launch) {
    return { ok: false, code: null, message: 'O agente do provedor de destino não é conhecido por este app.' }
  }

  const handoffText = buildTerminalHandoffPrompt({
    sourceLabel: source.label,
    sourceCommand: source.command,
    cwd: source.cwd,
    targetLabel: launch.label,
    transcript: request.transcript.text,
    ...(proposal.failureClass && proposal.detectedAt
      ? {
          reason: {
            failureClass: proposal.failureClass,
            detectedAtLabel: formatClockTime(proposal.detectedAt, env.timeOptions),
          },
        }
      : {}),
  })

  const nodeId = env.createNode(request.sourceNodeId, {
    command: launch.command,
    ...(launch.args ? { args: launch.args } : {}),
    ...(launch.launchMode ? { launchMode: launch.launchMode } : {}),
    ...(source.cwd ? { cwd: source.cwd } : {}),
    label: launch.label,
    accountId: destination.accountId,
    providerId: destination.providerId,
    accountMode: 'chain',
    chainTicket: confirmation.ticket,
    chainOrigin: {
      switchEventId: proposal.id,
      fromNodeId: request.sourceNodeId,
      reasonClass: proposal.failureClass ?? 'unknown',
      decidedAt: env.now().toISOString(),
    },
    handoffText,
    handoffAutoSubmit: request.autoSubmit,
  })
  if (!nodeId) {
    return { ok: false, code: null, message: 'O terminal de origem não está mais disponível.' }
  }
  env.markSource(request.sourceNodeId, nodeId)
  return { ok: true, nodeId, reused: false }
}
