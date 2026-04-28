import { CircleDashed, Terminal } from 'lucide-react'
import type { Agent } from '../types'

type ContextPanelProps = {
  selectedAgent: Agent
  messageCount: number
}

export function ContextPanel({ selectedAgent, messageCount }: ContextPanelProps) {
  return (
    <aside className="w-56 shrink-0 border-l border-white/10 bg-black/15 p-4 max-lg:hidden">
      <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-4">
        <div className="flex items-center gap-2 text-xs font-medium text-zinc-300">
          <CircleDashed size={15} className="text-emerald-200" aria-hidden="true" />
          Mesa
        </div>

        <dl className="mt-4 space-y-3 text-xs">
          <div className="flex justify-between gap-3">
            <dt className="text-zinc-500">Agente</dt>
            <dd className="truncate text-zinc-200">{selectedAgent.name}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-zinc-500">Tom</dt>
            <dd className="truncate text-zinc-200">{selectedAgent.tone}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-zinc-500">Mensagens</dt>
            <dd className="text-zinc-200">{messageCount}</dd>
          </div>
        </dl>
      </div>

      <div className="mt-3 rounded-3xl border border-white/10 bg-white/[0.035] p-4">
        <div className="flex items-center gap-2 text-xs font-medium text-zinc-300">
          <Terminal size={15} className="text-sky-200" aria-hidden="true" />
          CLI
        </div>
        <code className="mt-3 block break-all rounded-2xl border border-white/10 bg-black/25 px-3 py-2 font-mono text-[11px] leading-relaxed text-zinc-400">
          {selectedAgent.command}
        </code>
      </div>
    </aside>
  )
}
