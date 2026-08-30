import { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, ExternalLink, Gauge, RefreshCw, Trash2, X } from 'lucide-react'
import {
  AGENT_USAGE_STATUS_CLASSES,
  formatAgentUsageDate,
  formatAgentUsageIdentity,
  formatAgentUsageMetric,
  formatAgentUsageSource,
  formatAgentUsageStatus,
  getAccountStatus,
  getLastKnownAgentUsage,
  groupAgentUsageAccounts,
  summarizeAgentUsage,
} from '../../shared/agent-usage/agent-usage'
import { AgentUsageStatusDetailsView } from '../../shared/agent-usage/AgentUsageStatusDetails'
import type {
  AgentUsageAccount,
  AgentUsageDashboard,
  AgentUsageProviderGroup,
} from '../../shared/agent-usage/agent-usage'

type AgentUsageLimitsModalProps = {
  isOpen: boolean
  onClose: () => void
}

const AUTO_REFRESH_OPTIONS = [
  { value: 0, label: 'Desligado' },
  { value: 5, label: 'A cada 5 min' },
  { value: 15, label: 'A cada 15 min' },
  { value: 30, label: 'A cada 30 min' },
]

export function AgentUsageLimitsModal({
  isOpen,
  onClose,
}: AgentUsageLimitsModalProps) {
  const [dashboard, setDashboard] = useState<AgentUsageDashboard>({ ok: true })
  const [loading, setLoading] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [autoRefreshMinutes, setAutoRefreshMinutes] = useState(0)
  const [providerId, setProviderId] = useState('codex')
  const [label, setLabel] = useState('')
  const [identityHint, setIdentityHint] = useState('')
  const [formMessage, setFormMessage] = useState<string | null>(null)

  const loadDashboard = useCallback(async (refreshNow: boolean) => {
    const api = window.felixo?.agentUsage
    if (!api) {
      setStatusMessage('Este painel só está disponível no app desktop.')
      return
    }

    setLoading(true)
    setStatusMessage(null)

    try {
      const result = refreshNow ? await api.refresh() : await api.list()
      if (!result.ok) {
        setStatusMessage(result.message ?? 'Não foi possível carregar o painel.')
        return
      }

      setDashboard(result)
    } catch {
      setStatusMessage('Não foi possível comunicar com o processo principal.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const timerId = window.setTimeout(() => {
      void loadDashboard(false).then(() => loadDashboard(true))
    }, 0)

    return () => window.clearTimeout(timerId)
  }, [isOpen, loadDashboard])

  useEffect(() => {
    if (!isOpen || autoRefreshMinutes <= 0) {
      return
    }

    const intervalId = window.setInterval(() => {
      void loadDashboard(true)
    }, autoRefreshMinutes * 60_000)

    return () => window.clearInterval(intervalId)
  }, [autoRefreshMinutes, isOpen, loadDashboard])

  const providers = useMemo(() => dashboard.providers ?? [], [dashboard.providers])
  const accounts = useMemo(() => dashboard.accounts ?? [], [dashboard.accounts])
  const groups = useMemo(
    () => groupAgentUsageAccounts(providers, accounts),
    [accounts, providers],
  )
  const summary = useMemo(() => summarizeAgentUsage(accounts), [accounts])

  if (!isOpen) {
    return null
  }

  async function handleAddAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const api = window.felixo?.agentUsage
    const normalizedLabel = label.trim()

    if (!api || !normalizedLabel) {
      setFormMessage('Informe um nome para a conta.')
      return
    }

    setLoading(true)
    setFormMessage(null)

    try {
      const result = await api.addAccount({
        providerId,
        label: normalizedLabel,
        ...(identityHint.trim() ? { identityHint: identityHint.trim() } : {}),
      })

      if (!result.ok) {
        setFormMessage(result.message ?? 'Não foi possível adicionar a conta.')
        return
      }

      setDashboard(result.dashboard ?? result)
      setLabel('')
      setIdentityHint('')
      setFormMessage(null)
    } catch {
      setFormMessage('Não foi possível adicionar a conta.')
    } finally {
      setLoading(false)
    }
  }

  async function handleRemoveAccount(account: AgentUsageAccount) {
    const api = window.felixo?.agentUsage
    if (!api || !window.confirm(`Remover a conta "${account.label}" do painel?`)) {
      return
    }

    setLoading(true)
    setStatusMessage(null)

    try {
      const result = await api.removeAccount(account.id)
      if (!result.ok) {
        setStatusMessage(result.message ?? 'Não foi possível remover a conta.')
        return
      }
      setDashboard(result.dashboard ?? result)
    } catch {
      setStatusMessage('Não foi possível remover a conta.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 py-5 backdrop-blur-sm"
      onClick={onClose}
    >
      <section
        className="flex max-h-[92vh] w-full max-w-[1040px] flex-col rounded-3xl border border-white/10 bg-[var(--color-panel)] shadow-shell"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between border-b border-white/[0.08] px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-xl bg-cyan-300/10 p-2 text-cyan-200">
              <Gauge size={17} aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">
                Uso e limites dos agentes
              </h2>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-zinc-500">
                Acompanhe cada conta sem misturar histórico. Números só aparecem
                quando a fonte oficial os entrega; ausência não é tratada como zero.
              </p>
            </div>
          </div>

          <button
            type="button"
            title="Fechar"
            onClick={onClose}
            className="felixo-btn-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-400 hover:bg-white/[0.08] hover:text-zinc-100"
          >
            <X size={16} aria-hidden="true" />
            <span className="sr-only">Fechar</span>
          </button>
        </header>

        <div className="min-h-0 overflow-y-auto px-5 py-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2 text-[11px]">
              <SummaryBadge label="Contas" value={accounts.length} />
              <SummaryBadge label="Atualizadas" value={summary.current} tone="success" />
              <SummaryBadge label="Desatualizadas" value={summary.stale} tone="warning" />
              <SummaryBadge label="Indisponíveis" value={summary.unavailable} />
              <SummaryBadge label="Erros" value={summary.error} tone="error" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-[11px] text-zinc-500">
                Atualização automática
                <select
                  value={autoRefreshMinutes}
                  onChange={(event) => setAutoRefreshMinutes(Number(event.target.value))}
                  className="h-8 rounded-xl border border-white/[0.08] bg-[#1a1a19] px-2 text-[11px] text-zinc-300 outline-none focus:ring-2 focus:ring-cyan-200/30"
                >
                  {AUTO_REFRESH_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={loading}
                onClick={() => void loadDashboard(true)}
                className="felixo-btn flex h-8 items-center gap-2 rounded-xl border border-white/[0.08] px-3 text-[11px] text-zinc-200 hover:bg-white/[0.08] disabled:cursor-wait disabled:text-zinc-600"
              >
                <RefreshCw size={13} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
                Atualizar agora
              </button>
            </div>
          </div>

          {(statusMessage || dashboard.refreshedAt) && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/[0.06] bg-black/10 px-3 py-2 text-[11px] text-zinc-500">
              <span className={statusMessage ? 'text-amber-300' : ''}>
                {statusMessage ?? 'Última atualização'}
              </span>
              {dashboard.refreshedAt && (
                <span>{formatAgentUsageDate(dashboard.refreshedAt)}</span>
              )}
            </div>
          )}

          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="space-y-4">
              {groups.map((group) => (
                <ProviderSection
                  key={group.id}
                  group={group}
                  onRemoveAccount={handleRemoveAccount}
                />
              ))}
              {groups.length === 0 && (
                <div className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-xs text-zinc-500">
                  Nenhum provider foi carregado.
                </div>
              )}
            </div>

            <form
              className="h-fit space-y-3 rounded-2xl border border-white/[0.08] bg-black/10 p-3"
              onSubmit={handleAddAccount}
            >
              <div className="flex items-center gap-2 text-xs font-medium text-zinc-300">
                <Activity size={14} aria-hidden="true" />
                Adicionar conta
              </div>
              <p className="text-[11px] leading-relaxed text-zinc-500">
                O identificador é opcional e serve apenas para vincular a saída da
                CLI à conta certa. O app guarda somente um fingerprint e uma forma
                mascarada de exibição.
              </p>

              <label className="block text-xs text-zinc-400">
                Provider
                <select
                  value={providerId}
                  onChange={(event) => setProviderId(event.target.value)}
                  className="mt-1 h-9 w-full rounded-xl border border-white/[0.08] bg-[#1a1a19] px-2 text-xs text-zinc-100 outline-none focus:ring-2 focus:ring-cyan-200/30"
                >
                  {providers.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-xs text-zinc-400">
                Nome local
                <input
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  placeholder="Conta principal"
                  maxLength={80}
                  className="mt-1 h-9 w-full rounded-xl border border-white/[0.08] bg-[#1a1a19] px-2 text-xs text-zinc-100 outline-none placeholder:text-zinc-600 focus:ring-2 focus:ring-cyan-200/30"
                />
              </label>

              <label className="block text-xs text-zinc-400">
                Identificador público (opcional)
                <input
                  value={identityHint}
                  onChange={(event) => setIdentityHint(event.target.value)}
                  placeholder="e-mail ou ID exibido pela CLI"
                  maxLength={160}
                  className="mt-1 h-9 w-full rounded-xl border border-white/[0.08] bg-[#1a1a19] px-2 text-xs text-zinc-100 outline-none placeholder:text-zinc-600 focus:ring-2 focus:ring-cyan-200/30"
                />
                <span className="mt-1 block text-[10px] text-zinc-600">
                  Não informe chave, token, cookie ou senha.
                </span>
              </label>

              {formMessage && <p className="text-[11px] text-amber-300">{formMessage}</p>}

              <button
                type="submit"
                disabled={loading || !label.trim() || providers.length === 0}
                className="felixo-btn flex h-9 w-full items-center justify-center rounded-xl bg-zinc-100 px-3 text-xs font-medium text-zinc-950 hover:bg-white disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-600"
              >
                Adicionar ao painel
              </button>
            </form>
          </div>
        </div>
      </section>
    </div>
  )
}

function ProviderSection({
  group,
  onRemoveAccount,
}: {
  group: AgentUsageProviderGroup
  onRemoveAccount: (account: AgentUsageAccount) => void
}) {
  return (
    <section className="rounded-2xl border border-white/[0.08] bg-black/10 p-3">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-medium text-zinc-100">{group.name}</h3>
            <span className="rounded-full border border-white/[0.08] px-2 py-0.5 text-[10px] text-zinc-500">
              {group.provider}
            </span>
            <span
              className={[
                'rounded-full border px-2 py-0.5 text-[10px]',
                group.detected
                  ? 'border-theme-success/20 bg-theme-success/10 text-theme-success'
                  : 'border-zinc-500/20 bg-zinc-500/10 text-zinc-500',
              ].join(' ')}
            >
              {group.detected ? 'CLI detectada' : 'CLI não detectada'}
            </span>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
            {group.usageSource.limitation}
          </p>
        </div>
        <span className="shrink-0 text-[10px] text-zinc-600">
          Fonte: {group.usageSource.label}
          {group.version ? ` · v${group.version}` : ''}
        </span>
      </header>

      <div className="mt-3 space-y-2">
        {group.accounts.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/[0.07] px-3 py-3 text-[11px] text-zinc-600">
            Nenhuma conta adicionada para este provider.
          </p>
        ) : (
          group.accounts.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              onRemove={() => onRemoveAccount(account)}
            />
          ))
        )}
      </div>
    </section>
  )
}

