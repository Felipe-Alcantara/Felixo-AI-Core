import { ChevronDown, ChevronUp, Network } from 'lucide-react'
import { useOrchestrationDashboard } from '../../shared/orchestrator/useOrchestrationDashboard'

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
  running: 'bg-(--f-core-white)/15 text-(--f-core-white-soft) border-white/10',
  completed: 'bg-(--f-core-white)/15 text-(--f-core-white-soft) border-white/10',
  error: 'bg-[color-mix(in_srgb,var(--color-error)_18%,transparent)] text-theme-error border-[color-mix(in_srgb,var(--color-error)_38%,transparent)]',
  fallback: 'bg-[color-mix(in_srgb,var(--color-warning)_16%,transparent)] text-(--color-warning) border-[color-mix(in_srgb,var(--color-warning)_38%,transparent)]',
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
    <section
      data-felixo-tech="orchestration"
      data-open={isOpen ? 'true' : 'false'}
      className="felixo-tech-strip border-t border-white/8"
    >
      {/* Mesma anatomia da faixa do QA Logger ao lado: ícone, nome, pílula com
          a contagem e uma seta. Parada, a faixa não narra "0 runs · 0/0
          agentes" — só diz quantas execuções existem; o detalhe aparece
          quando há algo rodando. */}
      <header className="felixo-tech-strip-header">
        <div className="flex min-w-0 items-center gap-2 text-[11px] font-medium text-zinc-400">
          <Network size={13} aria-hidden="true" />
          <span>Orquestração</span>
          <span className="rounded-full border border-white/8 px-2 py-0.5 font-mono text-[10px] text-zinc-500">
            {runs.length}
          </span>
          {totalAgents > 0 ? (
            <span className="truncate font-normal text-zinc-500">
              {runningAgents}/{totalAgents} agente(s) ativos
            </span>
          ) : null}
          {limitedModels.length > 0 ? (
            <span className="truncate font-normal text-(--color-warning)">
              {limitedModels.length} modelo(s) com limite
            </span>
          ) : null}
        </div>
        <button
          type="button"
          title={isOpen ? 'Recolher orquestração' : 'Abrir orquestração'}
          onClick={onToggleOpen}
          className="felixo-btn-icon flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 hover:bg-white/6 hover:text-zinc-200"
        >
          {isOpen ? (
            <ChevronDown size={14} aria-hidden="true" />
          ) : (
            <ChevronUp size={14} aria-hidden="true" />
          )}
          <span className="sr-only">{isOpen ? 'Recolher orquestração' : 'Abrir orquestração'}</span>
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
              <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-(--color-warning)">
                Modelos com limite
              </h4>
              <ul className="space-y-1">
                {limitedModels.map((entry) => (
                  <li
                    key={`${entry.cliType}:${entry.modelId ?? 'cli-wide'}`}
                    className="rounded-md border border-[color-mix(in_srgb,var(--color-warning)_38%,transparent)] bg-[color-mix(in_srgb,var(--color-warning)_16%,transparent)] px-2 py-1.5 text-xs text-(--color-warning)"
                  >
                    <div className="font-medium">
                      {entry.modelName ?? entry.modelId ?? entry.cliType}
                      <span className="ml-1 text-(--color-warning)">({entry.cliType})</span>
                    </div>
                    {entry.resetLabel ? (
                      <div className="text-[11px] text-(--color-warning)">
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
                        <div className="text-[11px] text-(--color-warning)">
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
