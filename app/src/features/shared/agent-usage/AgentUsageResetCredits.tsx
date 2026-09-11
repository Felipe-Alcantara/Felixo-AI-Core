import { CheckCircle2, Clock3, Gift, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import {
  formatAgentUsageDate,
  formatAgentUsageResetCreditStatus,
  formatAgentUsageResetCreditType,
  getAgentUsageResetCredits,
} from './agent-usage'
import type { AgentUsageResetCredit, AgentUsageSample } from './agent-usage'

type ResetActionResult = {
  ok: boolean
  message?: string
}

type AgentUsageResetCreditsViewProps = {
  sample: AgentUsageSample | null
  /** Exibe o estado explícito mesmo quando esta conta ainda não tem a leitura. */
  showUnavailable?: boolean
  /** Só fica true quando os detalhes vieram da leitura mais recente da conta. */
  canUse?: boolean
  onUse?: (creditId: string) => Promise<ResetActionResult>
}

/**
 * Cartão por conta para créditos de reset do Codex.
 *
 * A contagem vem do backend e os cartões exibem cada detalhe que a CLI
 * publicou. O botão nunca aparece como uma ação silenciosa: além de exigir
 * uma leitura atual, ele abre confirmação nativa antes do IPC de consumo.
 */
export function AgentUsageResetCreditsView({
  sample,
  showUnavailable = false,
  canUse = false,
  onUse,
}: AgentUsageResetCreditsViewProps) {
  const resetCredits = getAgentUsageResetCredits(sample)

  if (!resetCredits) {
    return showUnavailable ? <UnavailableResetCreditsCard /> : null
  }

  return (
    <section
      className="mt-3 rounded-lg border border-cyan-300/15 bg-cyan-300/[0.04] p-2.5"
      aria-label="Resets bancados desta conta"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <span className="mt-0.5 rounded-md bg-cyan-300/10 p-1.5 text-cyan-200">
            <Gift size={13} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h5 className="text-[11px] font-medium text-zinc-200">Resets bancados</h5>
            <p className="mt-0.5 text-[10px] leading-snug text-zinc-500">
              Créditos desta conta que podem zerar a janela antes do reset automático.
            </p>
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2 py-1 text-[10px] font-medium text-cyan-100">
          {resetCredits.availableCount} disponível
          {resetCredits.availableCount === 1 ? '' : 'is'}
        </span>
      </div>

      {resetCredits.credits.length === 0 ? (
        <p className="mt-2 rounded-md border border-white/[0.06] bg-black/10 px-2 py-1.5 text-[10px] leading-snug text-zinc-500">
          {resetCredits.availableCount > 0
            ? 'A CLI informou a quantidade, mas não trouxe os detalhes individuais destes créditos.'
            : 'Nenhum reset bancado disponível para esta conta.'}
        </p>
      ) : (
        <div className="mt-2 space-y-2">
          {resetCredits.credits.map((credit, index) => (
            <ResetCreditCard
              key={credit.id ?? `${credit.title ?? 'reset'}-${index}`}
              credit={credit}
              canUse={canUse}
              onUse={onUse}
            />
          ))}
        </div>
      )}

      {!canUse && resetCredits.availableCount > 0 && (
        <p className="mt-2 text-[10px] leading-snug text-amber-300/80">
          Atualize os limites para habilitar o uso seguro dos créditos desta conta.
        </p>
      )}
    </section>
  )
}

function UnavailableResetCreditsCard() {
  return (
    <section
      className="mt-3 rounded-lg border border-white/[0.08] bg-white/[0.02] p-2.5"
      aria-label="Resets bancados desta conta"
    >
      <div className="flex items-center gap-2">
        <span className="rounded-md bg-zinc-400/10 p-1.5 text-zinc-400">
          <Gift size={13} aria-hidden="true" />
        </span>
        <div>
          <h5 className="text-[11px] font-medium text-zinc-300">Resets bancados</h5>
          <p className="mt-0.5 text-[10px] text-zinc-600">Indisponível nesta coleta</p>
        </div>
      </div>
      <p className="mt-2 text-[10px] leading-snug text-zinc-500">
        A CLI ainda não informou a quantidade ou os detalhes dos créditos desta conta.
        Atualize os limites depois de confirmar o login.
      </p>
    </section>
  )
}

function ResetCreditCard({
  credit,
  canUse,
  onUse,
}: {
  credit: AgentUsageResetCredit
  canUse: boolean
  onUse?: (creditId: string) => Promise<ResetActionResult>
}) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const isAvailable = credit.status === 'available'
  const hasAction = Boolean(isAvailable && canUse && onUse && credit.id)

  async function handleUse() {
    if (!hasAction || !onUse || !credit.id || busy) {
      return
    }

    const title = credit.title ?? 'Reset bancado'
    const validity = credit.expiresAt
      ? `Validade: até ${formatAgentUsageDate(credit.expiresAt)}`
      : 'Validade: não informada pela CLI'
    const confirmed = window.confirm(
      `Usar "${title}" agora?\n\n${validity}.\nEsta ação pode zerar imediatamente a janela de uso desta conta e não pode ser desfeita.`,
    )

    if (!confirmed) {
      return
    }

    setBusy(true)
    setMessage(null)
    try {
      const result = await onUse(credit.id)
      setMessage(
        result.ok
          ? result.message ?? 'Reset aplicado com sucesso.'
          : result.message ?? 'Não foi possível usar este reset.',
      )
    } catch {
      setMessage('Não foi possível comunicar com o processo principal.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className="rounded-md border border-white/[0.07] bg-black/15 px-2.5 py-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            {isAvailable ? (
              <CheckCircle2 size={12} className="shrink-0 text-theme-success" aria-hidden="true" />
            ) : (
              <Clock3 size={12} className="shrink-0 text-zinc-500" aria-hidden="true" />
            )}
            <h6 className="truncate text-[11px] font-medium text-zinc-200">
              {credit.title ?? 'Reset bancado'}
            </h6>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-zinc-500">
            <span>{formatAgentUsageResetCreditStatus(credit.status)}</span>
            <span>{formatAgentUsageResetCreditType(credit.resetType)}</span>
          </div>
        </div>

        {hasAction && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleUse()}
            className="felixo-btn flex shrink-0 items-center gap-1 rounded-md bg-cyan-300/15 px-2 py-1 text-[10px] font-medium text-cyan-100 ring-1 ring-cyan-300/20 hover:bg-cyan-300/25 disabled:cursor-wait disabled:opacity-50"
          >
            <RotateCcw size={11} className={busy ? 'animate-spin' : undefined} aria-hidden="true" />
            {busy ? 'Usando…' : 'Usar reset'}
          </button>
        )}
      </div>

      {credit.description && (
        <p className="mt-1.5 text-[10px] leading-snug text-zinc-400">{credit.description}</p>
      )}

      <div className="mt-1.5 grid gap-x-3 gap-y-0.5 text-[10px] text-zinc-600 sm:grid-cols-2">
        <span>Concedido: {formatAgentUsageDate(credit.grantedAt)}</span>
        <span>
          Validade:{' '}
          {credit.expiresAt
            ? `até ${formatAgentUsageDate(credit.expiresAt)}`
            : 'não informada'}
        </span>
      </div>

      {isAvailable && !hasAction && canUse && (
        <p className="mt-1 text-[10px] text-zinc-600">
          A CLI não forneceu um identificador utilizável para este crédito.
        </p>
      )}
      {message && (
        <p className="mt-1.5 text-[10px] text-amber-200" role="status">
          {message}
        </p>
      )}
    </article>
  )
}
