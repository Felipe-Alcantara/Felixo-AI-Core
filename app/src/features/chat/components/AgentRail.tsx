import { Bot, Plus } from 'lucide-react'
import type { Agent, AgentId } from '../types'

type AgentRailProps = {
  agents: Agent[]
  selectedAgent: Agent
  onSelectAgent: (agentId: AgentId) => void
  onNewIdea: () => void
}

export function AgentRail({
  agents,
  selectedAgent,
  onSelectAgent,
  onNewIdea,
}: AgentRailProps) {
  return (
    <aside className="flex w-20 shrink-0 flex-col items-center gap-3 border-r border-white/10 bg-black/20 px-3 py-4 max-sm:w-full max-sm:flex-row max-sm:border-b max-sm:border-r-0">
      <button
        type="button"
        title="Nova ideia"
        onClick={onNewIdea}
        className="flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-200/20 bg-emerald-200/10 text-emerald-100 transition hover:bg-emerald-200/15 focus:outline-none focus:ring-2 focus:ring-emerald-200/50"
      >
        <Plus size={18} aria-hidden="true" />
        <span className="sr-only">Nova ideia</span>
      </button>

      <div className="h-px w-9 bg-white/10 max-sm:h-9 max-sm:w-px" />

      <div className="flex flex-col gap-2 max-sm:flex-row">
        {agents.map((agent) => {
          const isSelected = agent.id === selectedAgent.id

          return (
            <button
              key={agent.id}
              type="button"
              title={`${agent.name}: ${agent.tone}`}
              onClick={() => onSelectAgent(agent.id)}
              className={`flex h-12 w-12 items-center justify-center rounded-2xl border text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-violet-200/50 ${
                isSelected
                  ? `${agent.accentClass} border-white/30 shadow-soft`
                  : 'border-white/10 bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08]'
              }`}
            >
              {agent.name.slice(0, 1)}
            </button>
          )
        })}
      </div>

      <div className="mt-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-zinc-900/70 text-zinc-400 max-sm:ml-auto max-sm:mt-0">
        <Bot size={18} aria-hidden="true" />
      </div>
    </aside>
  )
}
