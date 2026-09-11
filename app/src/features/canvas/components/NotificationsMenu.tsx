import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Bell } from 'lucide-react'
import { useDeferredExpansionPanel } from '../hooks/useDeferredExpansionPanel'

const BUTTON_HEIGHT_AND_GAP = 52

/** Margem direita do próprio Mini Map (`!mr-4` em CanvasView.tsx). */
const MINIMAP_RIGHT_MARGIN = 16
/** Folga entre o sino e a borda esquerda do Mini Map. */
const BELL_TO_MINIMAP_GAP = 12
/** Deslocamento quando não há Mini Map pra clarear (sumiu por falta de espaço). */
const BELL_OFFSET_WITHOUT_MINIMAP = MINIMAP_RIGHT_MARGIN + BELL_TO_MINIMAP_GAP

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
  /**
   * Largura atual do Mini Map (`miniMapSize(...).width`), ou `null` quando
   * ele sumiu por falta de espaço. Antes o sino usava um deslocamento fixo
   * (228px) calibrado pro tamanho padrão do mapa — se ele encolhesse ou
   * sumisse, o gap entre os dois só crescia (nunca sobrepôs, mas também
   * nunca acompanhou o mapa de verdade).
   */
  minimapWidth?: number | null
}

/** Bell trigger anchored to the canvas container, above the minimap.
 *
 * The panel opens horizontally to the left, keeping the minimap's corner
 * clear. This must be absolute rather than fixed: the canvas can share the
 * window with another screen/pane (such as Chat).
 */
export function NotificationsMenu({
  open,
  notificationCount,
  onToggle,
  children,
  onHeightChange,
  minimapWidth = null,
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

  const rightOffset =
    minimapWidth != null
      ? minimapWidth + MINIMAP_RIGHT_MARGIN + BELL_TO_MINIMAP_GAP
      : BELL_OFFSET_WITHOUT_MINIMAP

  return (
    <div
      className="absolute top-4 z-40 inline-block transition-[right] duration-200 ease-out"
      style={{ right: rightOffset }}
    >
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
