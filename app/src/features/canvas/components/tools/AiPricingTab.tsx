import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'
import { FelixoSelect } from '../../../shared/components/FelixoSelect'
import {
  PROVIDERS,
  REGIONS,
  compareWithSubscriptions,
  describeRate,
  filterPricing,
  formatBrl,
  formatCny,
  formatUsd,
  formatUsdBrl,
  groupByProvider,
  providerLabel,
  subscriptionsByModel,
  type AiModelPrice,
  type AiPricingResult,
  type AiPricingTable,
  type AiSubscriptionPrice,
  type ExchangeRate,
  type PricingFilter,
  type ProviderRegion,
  type SubscriptionComparison,
} from '../../../shared/agent-usage/ai-pricing'

const COMPARE_DAYS = 30
const EMPTY_FILTER: PricingFilter = { query: '', region: '', provider: '' }

/** Dólar em cima, real embaixo e, se o preço oficial é em yuan, o valor original. */
function Money({ usd, rate, cny, digits = 2 }: { usd: number | null; rate: ExchangeRate | null; cny?: number | null; digits?: number }) {
  const brl = formatBrl(usd, rate, digits)
  return (
    <>
      <span className="whitespace-nowrap">{formatUsd(usd, digits)}</span>
      {brl && <span className="block whitespace-nowrap text-[11px] text-zinc-500">{brl}</span>}
      {cny !== undefined && <span className="block whitespace-nowrap text-[11px] text-zinc-500">oficial {formatCny(cny, digits)}</span>}
    </>
  )
}

function SourceLink({ href, asOf }: { href: string; asOf: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-zinc-500 underline decoration-dotted hover:text-zinc-300">
      fonte, {asOf}
    </a>
  )
}

