import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ExternalLink, Gauge, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { CanvasPanel } from './CanvasPanel'
import {
  AGENT_USAGE_STATUS_CLASSES,
  agentUsagePercent,
  formatAgentUsageDate,
  formatAgentUsageNumber,
  formatAgentUsageReset,
  formatAgentUsageStatus,
  getAccountStatus,
  getAgentUsageMeasuredAt,
  getAgentUsagePlan,
  getLastKnownAgentUsage,
  groupAgentUsageAccounts,
} from '../../../shared/agent-usage/agent-usage'
import type {
  AgentUsageAccount,
  AgentUsageDashboard,
  AgentUsageMetric,
  AgentUsageProviderGroup,
  AgentUsageSample,
} from '../../../shared/agent-usage/agent-usage'

type AgentUsagePanelProps = {
  onClose: () => void
  /** Widens the toolbar column; the panel slides over to clear it. */
  toolsMenuOpen?: boolean
}

const AUTO_REFRESH_OPTIONS = [
  { value: 0, label: 'Manual' },
  { value: 5, label: '5 min' },
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
]

/**
 * Limites e uso das CLIs, no canvas.
 *
 * Cada provider aparece com a conta logada, o quanto já foi gasto em cada
 * janela e quando ela zera. O painel abre com o que está salvo e dispara uma
 * coleta em seguida, porque consultar as CLIs leva segundos e uma tela vazia
 * nesse intervalo passa a impressão de que a função não existe.
 *
 * A regra da fonte continua valendo: número só aparece quando a CLI publicou —
 * ausência vira a limitação escrita por extenso, nunca zero.
 */
export function AgentUsagePanel({ onClose, toolsMenuOpen }: AgentUsagePanelProps) {
  const [dashboard, setDashboard] = useState<AgentUsageDashboard>({ ok: true })
  const [loading, setLoading] = useState(true)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [autoRefreshMinutes, setAutoRefreshMinutes] = useState(0)
  const [isAddingAccount, setIsAddingAccount] = useState(false)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const load = useCallback(async (refreshNow: boolean) => {
    const api = window.felixo?.agentUsage
    if (!api) {
      setLoading(false)
      setStatusMessage('Este painel só funciona no app desktop.')
      return
    }

    setLoading(true)
    setStatusMessage(null)

    try {
      const result = refreshNow ? await api.refresh() : await api.list()
      if (!mounted.current) {
        return
      }

      if (!result.ok) {
        setStatusMessage(result.message ?? 'Não foi possível carregar o painel.')
        return
      }

      setDashboard(result)
    } catch {
      if (mounted.current) {
        setStatusMessage('Não foi possível falar com o processo principal.')
      }
    } finally {
      if (mounted.current) {
        setLoading(false)
      }
    }
  }, [])

  // Primeiro o que já está salvo (instantâneo), depois a coleta real. Sem os
  // dois passos o painel fica vários segundos sem nada na tela. O timeout tira
  // o primeiro setState de dentro do corpo do efeito.
  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void load(false).then(() => load(true))
    }, 0)

    return () => window.clearTimeout(timerId)
  }, [load])

  useEffect(() => {
    if (autoRefreshMinutes <= 0) {
      return
    }

    const intervalId = window.setInterval(
      () => void load(true),
      autoRefreshMinutes * 60_000,
    )
    return () => window.clearInterval(intervalId)
  }, [autoRefreshMinutes, load])

  const groups = useMemo(
    () =>
      groupAgentUsageAccounts(
        dashboard.providers ?? [],
        dashboard.accounts ?? [],
      ),
    [dashboard.accounts, dashboard.providers],
  )

  const removeAccount = useCallback(
    async (accountId: string) => {
      const result = await window.felixo?.agentUsage?.removeAccount(accountId)
      if (result?.ok && result.dashboard) {
        setDashboard(result.dashboard)
      }
    },
    [],
  )

  const hasContent = groups.length > 0

  return (
    <CanvasPanel
      title="Limites e uso"
      icon={<Gauge size={15} />}
      onClose={onClose}
      widthClassName="w-[26rem]"
      toolsMenuOpen={toolsMenuOpen}
    >
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={loading}
          className="felixo-btn flex items-center gap-1.5 rounded-md bg-zinc-800 px-2 py-1 text-xs text-zinc-200 ring-1 ring-white/10 hover:bg-zinc-700 disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : undefined} />
          Atualizar
        </button>

        <label className="ml-auto flex items-center gap-1.5 text-[11px] text-zinc-500">
          Automático
          <select
            value={autoRefreshMinutes}
            onChange={(event) => setAutoRefreshMinutes(Number(event.target.value))}
            className="rounded border border-white/10 bg-zinc-800 px-1.5 py-1 text-[11px] text-zinc-200"
          >
            {AUTO_REFRESH_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {statusMessage && (
        <p className="mb-3 rounded-md border border-amber-300/20 bg-amber-300/10 px-2 py-1.5 text-[11px] text-amber-200">
          {statusMessage}
        </p>
      )}

      {!hasContent && (
        <p className="rounded-md border border-white/10 bg-white/[0.02] px-3 py-4 text-center text-[12px] text-zinc-500">
          {loading ? 'Consultando as CLIs instaladas…' : 'Nenhuma CLI foi detectada nesta máquina.'}
        </p>
      )}

      <div className="space-y-2.5">
        {groups.map((group) => (
          <ProviderCard
            key={group.id}
            group={group}
            onRemoveAccount={removeAccount}
          />
        ))}
      </div>

      {hasContent && (
        <AddAccountForm
          isOpen={isAddingAccount}
          providers={groups}
          onToggle={() => setIsAddingAccount((value) => !value)}
          onAdded={(next) => {
            setDashboard(next)
            setIsAddingAccount(false)
          }}
        />
      )}
    </CanvasPanel>
  )
}

