import type { ReactNode } from 'react'
import { Bell } from 'lucide-react'
import { useDeferredExpansionPanel } from '../hooks/useDeferredExpansionPanel'

type NotificationsMenuProps = {
  open: boolean
  notificationCount: number
  onToggle: () => void
  children?: (ready: boolean) => ReactNode
}

/** Toolbar trigger that uses the same deferred expansion sequence as tools. */
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
    }
    onToggle()
  }

  return (
    <div
      className={`relative transition-[width] duration-[420ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${
        open ? 'w-[18.5rem]' : 'w-36'
      }`}
      onTransitionEnd={(event) => {
        if (event.target === event.currentTarget && event.propertyName === 'width' && open) {
          markPanelReady()
        }
      }}
    >
      <button
        type="button"
        onClick={toggle}
        className={`felixo-btn flex !w-full items-center gap-2 rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-100 shadow-lg ring-1 ring-white/10 hover:bg-zinc-700 ${
          notificationCount > 0 ? 'border border-red-500/80 ring-red-500/30' : ''
        }`}
        title="Notificações dos agentes"
        aria-expanded={open}
      >
        <Bell size={16} className="shrink-0" />
        <span className="min-w-0 flex-1 truncate text-left">Notificações</span>
        {notificationCount > 0 && (
          <span
            className="absolute -right-3 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow ring-2 ring-zinc-950"
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
