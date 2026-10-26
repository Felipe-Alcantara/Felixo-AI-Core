import {
  EMPTY_AGENT_USAGE_FILTER,
  isAgentUsageFilterActive,
  type AgentUsageFilter,
} from './agent-usage'

/**
 * Busca e "precisa de atenção" das contas, no painel e no modal. Quem renderiza
 * decide quando mostrar a barra (`shouldShowAgentUsageFilter`) e aplica o filtro
 * (`filterAgentUsageGroups`); ela só edita o filtro e diz quantas contas sobraram.
 */
export function AgentUsageFilterBar({
  filter,
  onChange,
  shown,
  total,
  attentionCount,
}: {
  filter: AgentUsageFilter
  onChange: (filter: AgentUsageFilter) => void
  shown: number
  total: number
  attentionCount: number
}) {
  const active = isAgentUsageFilterActive(filter)

  return (
    <div role="search" className="mb-3 flex flex-wrap items-center gap-2" data-felixo-agent-usage-filter="">
      <input
        type="search"
        value={filter.query}
        onChange={(event) => onChange({ ...filter, query: event.target.value })}
        aria-label="Buscar conta por nome, e-mail ou plano"
        placeholder="Buscar conta, e-mail ou plano"
        className="min-w-40 flex-1 rounded-sm border border-white/10 bg-zinc-800 px-2 py-1 text-[11px] text-zinc-200 placeholder:text-zinc-600"
      />

      <button
        type="button"
        aria-pressed={filter.attentionOnly}
        onClick={() => onChange({ ...filter, attentionOnly: !filter.attentionOnly })}
        title="Mostra só as contas com erro, leitura desatualizada, sem sessão ou sem número"
        className={`felixo-btn rounded-md px-2 py-1 text-[11px] ring-1 ring-white/10 ${
          filter.attentionOnly ? 'bg-white/12 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
        }`}
      >
        Precisa de atenção ({attentionCount})
      </button>

      {active && (
        <>
          <span role="status" className="text-[10px] text-zinc-500">
            {shown} de {total} {total === 1 ? 'conta' : 'contas'}
          </span>
          <button
            type="button"
            onClick={() => onChange(EMPTY_AGENT_USAGE_FILTER)}
            className="felixo-btn rounded-sm px-1.5 py-0.5 text-[10px] text-zinc-500 hover:bg-white/8 hover:text-zinc-200"
          >
            Limpar filtro
          </button>
        </>
      )}
    </div>
  )
}
