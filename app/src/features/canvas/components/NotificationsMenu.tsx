import type { ReactNode } from 'react'
import { Bell } from 'lucide-react'
import { useDeferredExpansionPanel } from '../hooks/useDeferredExpansionPanel'

type NotificationsMenuProps = {
  open: boolean
  notificationCount: number
  onToggle: () => void
  children?: (ready: boolean) => ReactNode
}

/** Bell trigger anchored top-right, above the minimap — the panel opens
 *  below it and pushes the minimap down instead of covering it. */
export function NotificationsMenu({
  open,
  notificationCount,
  onToggle,
  children,
}: NotificationsMenuProps) {
  const {
    panelReady,
    preparePanel,
    resetPanel,
    markPanelReady,
  } = useDeferredExpansionPanel(open)

  const toggle = () => {
    if (open) {
      resetPanel()
    } else {
      preparePanel()
      // No width transition to key off here; the panel is ready as soon as it mounts.
      markPanelReady()
    }
    onToggle()
  }

  return (
    <div className="fixed right-4 top-4 z-40">
      <button
        type="button"
        onClick={toggle}
        className={`felixo-btn-icon flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-800 text-zinc-100 shadow-lg ring-1 ring-white/10 hover:bg-zinc-700 ${
          notificationCount > 0
            ? 'border border-red-500/80 ring-red-500/30 shadow-red-950/40'
            : ''
        }`}
        title="Notificações dos agentes"
        aria-label="Notificações dos agentes"
        aria-expanded={open}
      >
        <Bell size={16} />
        {notificationCount > 0 && (
          <span
            className="pointer-events-none absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow ring-2 ring-zinc-950 animate-pulse"
            aria-label={`${notificationCount} novas notificações`}
          >
            {notificationCount}
          </span>
        )}
      </button>
      {children?.(panelReady)}
    </div>
  )
}
