import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import {
  type AgentDailySummaryData,
  formatActiveTime,
  localDateString,
  localDayBounds,
  personAlerts,
} from '../../services/agent-daily-summary'

/**
 * Aba "Resumo": o que cada agente do canvas fez no dia, agrupado por pessoa
 * responsável (campo do bloco). Sob demanda: só lê o registro de sessões quando
 * a aba abre, a data muda ou a pessoa clica em Atualizar. Nada sai do app.
 */
export function AgentDailySummary() {
  const [day, setDay] = useState(localDateString)
  const [summary, setSummary] = useState<AgentDailySummaryData | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    const bounds = localDayBounds(day)
    const api = window.felixo?.agentSessionLog
    if (!bounds) {
      setMessage('Escolha uma data válida.')
      return
    }
    if (!api?.dailySummary) {
      setMessage('Este resumo só funciona no app desktop.')
      return
    }
    setLoading(true)
    try {
      const result = await api.dailySummary(bounds)
      if (result.ok && result.summary) {
        setSummary(result.summary)
        setMessage(null)
      } else {
        setMessage(result.message ?? 'Não foi possível montar o resumo.')
      }
    } catch {
      setMessage('Não foi possível falar com o processo principal.')
    } finally {
      setLoading(false)
    }
  }, [day])

  useEffect(() => {
    // Leitura sob demanda: abrir a aba ou trocar a data é o pedido da pessoa.
    const timerId = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timerId)
  }, [load])

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <label htmlFor="agent-daily-summary-day" className="text-[11px] text-zinc-400">
          Dia
        </label>
        <input
          id="agent-daily-summary-day"
          type="date"
          value={day}
          max={localDateString()}
          onChange={(event) => setDay(event.target.value)}
          className="rounded-sm border border-white/10 bg-black/20 px-1.5 py-0.5 text-[11px] text-zinc-200"
        />
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="felixo-btn ml-auto flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px] text-zinc-300 hover:bg-white/6 disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin motion-reduce:animate-none' : undefined} />
          Atualizar
        </button>
      </div>

      {message && (
        <p role="alert" className="text-[11px] text-theme-error">
          {message}
        </p>
      )}

      {summary === null ? (
        !message && <p className="text-[11px] text-zinc-500">Carregando o resumo…</p>
      ) : summary.people.length === 0 ? (
        <p className="rounded-md border border-white/10 bg-white/2 px-3 py-3 text-center text-[11px] text-zinc-500">
          Nenhuma sessão de agente registrada neste dia.
        </p>
      ) : (
        <ul aria-label="Resumo do dia por pessoa" className="space-y-1.5">
          {summary.people.map((person) => {
            const alerts = personAlerts(person)
            return (
              <li key={person.responsible} className="rounded-md border border-white/10 bg-white/2 px-2.5 py-2">
                <p className="text-[12px] font-medium text-zinc-100">{person.responsible}</p>
                <p className="mt-0.5 text-[11px] text-zinc-400">
                  {person.sessions} sessão(ões) · {person.interactions} interação(ões) · {formatActiveTime(person.active_ms)} ativo
                </p>
                <ul className="mt-1 space-y-0.5 text-[11px] text-zinc-300">
                  {person.agents.map((agent) => (
                    <li key={`${agent.agent}|${agent.model}`}>
                      {agent.agent ?? 'agente'}
                      {agent.model ? ` · ${agent.model}` : ''}: {agent.sessions} sessão(ões), {agent.interactions} interação(ões)
                    </li>
                  ))}
                </ul>
                {alerts.length > 0 && <p className="mt-1 text-[11px] text-amber-300">Atenção: {alerts.join('; ')}.</p>}
              </li>
            )
          })}
        </ul>
      )}
      <p className="text-[10px] text-zinc-500">
        O registro guarda só metadados: o resultado das tarefas e aprovações pendentes não aparecem aqui.
      </p>
    </div>
  )
}
