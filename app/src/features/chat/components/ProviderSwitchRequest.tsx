import { useEffect, useState } from 'react'
import { ArrowRightLeft } from 'lucide-react'

import type { ProviderSwitchCardState } from '../hooks/useProviderSwitchRequests'
import {
  PROVIDER_SWITCH_COST_NOTICE,
  formatProviderLabel,
  formatProviderSwitchDeadline,
  formatProviderSwitchRoute,
  formatProviderSwitchRule,
  formatProviderSwitchStage,
} from '../services/provider-switch'
import type { ProviderSwitchRequest as ProviderSwitchRequestData } from '../types'

// O prazo mostra "em N min": meio minuto basta para o número não mentir.
const DEADLINE_REFRESH_MS = 30_000

const BUTTON_FOCUS =
  'focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-sky-400'

type ProviderSwitchRequestProps = {
  request: ProviderSwitchRequestData
  state: ProviderSwitchCardState
  now: number
  onRespond: (decisionId: string, accept: boolean) => void
  onDismiss: (decisionId: string) => void
}

/**
 * Card do chat em que a pessoa confirma ou recusa a troca de provedor de um
 * sub-agente. Não é modal e não rouba o foco: a orquestração não trava
 * enquanto ele está aberto, e sem resposta no prazo a troca conta como
 * recusa (o main decide; o card só mostra e responde).
 */
export function ProviderSwitchRequest({
  request,
  state,
  now,
  onRespond,
  onDismiss,
}: ProviderSwitchRequestProps) {
  const titleId = `provider-switch-${request.decisionId}-title`
  const descriptionId = `provider-switch-${request.decisionId}-description`
  const rule = formatProviderSwitchRule(request.rule)
  const deadline = formatProviderSwitchDeadline(request.expiresAt, now)
  const target = formatProviderLabel(request.toCliType)

  return (
    <section
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className="rounded-lg border border-(--color-warning)/40 bg-(--f-surface-panel) p-3 text-[12px] text-zinc-300"
    >
      <h2 id={titleId} className="flex items-center gap-1.5 text-[13px] font-medium text-zinc-100">
        <ArrowRightLeft size={13} aria-hidden />
        Trocar de provedor? {formatProviderSwitchRoute(request)}
      </h2>
      <div id={descriptionId} className="mt-1.5 space-y-1">
        <p>{formatProviderSwitchStage(request)}</p>
        {request.reason && <p>Motivo: {request.reason}</p>}
        {rule && <p className="text-zinc-400">Regra: {rule}</p>}
        <p className="text-zinc-400">{PROVIDER_SWITCH_COST_NOTICE}</p>
        {deadline && (
          <p className="text-zinc-400">
            Responda <time dateTime={request.expiresAt}>{deadline}</time>; sem resposta, conta
            como recusa e nada é trocado.
          </p>
        )}
      </div>
      {state.error && (
        <p role="alert" className="mt-2 rounded-sm bg-red-500/10 p-2 text-red-400">
          {state.error}
        </p>
      )}
      <div className="mt-2.5 flex flex-wrap gap-2">
        {state.stale ? (
          <button
            type="button"
            onClick={() => onDismiss(request.decisionId)}
            className={`felixo-btn rounded-sm border border-white/10 px-3 py-1.5 hover:border-white/30 ${BUTTON_FOCUS}`}
          >
            Fechar
          </button>
        ) : (
          <>
            <button
              type="button"
              disabled={state.busy}
              aria-busy={state.busy}
              onClick={() => onRespond(request.decisionId, true)}
              className={`felixo-btn rounded-sm border border-white/20 bg-white/10 px-3 py-1.5 font-medium text-zinc-100 hover:bg-white/15 disabled:opacity-50 ${BUTTON_FOCUS}`}
            >
              Trocar para {target}
            </button>
            <button
              type="button"
              disabled={state.busy}
              onClick={() => onRespond(request.decisionId, false)}
              className={`felixo-btn rounded-sm border border-white/10 px-3 py-1.5 hover:border-white/30 disabled:opacity-50 ${BUTTON_FOCUS}`}
            >
              Não trocar
            </button>
          </>
        )}
      </div>
    </section>
  )
}

type ProviderSwitchRequestListProps = {
  requests: ProviderSwitchRequestData[]
  getCardState: (decisionId: string) => ProviderSwitchCardState
  onRespond: (decisionId: string, accept: boolean) => void
  onDismiss: (decisionId: string) => void
}

/** Pilha dos cards pendentes, anunciada sem tirar o foco de onde a pessoa está. */
export function ProviderSwitchRequestList({
  requests,
  getCardState,
  onRespond,
  onDismiss,
}: ProviderSwitchRequestListProps) {
  const [now, setNow] = useState(() => Date.now())
  const hasRequests = requests.length > 0

  useEffect(() => {
    if (!hasRequests) {
      return
    }

    const intervalId = window.setInterval(() => setNow(Date.now()), DEADLINE_REFRESH_MS)
    return () => window.clearInterval(intervalId)
  }, [hasRequests])

  return (
    <div
      role="region"
      aria-label="Trocas de provedor esperando sua confirmação"
      aria-live="polite"
      className={hasRequests ? 'flex shrink-0 flex-col gap-2 px-5 py-2' : 'hidden'}
    >
      {requests.map((request) => (
        <ProviderSwitchRequest
          key={request.decisionId}
          request={request}
          state={getCardState(request.decisionId)}
          now={now}
          onRespond={onRespond}
          onDismiss={onDismiss}
        />
      ))}
    </div>
  )
}
