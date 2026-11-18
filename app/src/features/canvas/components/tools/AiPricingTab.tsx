import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import {
  PROVIDER_LABELS,
  compareWithSubscriptions,
  formatBrl,
  formatUsd,
  formatUsdBrl,
  subscriptionsByModel,
  type AiPricingResult,
  type AiPricingTable,
  type UsdBrlRate,
} from '../../../shared/agent-usage/ai-pricing'

const COMPARE_DAYS = 30

function providerLabel(provider: string) {
  return PROVIDER_LABELS[provider] ?? provider
}

/** Dólar em cima e real embaixo, para a coluna não quebrar no meio do valor. */
function Money({ usd, rate, digits = 2 }: { usd: number | null; rate: UsdBrlRate | null; digits?: number }) {
  const brl = formatBrl(usd, rate, digits)
  return (
    <>
      <span className="whitespace-nowrap">{formatUsd(usd, digits)}</span>
      {brl && <span className="block whitespace-nowrap text-[11px] text-zinc-500">{brl}</span>}
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

/** Custo do uso do Claude em API nos últimos 30 dias contra o preço de cada plano individual. */
function UsageComparison({ table, rate }: { table: AiPricingTable; rate: UsdBrlRate | null }) {
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

  const rows = useMemo(() => (typeof apiUsd === 'number' ? compareWithSubscriptions(apiUsd, table.subscriptions, 'anthropic') : []), [apiUsd, table])

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
      <table className="w-full text-left text-xs text-zinc-300">
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
              <th scope="row" className="py-1 pr-2 font-normal">{subscription.name}</th>
              <td className="py-1 pr-2 text-right tabular-nums">
                <Money usd={subscription.monthlyUsd} rate={rate} />
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
      <p className="text-[11px] text-zinc-500">
        Só preço: o plano também limita o uso por janela de horas e por semana, e a API não tem esse teto.
      </p>
    </section>
  )
}

function SubscriptionsTable({ table, rate }: { table: AiPricingTable; rate: UsdBrlRate | null }) {
  const names = useMemo(() => new Map(table.models.map((model) => [model.id, model.name])), [table])
  return (
    <section aria-label="Assinaturas" className="flex flex-col gap-1.5">
      <h3 className="text-xs font-semibold text-zinc-200">Assinaturas</h3>
      <table className="w-full text-left text-xs text-zinc-300">
        <thead className="text-zinc-500">
          <tr>
            <th scope="col" className="py-1 pr-2 font-normal">Plano</th>
            <th scope="col" className="py-1 pr-2 text-right font-normal">Preço</th>
            <th scope="col" className="py-1 font-normal">Modelos e observações</th>
          </tr>
        </thead>
        <tbody>
          {table.subscriptions.map((item) => (
            <tr key={item.id} className="border-t border-white/5 align-top">
              <th scope="row" className="py-1 pr-2 font-normal">
                {item.name}
                <span className="block text-[11px] text-zinc-500">{providerLabel(item.provider)}</span>
              </th>
              <td className="py-1 pr-2 text-right tabular-nums">
                <Money usd={item.monthlyUsd} rate={rate} />
                {item.monthlyUsd !== null && <span className="block text-[11px] text-zinc-500">por {item.unit}</span>}
              </td>
              <td className="py-1 text-zinc-400">
                {item.models.length > 0 ? `${item.models.map((id) => names.get(id) ?? id).join(', ')}.` : 'Modelos não detalhados.'}
                {item.note ? ` ${item.note}` : ''} <SourceLink href={item.source} asOf={item.asOf} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function ModelsTable({ table, rate }: { table: AiPricingTable; rate: UsdBrlRate | null }) {
  const plansByModel = useMemo(() => subscriptionsByModel(table.subscriptions), [table])
  return (
    <section aria-label="Modelos por API" className="flex flex-col gap-1.5">
      <h3 className="text-xs font-semibold text-zinc-200">Modelos por API (por milhão de tokens)</h3>
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
          {table.models.map((model) => (
            <tr key={model.id} className="border-t border-white/5 align-top">
              <th scope="row" className="py-1 pr-2 font-normal">
                {model.name}
                <span className="block text-[11px] text-zinc-500">
                  {providerLabel(model.provider)} · <SourceLink href={model.source} asOf={model.asOf} />
                </span>
              </th>
              <td className="py-1 pr-2 text-right tabular-nums">
                <Money usd={model.input} rate={rate} digits={3} />
              </td>
              <td className="py-1 pr-2 text-right tabular-nums">
                <Money usd={model.output} rate={rate} digits={3} />
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
    </section>
  )
}

/**
 * Aba "Preços": preço de cada modelo por API e de cada assinatura, em dólar e em real, e se o seu
 * uso do Claude sai mais barato por assinatura ou por API. A tabela vem online, com reserva embutida.
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
      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
        {result?.ok && (
          <span>
            {table ? `Tabela ${result.origin === 'online' ? 'online' : 'embutida no app'}, preços de ${table.asOf}.` : 'Sem tabela de preços.'}
            {result.onlineError && result.origin === 'reserva' ? ` Online: ${result.onlineError}.` : ''}{' '}
            {rate
              ? `Dólar a R$ ${rate.brlPerUsd.toLocaleString('pt-BR', { maximumFractionDigits: 4 })} (${rate.source}, ${rate.date}).`
              : 'Sem cotação do dólar: valores só em US$.'}
          </span>
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
          <SubscriptionsTable table={table} rate={rate} />
          <ModelsTable table={table} rate={rate} />
        </>
      )}
    </div>
  )
}
