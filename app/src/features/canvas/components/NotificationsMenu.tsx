import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Bell } from 'lucide-react'
import { useDeferredExpansionPanel } from '../hooks/useDeferredExpansionPanel'

const BUTTON_HEIGHT_AND_GAP = 52

type NotificationsMenuProps = {
  open: boolean
  notificationCount: number
  onToggle: () => void
  children?: (ready: boolean, panelRef: (node: HTMLDivElement | null) => void) => ReactNode
  /** Reports the trigger's total on-screen height (button + open panel, if
   *  any) every time it changes, so callers can reserve exactly that much
   *  space instead of guessing a fixed offset that breaks once the panel's
   *  own content (e.g. a growing notification list) makes it taller. */
  onHeightChange?: (height: number) => void
}

/** Bell trigger anchored top-right, above the minimap — the panel opens
 *  below it and pushes the minimap down instead of covering it. */
export function NotificationsMenu({
  open,
  notificationCount,
  onToggle,
  children,
  onHeightChange,
}: NotificationsMenuProps) {
  const {
    panelReady,
    preparePanel,
    resetPanel,
    markPanelReady,
  } = useDeferredExpansionPanel(open)
  // The panel (rendered by `children`) is `position: absolute` so it never
  // pushes the bell button around — which also means it never contributes to
  // a parent's flow height. A callback ref is handed straight to the panel's
  // own root element (not a wrapper div around it) so its *real* rendered
  // height — including however many notifications currently fill the list —
  // can be measured directly, instead of guessing a fixed number that breaks
  // the moment the list grows past it.
  const [panelElement, setPanelElement] = useState<HTMLDivElement | null>(null)
  const panelRef = useCallback((node: HTMLDivElement | null) => {
    setPanelElement(node)
  }, [])

  useEffect(() => {
    if (!onHeightChange) return
    if (!open || !panelElement) {
      onHeightChange(BUTTON_HEIGHT_AND_GAP)
      return
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) onHeightChange(BUTTON_HEIGHT_AND_GAP + entry.contentRect.height)
    })
    observer.observe(panelElement)
    return () => observer.disconnect()
  }, [onHeightChange, open, panelElement])

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
    <div className="fixed right-4 top-4 z-40 inline-block">
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
      {children?.(panelReady, panelRef)}
    </div>
  )
}