function ProviderCard({
  group,
  onRemoveAccount,
}: {
  group: AgentUsageProviderGroup
  onRemoveAccount: (accountId: string) => Promise<void>
}) {
  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
      <header className="flex items-center gap-2">
        <span className="text-[13px] font-medium text-zinc-100">{group.name}</span>
        {group.detected ? (
          group.version && (
            <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-zinc-400">
              v{group.version}
            </span>
          )
        ) : (
          <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-zinc-500">
            não instalada
          </span>
        )}
        {group.usageSource.docsUrl && (
          <a
            href={group.usageSource.docsUrl}
            target="_blank"
            rel="noreferrer"
            title={group.usageSource.label}
            className="ml-auto text-zinc-500 hover:text-zinc-300"
          >
            <ExternalLink size={12} />
          </a>
        )}
      </header>

      {group.accounts.length === 0 ? (
        <p className="mt-2 text-[11px] text-zinc-500">
          Nenhuma conta vinculada a este provider.
        </p>
      ) : (
        <div className="mt-2 space-y-2">
          {group.accounts.map((account) => (
            <AccountRow
              key={account.id}
              account={account}
              limitation={group.usageSource.limitation}
              sourceLabel={group.usageSource.label}
              onRemove={() => void onRemoveAccount(account.id)}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function AccountRow({
  account,
  limitation,
  sourceLabel,
  onRemove,
}: {
  account: AgentUsageAccount
  limitation: string
  sourceLabel: string
  onRemove: () => void
}) {
  const status = getAccountStatus(account)
  // Com a fonte fora do ar o painel não apaga o que já sabia: mostra o último
  // valor conhecido, marcado como antigo pelo próprio selo de status.
  const sample: AgentUsageSample | null =
    account.latestSample?.metrics.length
      ? account.latestSample
      : getLastKnownAgentUsage(account) ?? account.latestSample
  const plan = getAgentUsagePlan(sample)
  const measuredAt = getAgentUsageMeasuredAt(sample)

  return (
    <div className="rounded-md border border-white/[0.06] bg-black/20 p-2">
      <div className="flex items-center gap-1.5">
        <span className="truncate text-[12px] text-zinc-200" title={account.label}>
          {account.identityDisplay ?? account.label}
        </span>
        {plan && (
          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] uppercase text-amber-300">
            {plan}
          </span>
        )}
        <span
          className={`ml-auto shrink-0 rounded border px-1.5 py-0.5 text-[10px] ${AGENT_USAGE_STATUS_CLASSES[status]}`}
        >
          {formatAgentUsageStatus(status)}
        </span>
        <button
          type="button"
          onClick={onRemove}
          title="Remover conta do painel"
          className="felixo-btn-icon shrink-0 rounded p-0.5 text-zinc-600 hover:text-theme-error"
        >
          <Trash2 size={12} />
        </button>
      </div>

      {sample?.metrics.length ? (
        <div className="mt-2 space-y-2">
          {sample.metrics.map((metric) => (
            <MetricBar key={metric.key} metric={metric} />
          ))}
        </div>
      ) : (
        <p className="mt-1.5 text-[11px] leading-snug text-zinc-500">
          {account.latestSample?.errorMessage ?? limitation}
        </p>
      )}

      <p className="mt-2 text-[10px] leading-snug text-zinc-600">
        {sourceLabel}
        {measuredAt && ` · medido ${formatAgentUsageDate(measuredAt)}`}
        {sample && ` · lido ${formatAgentUsageDate(sample.collectedAt)}`}
      </p>
    </div>
  )
}

function MetricBar({ metric }: { metric: AgentUsageMetric }) {
  const percent = agentUsagePercent(metric)
  const reset = formatAgentUsageReset(metric.resetAt)

  return (
    <div>
      <div className="flex items-baseline gap-2 text-[11px]">
        <span className="text-zinc-400">{metric.label}</span>
        <span className="ml-auto font-medium text-zinc-100">
          {percent === null
            ? formatAgentUsageNumber(metric.remaining ?? metric.used, metric.unit)
            : `${formatAgentUsageNumber(metric.used, metric.unit)}`}
        </span>
      </div>

      {percent !== null && (
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
          <div
            style={{ width: `${percent}%` }}
            className={`h-full rounded-full ${barToneClass(percent)}`}
          />
        </div>
      )}

      {reset && <p className="mt-0.5 text-[10px] text-zinc-600">{reset}</p>}
    </div>
  )
}

/** Verde até a metade, âmbar depois, vermelho quando o limite está perto. */
function barToneClass(percent: number): string {
  if (percent >= 90) {
    return 'bg-theme-error'
  }

  if (percent >= 60) {
    return 'bg-amber-400'
  }

  return 'bg-theme-success'
}

function AddAccountForm({
  isOpen,
  providers,
  onToggle,
  onAdded,
}: {
  isOpen: boolean
  providers: AgentUsageProviderGroup[]
  onToggle: () => void
  onAdded: (dashboard: AgentUsageDashboard) => void
}) {
  const [providerId, setProviderId] = useState(providers[0]?.id ?? 'codex')
  const [label, setLabel] = useState('')
  const [identityHint, setIdentityHint] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage(null)

    const result = await window.felixo?.agentUsage?.addAccount({
      providerId,
      label: label.trim(),
      identityHint: identityHint.trim() || undefined,
    })

    if (!result?.ok) {
      setMessage(result?.message ?? 'Não foi possível adicionar a conta.')
      return
    }

    setLabel('')
    setIdentityHint('')
    if (result.dashboard) {
      onAdded(result.dashboard)
    }
  }

  return (
    <div className="mt-3 border-t border-white/10 pt-2">
      <button
        type="button"
        onClick={onToggle}
        className="felixo-btn flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-[11px] text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
      >
        <Plus size={12} />
        Adicionar outra conta
      </button>

      {isOpen && (
        <form onSubmit={submit} className="mt-2 space-y-2">
          <p className="text-[10px] leading-snug text-zinc-600">
            A conta em uso já é detectada sozinha. Cadastre aqui só uma segunda
            conta do mesmo provider — o app guarda um fingerprint e uma forma
            mascarada, nunca chave, token ou senha.
          </p>

          <select
            value={providerId}
            onChange={(event) => setProviderId(event.target.value)}
            className="w-full rounded border border-white/10 bg-zinc-800 px-2 py-1 text-[11px] text-zinc-200"
          >
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.name}
              </option>
            ))}
          </select>

          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Nome local (ex.: conta do trabalho)"
            className="w-full rounded border border-white/10 bg-zinc-800 px-2 py-1 text-[11px] text-zinc-200 placeholder:text-zinc-600"
          />

          <input
            value={identityHint}
            onChange={(event) => setIdentityHint(event.target.value)}
            placeholder="e-mail ou ID exibido pela CLI (opcional)"
            className="w-full rounded border border-white/10 bg-zinc-800 px-2 py-1 text-[11px] text-zinc-200 placeholder:text-zinc-600"
          />

          {message && <p className="text-[10px] text-theme-error">{message}</p>}

          <button
            type="submit"
            disabled={!label.trim()}
            className="felixo-btn w-full rounded-md bg-zinc-800 px-2 py-1 text-[11px] text-zinc-100 ring-1 ring-white/10 hover:bg-zinc-700 disabled:opacity-40"
          >
            Adicionar ao painel
          </button>
        </form>
      )}
    </div>
  )
}
