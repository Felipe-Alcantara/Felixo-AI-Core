import { useCallback, useEffect, useState } from 'react'
import { Puzzle, RefreshCw, ShieldAlert } from 'lucide-react'
import { CanvasPanel } from './CanvasPanel'
import { FelixoSelect } from '../../../shared/components/FelixoSelect'
import type { CliAccount } from '../../../shared/types/cli-accounts'
import type {
  CliPluginEntry,
  CliPluginListResult,
  CliPluginProvider,
} from '../../../shared/types/cli-plugins'
import {
  canChangeEntry,
  describeConfirmation,
  filterPlugins,
  type PluginAction,
} from '../../services/cli-plugins-view'

type Props = { onClose: () => void; toolsMenuOpen?: boolean }

type Tab = 'installed' | 'available' | 'marketplaces'
type Pending = { action: PluginAction; target: string; origin: string; pluginId?: string; source?: string }
type Loaded = Extract<CliPluginListResult, { ok: true }>

const PROVIDERS: Array<{ value: CliPluginProvider; label: string }> = [
  { value: 'claude', label: 'Claude Code' },
  { value: 'codex', label: 'Codex' },
  { value: 'gemini', label: 'Gemini CLI' },
]
const SYSTEM_ACCOUNT = ''
const CAMPO = 'felixo-control w-full text-sm'

const TAB_LABELS: Record<Tab, string> = {
  installed: 'Instalados',
  available: 'Disponíveis',
  marketplaces: 'Marketplaces',
}

/**
 * Plugins (Claude e Codex) e extensões (Gemini) da conta escolhida. A lista é
 * a que a CLI daquela conta informa; instalar, ligar, atualizar e remover só
 * acontecem depois de a pessoa confirmar na própria tela, com a origem à vista.
 */
