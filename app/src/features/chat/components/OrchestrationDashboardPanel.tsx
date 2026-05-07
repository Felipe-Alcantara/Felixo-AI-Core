import { useOrchestrationDashboard } from '../hooks/useOrchestrationDashboard'

type Props = {
  isOpen: boolean
  onToggleOpen: () => void
}

const STATUS_LABEL: Record<string, string> = {
  running: 'em execução',
  completed: 'concluído',
  error: 'erro',
  fallback: 'migrando modelo',
}

const STATUS_COLOR: Record<string, string> = {
  running: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  completed: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  error: 'bg-red-500/15 text-red-300 border-red-500/30',
  fallback: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
}

export function OrchestrationDashboardPanel({ isOpen, onToggleOpen }: Props) {
  const { runs, limitedModels } = useOrchestrationDashboard()
  const totalAgents = runs.reduce((sum, run) => sum + run.agents.size, 0)
  const runningAgents = runs.reduce(
    (sum, run) =>
      sum +
      Array.from(run.agents.values()).filter((agent) => agent.status === 'running')
        .length,
    0,
  )

  return (
    <section className="rounded-2xl border border-white/10 bg-zinc-900/60 backdrop-blur">
      <header className="flex items-center justify-between gap-3 px-4 py-2.5">
        <div className="flex items-center gap-2 text-xs text-zinc-300">
          <span className="font-medium text-zinc-100">Orquestração</span>
          <span className="text-zinc-500">·</span>
          <span>
            {runs.length} run{runs.length === 1 ? '' : 's'} · {runningAgents}/{totalAgents}{' '}
            agente(s) ativos
          </span>
          {limitedModels.length > 0 ? (
            <>
              <span className="text-zinc-500">·</span>
              <span className="text-amber-300">
                {limitedModels.length} modelo(s) com limite
              </span>
            </>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onToggleOpen}
          className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-zinc-300 hover:bg-white/5"
        >
          {isOpen ? 'Recolher' : 'Expandir'}
        </button>
      </header>

      {isOpen ? (
        <div className="space-y-3 px-4 pb-3">
          {runs.length === 0 && limitedModels.length === 0 ? (
            <p className="text-xs text-zinc-500">
              Nenhuma orquestração ativa. Quando o orquestrador delegar tarefas, os
              sub-agentes e fallbacks aparecem aqui.
            </p>
          ) : null}

          {limitedModels.length > 0 ? (
            <div>
              <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-amber-300">
                Modelos com limite
              </h4>
              <ul className="space-y-1">
                {limitedModels.map((entry) => (
                  <li
                    key={`${entry.cliType}:${entry.modelId ?? 'cli-wide'}`}
                    className="rounded-md border border-amber-500/20 bg-amber-500/5 px-2 py-1.5 text-xs text-amber-100"
                  >
                    <div className="font-medium">
                      {entry.modelName ?? entry.modelId ?? entry.cliType}
                      <span className="ml-1 text-amber-300/70">({entry.cliType})</span>
                    </div>
                    {entry.resetLabel ? (
                      <div className="text-[11px] text-amber-300/80">
                        Reset previsto: {entry.resetLabel}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {runs.map((run) => {
            const agents = Array.from(run.agents.values()).sort(
              (left, right) => right.lastUpdatedAt - left.lastUpdatedAt,
            )
            return (
              <div key={run.runId} className="rounded-md border border-white/5 p-2">
                <div className="mb-1 flex items-center justify-between text-[11px] text-zinc-400">
                  <span>
                    Run <span className="font-mono text-zinc-300">{run.runId}</span>
                  </span>
                  <span>{agents.length} agente(s)</span>
                </div>
                <ul className="space-y-1">
                  {agents.map((agent) => (
                    <li
                      key={agent.agentId}
                      className="flex flex-col gap-0.5 rounded-md bg-white/5 px-2 py-1.5 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-zinc-100">
                          {agent.agentId}
                        </span>
                        <span
                          className={`rounded-full border px-1.5 py-0.5 text-[10px] ${
                            STATUS_COLOR[agent.status] ?? STATUS_COLOR.running
                          }`}
                        >
                          {STATUS_LABEL[agent.status] ?? agent.status}
                        </span>
                      </div>
                      <div className="text-[11px] text-zinc-400">
                        {agent.cliType}
                        {agent.modelName ? ` · ${agent.modelName}` : ''}
                      </div>
                      {agent.fallbackHistory.length > 0 ? (
                        <div className="text-[11px] text-amber-300/90">
                          {agent.fallbackHistory.map((entry, index) => (
                            <span key={index} className="block">
                              ↻ {entry.fromCliType} → {entry.toCliType}
                              {entry.spreadFromCliType
                                ? ` (espalhado de ${entry.spreadFromCliType})`
                                : ''}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      ) : null}
    </section>
  )
}
