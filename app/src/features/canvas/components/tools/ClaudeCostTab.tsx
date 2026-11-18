import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import {
  formatCostUsd,
  groupClaudeCost,
  type ClaudeCostDimension,
  type ClaudeCostGroup,
  type ClaudeCostHistoryResult,
} from '../../../shared/agent-usage/claude-cost'

const PERIODS = [7, 30, 90] as const
const DIMENSIONS: ReadonlyArray<{ id: ClaudeCostDimension; label: string }> = [
  { id: 'project', label: 'Por projeto' },
  { id: 'model', label: 'Por modelo' },
  { id: 'day', label: 'Por dia' },
]

function GroupTable({ groups }: { groups: ClaudeCostGroup[] }) {
  if (groups.length === 0) return <p className="text-xs text-zinc-500">Nenhuma conversa do Claude no período.</p>
  return (
    <table className="w-full text-left text-xs text-zinc-300">
      <thead className="text-zinc-500">
        <tr>
          <th scope="col" className="py-1 pr-2 font-normal">Item</th>
          <th scope="col" className="py-1 pr-2 text-right font-normal">Respostas</th>
          <th scope="col" className="py-1 pr-2 text-right font-normal">Tokens</th>
          <th scope="col" className="py-1 text-right font-normal">Custo equivalente</th>
        </tr>
      </thead>
      <tbody>
        {groups.map((group) => (
          <tr key={group.key} className="border-t border-white/5">
            <th scope="row" className="py-1 pr-2 font-normal">{group.key}</th>
            <td className="py-1 pr-2 text-right tabular-nums">{group.messages.toLocaleString('pt-BR')}</td>
            <td className="py-1 pr-2 text-right tabular-nums">{group.tokens.toLocaleString('pt-BR')}</td>
            <td className="py-1 text-right tabular-nums">
              {formatCostUsd(group.costUsd)}
              {group.partial && group.costUsd !== null ? ' (parcial)' : ''}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/**
 * Aba "Custo": custo equivalente do Claude por projeto, modelo e dia, lido das conversas locais.
 * O preço vem de um arquivo do usuário (com fonte e data); sem ele só os tokens aparecem.
 */
export function ClaudeCostTab() {
  const [days, setDays] = useState<number>(30)
  const [by, setBy] = useState<ClaudeCostDimension>('project')
  const [result, setResult] = useState<ClaudeCostHistoryResult | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    const bridge = window.felixo?.agentUsage
    if (!bridge?.claudeCostHistory) {
      setResult({ ok: false, message: 'Disponível só no app instalado.' })
      return
    }
    setLoading(true)
    try {
      setResult(await bridge.claudeCostHistory({ days }))
    } catch {
      setResult({ ok: false, message: 'Não foi possível falar com o processo principal.' })
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => {
    const timerId = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timerId)
  }, [load])

  const rows = useMemo(() => (result?.ok ? result.rows : []), [result])
  const groups = useMemo(() => groupClaudeCost(rows, by), [rows, by])
  const total = useMemo(() => groupClaudeCost(rows, 'project').reduce((sum, g) => sum + (g.costUsd ?? 0), 0), [rows])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {PERIODS.map((period) => (
          <button
            key={period}
            type="button"
            aria-pressed={days === period}
            onClick={() => setDays(period)}
            className={`felixo-btn rounded-sm px-2 py-1 ${days === period ? 'bg-white/10 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            {period} dias
          </button>
        ))}
        <span className="mx-1 h-3 w-px bg-white/10" aria-hidden="true" />
        {DIMENSIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={by === item.id}
            onClick={() => setBy(item.id)}
            className={`felixo-btn rounded-sm px-2 py-1 ${by === item.id ? 'bg-white/10 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            {item.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="felixo-btn ml-auto flex items-center gap-1.5 rounded-md bg-zinc-800 px-2 py-1 text-zinc-200 ring-1 ring-white/10 hover:bg-zinc-700 disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : undefined} />
          Atualizar
        </button>
      </div>

      {result && !result.ok && <p role="alert" className="text-xs text-amber-300">{result.message}</p>}

      {result?.ok && (
        <>
          <p className="text-xs text-zinc-400">
            {result.pricing
              ? `Total no período: ${formatCostUsd(total)} · preços: ${result.pricing.source}, em ${result.pricing.asOf}.`
              : 'Preços não configurados: só os tokens aparecem. Crie claude-pricing.json na pasta de dados do app (fonte, data e US$ por milhão de tokens de cada modelo).'}
          </p>
          {result.pricing && result.unpricedModels.length > 0 && (
            <p className="text-xs text-amber-300">
              Sem preço no arquivo: {result.unpricedModels.join(', ')}. O total não inclui esses modelos.
            </p>
          )}
          {result.truncated && (
            <p className="text-xs text-amber-300">Muitos arquivos de conversa: a leitura parou no limite e os totais podem estar incompletos.</p>
          )}
          <GroupTable groups={groups} />
        </>
      )}
    </div>
  )
}
