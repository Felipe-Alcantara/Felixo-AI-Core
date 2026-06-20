import type { ReactNode } from 'react'
import { X } from 'lucide-react'

type CanvasPanelProps = {
  title: string
  icon?: ReactNode
  onClose: () => void
  children: ReactNode
}

/**
 * A consistent floating panel for canvas tools (projects, notes, models…).
 * Sits over the canvas without dimming it, so the board stays visible.
 */
export function CanvasPanel({ title, icon, onClose, children }: CanvasPanelProps) {
  return (
    <div className="absolute left-4 top-16 z-20 flex max-h-[80vh] w-80 flex-col overflow-hidden rounded-lg border border-white/10 bg-zinc-900 shadow-2xl">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <span className="flex items-center gap-2 text-sm font-medium text-zinc-100">
          {icon}
          {title}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
          aria-label="Fechar"
        >
          <X size={15} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">{children}</div>
    </div>
  )
}