function ComparisonTable({ label, rows, rate }: { label: string; rows: SubscriptionComparison[]; rate: ExchangeRate | null }) {
  return (
    <table aria-label={label} className="w-full text-left text-xs text-zinc-300">
      <thead className="text-zinc-500">
        <tr>
          <th scope="col" className="py-1 pr-2 font-normal">Plano</th>
          <th scope="col" className="py-1 pr-2 text-right font-normal">Preço por mês</th>
          <th scope="col" className="py-1 text-right font-normal">Compensa</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ subscription, savingUsd, verdict }) => (
          <tr key={subscription.id} className="border-t border-white/5">
            <th scope="row" className="py-1 pr-2 font-normal">
              {subscription.name}
              {subscription.provider !== 'anthropic' && <span className="block text-[11px] text-zinc-500">{providerLabel(subscription.provider)}</span>}
            </th>
            <td className="py-1 pr-2 text-right tabular-nums">
              <Money usd={subscription.monthlyUsd} rate={rate} cny={subscription.original?.monthly} />
            </td>
            <td className={`py-1 text-right ${verdict === 'assinatura' ? 'text-emerald-300' : verdict === 'api' ? 'text-amber-300' : 'text-zinc-500'}`}>
              {verdict === 'sem preço' ? (
                'sem preço'
              ) : (
                <>
                  {verdict === 'assinatura' ? 'Assinatura, economiza' : 'API, economiza'}
                  <span className="block">
                    <Money usd={savingUsd === null ? null : Math.abs(savingUsd)} rate={rate} />
                  </span>
                </>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Custo do uso do Claude em API nos últimos 30 dias contra cada plano individual do Claude e os planos de código dos outros. */
function UsageComparison({ table, rate }: { table: AiPricingTable; rate: ExchangeRate | null }) {
  const [apiUsd, setApiUsd] = useState<number | null | undefined>(undefined)
  const [partial, setPartial] = useState(false)

  useEffect(() => {
    let alive = true
    const bridge = window.felixo?.agentUsage
    if (!bridge?.claudeCostHistory) return
    bridge
      .claudeCostHistory({ days: COMPARE_DAYS })
      .then((result) => {
        if (!alive) return
        if (!result.ok) return setApiUsd(null)
        setApiUsd(result.rows.reduce((sum, row) => sum + (row.costUsd ?? 0), 0))
        setPartial(result.unpricedModels.length > 0)
      })
      .catch(() => alive && setApiUsd(null))
    return () => {
      alive = false
    }
  }, [])

  const [claudeRows, otherRows] = useMemo(() => {
    if (typeof apiUsd !== 'number') return [[], []]
    const others = compareWithSubscriptions(apiUsd, table.subscriptions, (item) => item.codingPlan === true && item.provider !== 'anthropic')
    others.sort((a, b) => (a.subscription.monthlyUsd ?? Infinity) - (b.subscription.monthlyUsd ?? Infinity))
    return [compareWithSubscriptions(apiUsd, table.subscriptions, (item) => item.provider === 'anthropic'), others]
  }, [apiUsd, table])

  if (apiUsd === undefined) return <p className="text-xs text-zinc-500">Somando o seu uso do Claude…</p>
  if (apiUsd === null) return <p className="text-xs text-amber-300">Não foi possível somar o seu uso do Claude.</p>
  return (
    <section aria-label="Assinatura ou API" className="flex flex-col gap-1.5">
      <h3 className="text-xs font-semibold text-zinc-200">Assinatura ou API?</h3>
      <p className="text-xs text-zinc-400">
        O seu uso do Claude nos últimos {COMPARE_DAYS} dias (todas as contas somadas) custaria{' '}
        <strong className="text-zinc-200">{formatUsdBrl(apiUsd, rate)}</strong> em API.
        {partial ? ' Parcial: há modelos sem preço na tabela.' : ''} Codex e Gemini ainda não têm essa soma.
      </p>
      <ComparisonTable label="Planos do Claude" rows={claudeRows} rate={rate} />
      {otherRows.length > 0 && (
        <details className="text-xs text-zinc-400">
          <summary className="cursor-pointer select-none text-zinc-300">
            Planos de código de outros fornecedores ({otherRows.length}), do mais barato ao mais caro
          </summary>
          <p className="my-1 text-[11px] text-zinc-500">
            Usam outros modelos (GLM, Kimi, MiniMax, Qwen, Seed, Step...), em geral ligáveis no Claude Code, OpenCode ou Cursor. O
            valor mostra só o preço contra o seu gasto atual, não a equivalência de qualidade.
          </p>
          <ComparisonTable label="Planos de código de outros fornecedores" rows={otherRows} rate={rate} />
        </details>
      )}
      <p className="text-[11px] text-zinc-500">
        Só preço: o plano também limita o uso por janela de horas e por semana, e a API não tem esse teto.
      </p>
    </section>
  )
}

function FilterBar({ filter, onChange, providers }: { filter: PricingFilter; onChange: (filter: PricingFilter) => void; providers: string[] }) {
  const active = filter.query !== '' || filter.region !== '' || filter.provider !== ''
  const regionOptions = [{ value: '', label: 'Todas as regiões' }, ...REGIONS.map((region) => ({ value: region, label: region }))]
  const providerOptions = [
    { value: '', label: 'Todos os fornecedores' },
    ...providers
      .filter((provider) => !filter.region || PROVIDERS[provider]?.region === filter.region)
      .map((provider) => ({ value: provider, label: providerLabel(provider) })),
  ]
  return (
    <div role="search" className="flex flex-wrap items-center gap-2">
      <input
        type="search"
        value={filter.query}
        onChange={(event) => onChange({ ...filter, query: event.target.value })}
        aria-label="Buscar modelo, plano ou fornecedor"
        placeholder="Buscar modelo, plano ou fornecedor"
        className="min-w-full flex-1 rounded-sm border border-white/10 bg-zinc-800 px-2 py-1 text-[11px] text-zinc-200 placeholder:text-zinc-600"
      />
      <div className="w-44">
        <FelixoSelect
          aria-label="Região"
          value={filter.region}
          options={regionOptions}
          onChange={(value) => onChange({ ...filter, region: value as ProviderRegion | '', provider: '' })}
        />
      </div>
      <div className="w-52">
        <FelixoSelect
          aria-label="Fornecedor"
          value={filter.provider}
          options={providerOptions}
          onChange={(value) => onChange({ ...filter, provider: value })}
          searchable
        />
      </div>
      {active && (
        <button
          type="button"
          onClick={() => onChange(EMPTY_FILTER)}
          className="felixo-btn rounded-sm px-1.5 py-0.5 text-[10px] text-zinc-500 hover:bg-white/8 hover:text-zinc-200"
        >
          Limpar filtro
        </button>
      )}
    </div>
  )
}

/** Um bloco recolhível por fornecedor; abre sozinho quando há filtro ou quando `open` pede. */
function ProviderGroup({ provider, count, noun, open, children }: { provider: string; count: number; noun: [string, string]; open: boolean; children: ReactNode }) {
  return (
    <details open={open} className="rounded-md border border-white/5 px-2 py-1">
      <summary className="cursor-pointer select-none text-xs text-zinc-300">
        {providerLabel(provider)} <span className="text-zinc-500">· {count} {count === 1 ? noun[0] : noun[1]}</span>
      </summary>
      {children}
    </details>
  )
}

function SubscriptionsTable({ items, names, rate }: { items: AiSubscriptionPrice[]; names: Map<string, string>; rate: ExchangeRate | null }) {
  return (
    <section aria-label="Assinaturas" className="flex flex-col gap-1.5">
      <h3 className="text-xs font-semibold text-zinc-200">Assinaturas e planos ({items.length})</h3>
      {items.length === 0 && <p className="text-xs text-zinc-500">Nenhum plano com esse filtro.</p>}
      {groupByProvider(items).map(([provider, group]) => (
        <ProviderGroup key={provider} provider={provider} count={group.length} noun={['plano', 'planos']} open>
          <table className="w-full text-left text-xs text-zinc-300">
            <thead className="text-zinc-500">
              <tr>
                <th scope="col" className="py-1 pr-2 font-normal">Plano</th>
                <th scope="col" className="py-1 pr-2 text-right font-normal">Preço</th>
                <th scope="col" className="py-1 font-normal">Modelos e observações</th>
              </tr>
            </thead>
            <tbody>
              {group.map((item) => (
                <tr key={item.id} className="border-t border-white/5 align-top">
                  <th scope="row" className="py-1 pr-2 font-normal">{item.name}</th>
                  <td className="py-1 pr-2 text-right tabular-nums">
                    {item.unit === 'uso' ? (
                      <span className="whitespace-nowrap text-zinc-400">por uso</span>
                    ) : (
                      <>
                        <Money usd={item.monthlyUsd} rate={rate} cny={item.original?.monthly} />
                        {item.monthlyUsd !== null && <span className="block text-[11px] text-zinc-500">por {item.unit}</span>}
                      </>
                    )}
                  </td>
                  <td className="py-1 text-zinc-400">
                    {item.models.length > 0 ? `${item.models.map((id) => names.get(id) ?? id).join(', ')}.` : ''}
                    {item.note ? ` ${item.note}` : ''} <SourceLink href={item.source} asOf={item.asOf} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ProviderGroup>
      ))}
    </section>
  )
}

function ModelsTable({ items, plansByModel, rate, filterActive }: { items: AiModelPrice[]; plansByModel: Map<string, string[]>; rate: ExchangeRate | null; filterActive: boolean }) {
  return (
    <section aria-label="Modelos por API" className="flex flex-col gap-1.5">
      <h3 className="text-xs font-semibold text-zinc-200">Modelos por API, por milhão de tokens ({items.length})</h3>
      {items.length === 0 && <p className="text-xs text-zinc-500">Nenhum modelo com esse filtro.</p>}
      {groupByProvider(items).map(([provider, group]) => (
        <ProviderGroup key={`${provider}-${filterActive}`} provider={provider} count={group.length} noun={['modelo', 'modelos']} open={filterActive && group.length <= 60}>
          <table className="w-full text-left text-xs text-zinc-300">
            <thead className="text-zinc-500">
              <tr>
                <th scope="col" className="py-1 pr-2 font-normal">Modelo</th>
                <th scope="col" className="py-1 pr-2 text-right font-normal">Entrada</th>
                <th scope="col" className="py-1 pr-2 text-right font-normal">Saída</th>
                <th scope="col" className="py-1 pr-2 text-right font-normal">Cache (leitura / escrita)</th>
                <th scope="col" className="py-1 font-normal">Assinaturas com acesso</th>
              </tr>
            </thead>
            <tbody>
              {group.map((model) => (
                <tr key={model.id} className="border-t border-white/5 align-top">
                  <th scope="row" className="py-1 pr-2 font-normal">
                    {model.name}
                    <span className="block text-[11px] text-zinc-500">
                      <SourceLink href={model.source} asOf={model.asOf} />
                    </span>
                  </th>
                  <td className="py-1 pr-2 text-right tabular-nums">
                    <Money usd={model.input} rate={rate} cny={model.original?.input} digits={3} />
                  </td>
                  <td className="py-1 pr-2 text-right tabular-nums">
                    <Money usd={model.output} rate={rate} cny={model.original?.output} digits={3} />
                  </td>
                  <td className="py-1 pr-2 text-right tabular-nums">
                    <Money usd={model.cacheRead} rate={rate} digits={3} />
                    {model.cacheWrite5m !== null && <span className="block whitespace-nowrap text-[11px] text-zinc-500">escrita {formatUsd(model.cacheWrite5m, 3)}</span>}
                  </td>
                  <td className="py-1 text-zinc-400">
                    {(plansByModel.get(model.id) ?? []).join(', ') || 'Só API.'}
                    {model.note ? <span className="block text-[11px] text-zinc-500">{model.note}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ProviderGroup>
      ))}
    </section>
  )
}

function PricingLists({ table, rate }: { table: AiPricingTable; rate: ExchangeRate | null }) {
  const [filter, setFilter] = useState<PricingFilter>(EMPTY_FILTER)
  const filterActive = filter.query.trim() !== '' || filter.provider !== ''
  const names = useMemo(() => new Map(table.models.map((model) => [model.id, model.name])), [table])
  const plansByModel = useMemo(() => subscriptionsByModel(table.subscriptions), [table])
  const providers = useMemo(() => groupByProvider([...table.subscriptions, ...table.models]).map(([provider]) => provider), [table])
  const subscriptions = useMemo(() => filterPricing(table.subscriptions, filter), [table, filter])
  const models = useMemo(() => filterPricing(table.models, filter), [table, filter])
  return (
    <>
      <FilterBar filter={filter} onChange={setFilter} providers={providers} />
      <SubscriptionsTable items={subscriptions} names={names} rate={rate} />
      <ModelsTable items={models} plansByModel={plansByModel} rate={rate} filterActive={filterActive} />
    </>
  )
}

/**
 * Aba "Preços": preço de cada modelo por API e de cada assinatura, em dólar e em real, e se o seu
 * uso do Claude sai mais barato por assinatura ou por API. A tabela vem online, com reserva embutida;
 * os modelos do OpenRouter vêm ao vivo da API dele.
 */
export function AiPricingTab() {
  const [result, setResult] = useState<AiPricingResult | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async (force: boolean) => {
    const bridge = window.felixo?.agentUsage
    if (!bridge?.aiPricing) {
      setResult({ ok: false, message: 'Disponível só no app instalado.' })
      return
    }
    setLoading(true)
    try {
      setResult(await bridge.aiPricing({ force }))
    } catch {
      setResult({ ok: false, message: 'Não foi possível falar com o processo principal.' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timerId = window.setTimeout(() => void load(false), 0)
    return () => window.clearTimeout(timerId)
  }, [load])

  const table = result?.ok ? result.table : null
  const rate = result?.ok ? result.rate : null

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start gap-2 text-xs text-zinc-400">
        {result?.ok && (
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span>
              {table ? `Tabela ${result.origin === 'online' ? 'online' : 'embutida no app'}, preços de ${table.asOf}.` : 'Sem tabela de preços.'}
              {result.onlineError && result.origin === 'reserva' ? ` Online: ${result.onlineError}.` : ''}
            </span>
            <span>{rate ? `${describeRate(rate)}.` : 'Sem cotação: valores só em US$.'}</span>
            {result.openRouter && (
              <span>
                {result.openRouter.origin === 'online'
                  ? `OpenRouter: ${result.openRouter.count} modelos ao vivo da API pública.`
                  : `OpenRouter: ${result.openRouter.count} modelos da lista embutida (${result.openRouter.error}).`}
              </span>
            )}
          </div>
        )}
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={loading}
          className="felixo-btn ml-auto flex items-center gap-1.5 rounded-md bg-zinc-800 px-2 py-1 text-zinc-200 ring-1 ring-white/10 hover:bg-zinc-700 disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : undefined} />
          Atualizar
        </button>
      </div>

      {result && !result.ok && <p role="alert" className="text-xs text-amber-300">{result.message}</p>}

      {table && (
        <>
          <UsageComparison table={table} rate={rate} />
          <PricingLists table={table} rate={rate} />
        </>
      )}
    </div>
  )
}
