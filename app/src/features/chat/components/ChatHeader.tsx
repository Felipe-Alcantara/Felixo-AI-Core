import { Eraser, MessageCircle } from 'lucide-react'
import type { Agent } from '../types'

type ChatHeaderProps = {
  selectedAgent: Agent
  runtimeLabel: string
  onClear: () => void
}

export function ChatHeader({
  selectedAgent,
  runtimeLabel,
  onClear,
}: ChatHeaderProps) {
  return (
    <header className="flex shrink-0 items-center justify-between gap-4 border-b border-white/10 px-5 py-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-2xl border border-violet-200/20 bg-violet-200/10 text-violet-100">
            <MessageCircle size={18} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold text-white">
              Felixo Core
            </h1>
            <p className="truncate text-xs text-zinc-500">
              {selectedAgent.name} · {runtimeLabel}
            </p>
          </div>
        </div>
      </div>

      <button
        type="button"
        title="Limpar conversa"
        onClick={onClear}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-zinc-300 transition hover:bg-white/[0.08] focus:outline-none focus:ring-2 focus:ring-violet-200/50"
      >
        <Eraser size={17} aria-hidden="true" />
        <span className="sr-only">Limpar conversa</span>
      </button>
    </header>
  )
}