export function CliPluginsPanel({ onClose, toolsMenuOpen }: Props) {
  const bridge = window.felixo?.cliPlugins
  const [providerId, setProviderId] = useState<CliPluginProvider>('claude')
  const [accounts, setAccounts] = useState<CliAccount[]>([])
  const [accountId, setAccountId] = useState(SYSTEM_ACCOUNT)
  const [tab, setTab] = useState<Tab>('installed')
  const [query, setQuery] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  // O resultado leva a chave do pedido: pedido em voo = chave diferente (sem setState no efeito).
  const [outcome, setOutcome] = useState<{ key: string; scope: string; data: Loaded | null; error: string | null } | null>(null)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [busy, setBusy] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  const wantsAvailable = tab === 'available'
  const accountLabel = accounts.find((account) => account.id === accountId)?.label ?? 'Login do sistema'

  useEffect(() => {
    let cancelled = false
    void window.felixo?.cliAccounts?.list(providerId).then((result) => {
      if (cancelled) return
      // Conta por chave de API não tem pasta de plugins de login: fica de fora.
      setAccounts((result?.accounts ?? []).filter((account) => account.authKind !== 'api-key'))
    })
    return () => {
      cancelled = true
    }
  }, [providerId])

  const scope = `${providerId}|${accountId}`
  const requestKey = `${scope}|${wantsAvailable}|${reloadKey}`
  const loading = outcome?.key !== requestKey
  // Dados de outra conta ou outro agente nunca ficam na tela enquanto a nova lista carrega.
  const data = outcome?.scope === scope ? outcome.data : null
  const error = outcome?.key === requestKey ? outcome.error : null

  useEffect(() => {
    if (!bridge) return
    let cancelled = false
    const settle = (data: Loaded | null, error: string | null) => {
      if (!cancelled) setOutcome({ key: requestKey, scope, data, error })
    }
    bridge
      .list({ providerId, accountId: accountId || undefined, includeAvailable: wantsAvailable })
      .then((result) =>
        result.ok ? settle(result, null) : settle(null, result.message ?? 'A CLI não listou os plugins.'),
      )
      .catch(() => settle(null, 'Não foi possível listar os plugins.'))
    return () => {
      cancelled = true
    }
  }, [bridge, providerId, accountId, wantsAvailable, requestKey, scope])

  const chooseProvider = useCallback((value: string) => {
    setProviderId(value as CliPluginProvider)
    setAccountId(SYSTEM_ACCOUNT)
    setTab('installed')
    setPending(null)
    setNotice(null)
    setOutcome(null)
  }, [])

  const ask = (next: Pending) => {
    setNotice(null)
    setPending(next)
  }

  const confirm = async () => {
    if (!pending || !bridge) return
    setBusy(true)
    const base = { providerId, accountId: accountId || undefined, pluginId: pending.pluginId, source: pending.source, confirmed: true }
    try {
      const result =
        pending.action === 'install'
          ? await bridge.install(base)
          : pending.action === 'remove'
            ? await bridge.remove(base)
            : pending.action === 'update'
              ? await bridge.update(base)
              : await bridge.setEnabled({ ...base, enabled: pending.action === 'enable' })
      setNotice({ ok: result.ok, text: result.message ?? (result.ok ? 'Concluído.' : 'A alteração falhou.') })
      if (result.ok && pending.action === 'install') setSourceUrl('')
    } catch {
      setNotice({ ok: false, text: 'Não foi possível concluir a alteração.' })
    } finally {
      setBusy(false)
      setPending(null)
      setReloadKey((key) => key + 1)
    }
  }

  const caps = data?.capabilities
  const tabs: Tab[] = ['installed', ...(caps?.available ? (['available'] as const) : []), ...(caps?.marketplaces ? (['marketplaces'] as const) : [])]
  const entries = tab === 'available' ? (data?.available ?? []) : (data?.installed ?? [])
  const { rows, total } = filterPlugins(entries, query)
  const confirmation = pending
    ? describeConfirmation({ action: pending.action, providerId, accountLabel, target: pending.target, origin: pending.origin })
    : null

  const actionsFor = (entry: CliPluginEntry) => {
    if (!entry.installed) return [{ label: 'Instalar', action: 'install' as const }]
    if (!canChangeEntry(entry)) return []
    return [
      ...(caps?.toggle && entry.enabled !== null
        ? [{ label: entry.enabled ? 'Desligar' : 'Ligar', action: entry.enabled ? ('disable' as const) : ('enable' as const) }]
        : []),
      ...(caps?.update ? [{ label: 'Atualizar', action: 'update' as const }] : []),
      { label: 'Remover', action: 'remove' as const },
    ]
  }

  return (
    <CanvasPanel
      title="Plugins"
      panelId="cli-plugins"
      icon={<Puzzle size={15} />}
      onClose={onClose}
      toolsMenuOpen={toolsMenuOpen}
      size="md"
    >
      {!bridge ? (
        <p className="text-sm text-zinc-500">Esta versão do app não tem o gerenciador de plugins.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <FelixoSelect
              id="cli-plugins-provider"
              value={providerId}
              onChange={chooseProvider}
              options={PROVIDERS}
              menuLabel="Agentes"
              aria-label="Agente dos plugins"
            />
            <FelixoSelect
              id="cli-plugins-account"
              value={accountId}
              onChange={(value) => {
                setAccountId(value)
                setPending(null)
                setNotice(null)
              }}
              options={[
                { value: SYSTEM_ACCOUNT, label: 'Login do sistema' },
                ...accounts.map((account) => ({ value: account.id, label: account.label })),
              ]}
              menuLabel="Contas"
              aria-label="Conta dos plugins"
            />
          </div>
          <p className="text-xs text-zinc-500">
            Cada conta tem os próprios plugins: o que você instala aqui vale só para a conta escolhida.
          </p>

          <div className="flex items-center gap-1" role="tablist" aria-label="Seções dos plugins">
            {tabs.map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={tab === item}
                onClick={() => setTab(item)}
                className={`rounded-sm px-2 py-1 text-xs ${tab === item ? 'bg-white/10 text-zinc-100' : 'text-zinc-400 hover:bg-white/5'}`}
              >
                {TAB_LABELS[item]}
              </button>
            ))}
            <button
              type="button"
              aria-label="Atualizar a lista de plugins"
              title="Atualizar a lista"
              onClick={() => setReloadKey((key) => key + 1)}
              disabled={loading || busy}
              className="felixo-btn-icon ml-auto rounded-sm p-1 text-zinc-400 hover:bg-white/10 disabled:opacity-40"
            >
              <RefreshCw size={13} aria-hidden className={loading ? 'animate-spin' : ''} />
            </button>
          </div>

          {notice && (
            <p
              role="status"
              className={`rounded-sm p-2 text-xs ${notice.ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}
            >
              {notice.text}
            </p>
          )}

          {confirmation && pending && (
            <div role="alertdialog" aria-label={confirmation.title} className="rounded-sm border border-amber-500/40 bg-amber-500/10 p-3">
              <p className="flex items-center gap-1.5 text-sm font-medium text-amber-300">
                <ShieldAlert size={14} aria-hidden /> {confirmation.title}
              </p>
              <p className="mt-1 break-words text-xs text-zinc-300">{confirmation.body}</p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => void confirm()}
                  disabled={busy}
                  className="rounded-sm bg-amber-500/20 px-2 py-1 text-xs text-amber-200 hover:bg-amber-500/30 disabled:opacity-50"
                >
                  {busy ? 'Aguarde…' : confirmation.confirmLabel}
                </button>
                <button
                  type="button"
                  onClick={() => setPending(null)}
                  disabled={busy}
                  className="rounded-sm px-2 py-1 text-xs text-zinc-400 hover:bg-white/10 disabled:opacity-50"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {error && (
            <p role="status" className="rounded-sm bg-red-500/10 p-2 text-xs text-red-400">
              {error}
            </p>
          )}
          {loading && !data && <p className="text-sm text-zinc-500">Consultando a CLI da conta…</p>}

          {data && tab === 'marketplaces' && (
            <ul className="flex flex-col gap-1">
              {data.marketplaces.length === 0 && <li className="text-sm text-zinc-500">Nenhum marketplace configurado nesta conta.</li>}
              {data.marketplaces.map((marketplace) => (
                <li key={marketplace.name} className="rounded-sm bg-zinc-800/60 px-2 py-1.5">
                  <div className="text-sm text-zinc-100">{marketplace.name}</div>
                  <div className="break-all text-xs text-zinc-500">{marketplace.origin || 'origem não informada'}</div>
                </li>
              ))}
            </ul>
          )}

          {data && tab !== 'marketplaces' && (
            <>
              {tab === 'available' && (
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar por nome, descrição ou marketplace…"
                  aria-label="Buscar plugins disponíveis"
                  className={CAMPO}
                />
              )}
              {tab === 'installed' && caps?.installBySource && (
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={sourceUrl}
                    onChange={(event) => setSourceUrl(event.target.value)}
                    placeholder="https://github.com/dono/extensao"
                    aria-label="Endereço https da extensão"
                    className={CAMPO}
                  />
                  <button
                    type="button"
                    onClick={() => ask({ action: 'install', target: sourceUrl.trim(), origin: sourceUrl.trim(), source: sourceUrl.trim() })}
                    disabled={!/^https:\/\/\S+$/.test(sourceUrl.trim()) || busy}
                    className="shrink-0 rounded-sm bg-white/10 px-2 py-1 text-xs text-zinc-100 hover:bg-white/15 disabled:opacity-40"
                  >
                    Instalar por endereço
                  </button>
                </div>
              )}
              {rows.length === 0 && (
                <p className="text-sm text-zinc-500">
                  {tab === 'available'
                    ? 'Nenhum plugin disponível com esse filtro nos marketplaces desta conta.'
                    : 'Nada instalado nesta conta.'}
                </p>
              )}
              <ul className="flex flex-col gap-1">
                {rows.map((entry) => (
                  <li key={entry.id} className="rounded-sm bg-zinc-800/60 px-2 py-1.5">
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm text-zinc-100">
                          {entry.name}
                          {entry.version && <span className="ml-1 text-xs text-zinc-500">{entry.version}</span>}
                          {entry.installed && entry.enabled === false && <span className="ml-1 text-xs text-amber-400">desligado</span>}
                          {entry.installed && entry.scope && entry.scope !== 'user' && (
                            <span className="ml-1 text-xs text-zinc-500">escopo {entry.scope}</span>
                          )}
                        </div>
                        {entry.description && <div className="line-clamp-2 text-xs text-zinc-400">{entry.description}</div>}
                        <div className="truncate text-xs text-zinc-500" title={entry.origin}>
                          {[entry.marketplace, entry.origin].filter(Boolean).join(' · ') || 'origem não informada'}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-wrap justify-end gap-1">
                        {actionsFor(entry).map(({ label, action }) => (
                          <button
                            key={action}
                            type="button"
                            onClick={() => ask({ action, target: entry.name, origin: entry.origin, pluginId: entry.id })}
                            disabled={busy || pending !== null}
                            className="rounded-sm px-1.5 py-0.5 text-xs text-zinc-300 hover:bg-white/10 disabled:opacity-40"
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              {total > rows.length && (
                <p className="text-xs text-zinc-500">Mostrando {rows.length} de {total}. Use a busca para achar o resto.</p>
              )}
            </>
          )}
        </div>
      )}
    </CanvasPanel>
  )
}
