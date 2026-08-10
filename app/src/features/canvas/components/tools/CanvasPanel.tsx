import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { useExitAnimation } from '../../hooks/useExitAnimation'
import { PANEL_EXIT_MS } from '../../services/animation-timing'
import { toolbarColumnOffset } from '../toolbar-flyout'

type CanvasPanelProps = {
  title: string
  icon?: ReactNode
  onClose: () => void
  children: ReactNode
  /** Panel width as a Tailwind width class. Defaults to the standard w-80. */
  widthClassName?: string
  /** Widens the toolbar column, so the panel slides further right to clear it. */
  toolsMenuOpen?: boolean
}

/**
 * A consistent floating panel for canvas tools (projects, notes, models…).
 * Sits over the canvas without dimming it, so the board stays visible.
 * Slides in on mount and plays a brief exit animation before unmounting.
 *
 * Opens beside the toolbar rather than on top of it: the panel and the toolbar
 * are absolute siblings sharing an origin, so it offsets right by the button
 * column's width and tracks the tools menu widening with the same transition
 * the toolbar flyouts use.
 */
export function CanvasPanel({
  title,
  icon,
  onClose,
  children,
  widthClassName = 'w-80',
  toolsMenuOpen = false,
}: CanvasPanelProps) {
  const { closing, close } = useExitAnimation(PANEL_EXIT_MS, onClose)

  return (
    <div
      style={{ left: `calc(1rem + ${toolbarColumnOffset(toolsMenuOpen)}px)` }}
      className={`absolute top-16 z-20 flex max-h-[80vh] ${widthClassName} max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-lg border border-white/10 bg-zinc-900 shadow-2xl transition-[left] duration-[620ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${
        closing ? 'felixo-anim-panel-out' : 'felixo-anim-panel-in'
      }`}
    >
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <span className="flex items-center gap-2 text-sm font-medium text-zinc-100">
          {icon}
          {title}
        </span>
        <button
          type="button"
          onClick={close}
          className="felixo-btn-icon rounded p-1 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
          aria-label="Fechar"
        >
          <X size={15} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">{children}</div>
    </div>
  )
}