function AccountCard({
  account,
  onRemove,
}: {
  account: AgentUsageAccount
  onRemove: () => void
}) {
  const status = getAccountStatus(account)
  const latest = account.latestSample
  const lastKnown = getLastKnownAgentUsage(account)
  const metricsSample = latest?.metrics.length ? latest : lastKnown
  const isLastKnown = Boolean(metricsSample && metricsSample.id !== latest?.id)

  return (
    <article className="rounded-xl border border-white/[0.07] bg-[#1a1a19]/70 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="truncate text-xs font-medium text-zinc-200">{account.label}</h4>
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] ${AGENT_USAGE_STATUS_CLASSES[status]}`}
            >
              {formatAgentUsageStatus(status)}
            </span>
          </div>
          <p className="mt-1 text-[10px] text-zinc-500">
            {formatAgentUsageIdentity(account)}
          </p>
        </div>
        <button
          type="button"
          title="Remover conta"
          onClick={onRemove}
          className="felixo-btn-icon flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-zinc-600 hover:bg-theme-error/10 hover:text-theme-error"
        >
          <Trash2 size={13} aria-hidden="true" />
          <span className="sr-only">Remover conta</span>
        </button>
      </div>

      {metricsSample && metricsSample.metrics.length > 0 ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {metricsSample.metrics.map((metric) => (
            <div key={metric.key} className="rounded-lg border border-white/[0.06] bg-black/15 px-2.5 py-2">
              <div className="text-[11px] font-medium text-zinc-300">{metric.label}</div>
              <div className="mt-1 text-[11px] text-zinc-400">{formatAgentUsageMetric(metric)}</div>
              <div className="mt-1 text-[10px] text-zinc-600">
                Reset: {formatAgentUsageDate(metric.resetAt)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 rounded-lg border border-dashed border-white/[0.07] px-2.5 py-2 text-[11px] text-zinc-600">
          Não informado pela fonte nesta coleta.
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[10px] text-zinc-600">
        <span>
          {isLastKnown && metricsSample
            ? `Fonte dos números: ${formatAgentUsageSource(metricsSample)}`
            : formatAgentUsageSource(latest)}
          {latest?.errorMessage ? ` · ${latest.errorMessage}` : ''}
        </span>
        {isLastKnown && latest && (
          <span className="text-amber-300">
            Última consulta: {formatAgentUsageDate(latest.collectedAt)}
          </span>
        )}
      </div>

      <AgentUsageStatusDetailsView
        sample={latest?.metadata.statusDetails ? latest : metricsSample}
      />

      {latest?.sourceUrl && (
        <a
          href={latest.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-[10px] text-cyan-300/80 hover:text-cyan-200"
        >
          Documentação da fonte
          <ExternalLink size={10} aria-hidden="true" />
        </a>
      )}
    </article>
  )
}

function SummaryBadge({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: number
  tone?: 'default' | 'success' | 'warning' | 'error'
}) {
  const classes = {
    default: 'border-white/[0.08] text-zinc-400',
    success: 'border-theme-success/20 bg-theme-success/10 text-theme-success',
    warning: 'border-amber-300/20 bg-amber-300/10 text-amber-300',
    error: 'border-theme-error/20 bg-theme-error/10 text-theme-error',
  }[tone]

  return (
    <span className={`rounded-full border px-2 py-1 ${classes}`}>
      {label}: {value}
    </span>
  )
}
