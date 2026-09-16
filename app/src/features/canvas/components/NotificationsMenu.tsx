import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Bell } from 'lucide-react'
import { useDeferredExpansionPanel } from '../hooks/useDeferredExpansionPanel'

const BUTTON_HEIGHT_AND_GAP = 52

type NotificationsMenuProps = {
  open: boolean
  notificationCount: number
  onToggle: () => void
  children?: (
    ready: boolean,
    panelRef: (node: HTMLDivElement | null) => void,
    dismiss: () => void,
  ) => ReactNode
  /** Reports the trigger's total on-screen height (button + open panel, if
   *  any) every time it changes, so callers can reserve exactly that much
   *  space instead of guessing a fixed offset that breaks once the panel's
   *  own content (e.g. a growing notification list) makes it taller. */
  onHeightChange?: (height: number) => void
}

/** Bell trigger anchored to the canvas container, alongside the inspector.
 *
 * The panel opens horizontally to the left, keeping the command bar and
 * inspector clear. This must be absolute rather than fixed: the canvas can share the
 * window with another screen/pane (such as Chat).
 */
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

  const dismiss = useCallback(() => {
    if (!open) return
    resetPanel()
    onToggle()
    window.requestAnimationFrame(() =>
      document.querySelector<HTMLElement>('[data-notifications-trigger]')?.focus(),
    )
  }, [onToggle, open, resetPanel])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key !== 'Escape' ||
        !event.target ||
        (!document.querySelector('[data-notifications-trigger]')?.contains(event.target as Node) &&
          !panelElement?.contains(event.target as Node))
      ) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      dismiss()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [dismiss, open, panelElement])

  useEffect(() => {
    if (!open || !panelElement) return
    // Move focus as soon as the panel is mounted. The frame below keeps the
    // behavior stable when an opening animation or Electron's pointer event
    // dispatch puts focus back on the trigger in the same tick.
    panelElement.focus()
    const frame = window.requestAnimationFrame(() => {
      panelElement.focus()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [open, panelElement])

  return (
    <div className="felixo-notifications-trigger absolute top-4 z-40 inline-block">
      <button
        type="button"
        onClick={toggle}
        className={`felixo-btn-icon flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-800 text-zinc-100 shadow-lg ring-1 ring-white/10 hover:bg-zinc-700 ${
          notificationCount > 0
            ? 'border border-[color-mix(in_srgb,var(--color-error)_38%,transparent)] ring-[color-mix(in_srgb,var(--color-error)_38%,transparent)] shadow-black/40'
            : ''
        }`}
        title="Notificações dos agentes"
        aria-label="Notificações dos agentes"
        aria-expanded={open}
        aria-controls="canvas-notifications-panel"
        data-notifications-trigger
      >
        <Bell size={16} />
        {notificationCount > 0 && (
          <span
            className="pointer-events-none absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--color-error)] px-1 text-[10px] font-bold text-[var(--f-core-black-deep)] shadow ring-2 ring-[var(--f-core-black-deep)] animate-pulse"
            aria-label={`${notificationCount} novas notificações`}
          >
            {notificationCount}
          </span>
        )}
      </button>
      {children?.(panelReady, panelRef, dismiss)}
    </div>
  )
}
