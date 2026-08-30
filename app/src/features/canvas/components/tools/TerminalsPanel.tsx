import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { Node } from '@xyflow/react'
import { useCanvasSurfaces } from '../../hooks/canvas-surfaces-context'
import {
  ChevronDown,
  ChevronUp,
  FileText,
  Globe,
  GripVertical,
  Group,
  Loader2,
  MessagesSquare,
  Send,
  StickyNote,
  Terminal as TerminalIcon,
} from 'lucide-react'
import {
  useSessionSnapshot,
  useTerminalSessions,
} from '../../terminal/terminal-session-context'
import { toSubmittedTerminalText } from '../../terminal/terminal-input'
import type { SessionActivity } from '../../terminal/terminal-session-store'
import type { CanvasNodeData, CanvasNodeType } from '../../types'
import { nextActiveIndex, shouldHandleGlobalShiftArrow } from './terminals-panel-navigation'
import { pendingDraftNodeIds, type TerminalDrafts } from './terminals-panel-drafts'
import {
  clamp,
  draggedRowIndex,
  moveById,
  rowShift,
} from './terminals-panel-reorder'
import {
  canReorderDockRows,
  dockGroupRange,
  groupDockElements,
} from './terminals-panel-groups'
import {
  browserStorage,
  readDockCollapsed,
  writeDockCollapsed,
} from './terminals-panel-collapse'

type TerminalsPanelProps = {
  nodes: Node<CanvasNodeData>[]
  /** The terminal currently open in the side drawer (`CanvasView`'s
   * `expandedTerminalId`), however it got opened — including a direct click
   * on the terminal's card on the canvas, which bypasses this list entirely.
   * Keeps the highlighted row in sync with that case. */
  activeTerminalId: string | null
  /** Centers/zooms the canvas on a block and selects it. */
  onFocusNode: (nodeId: string) => void
  /** Opens the terminal's side drawer, ready to type. No-op for other block types. */
  onExpandNode: (nodeId: string) => void
  /** Moves `nodeId` so it lands immediately before/after `targetId` in the
   * canvas node order. Ids, not indices: the dock renders a filtered view of
   * `nodes`, so its row indices are not guaranteed to be node array indices. */
  onReorder: (nodeId: string, targetId: string, edge: 'before' | 'after') => void
  /** Reports this dock's real rendered height (puck or expanded list, either
   *  way) every time it changes, so other floating panels anchored to the
   *  same bottom-right corner — or growing down toward it, like the
   *  notifications panel — can cap themselves before reaching it. */
  onHeightChange?: (height: number) => void
}

const ACTIVITY_DOT_CLASS: Record<SessionActivity, string> = {
  starting: 'bg-amber-400',
  working: 'bg-sky-400',
  waiting_approval: 'bg-amber-400',
  idle: 'bg-emerald-400',
  exited: 'bg-zinc-600',
  error: 'bg-red-400',
}

const TYPE_ICON: Record<CanvasNodeType, typeof TerminalIcon> = {
  terminal: TerminalIcon,
  note: StickyNote,
  file: FileText,
  group: Group,
  webpage: Globe,
}

function elementTitle(node: Node<CanvasNodeData>) {
  const data = node.data ?? {}
  return (
    data.label ||
    data.command ||
    data.fileName ||
    data.url ||
    `${node.type ?? 'Bloco'} ${node.id.slice(0, 6)}`
  )
}

/**
 * Fixed, always-on dock (not a toggleable tool panel) listing every block
 * currently on the canvas — terminais, notas, arquivos e grupos —, grouped
 * visually by working folder and numbered in the user's own flat order —
 * matches the "#N" badge shown on each terminal's header. Renders nothing when
 * the canvas is empty.
 *
 * Clicking a row centers it on the canvas and, for terminals, opens the side
 * drawer ready to type (other block types already show their content inline
 * on the canvas card, so focusing is enough). Shift+Arrow Up/Down navigate
 * the list from anywhere on screen, regardless of which window/element has
 * focus, and immediately focus + expand the newly selected block.
 *
 * Rows can be dragged (by the grip, or by Alt+Arrow from the keyboard) to
 * pick which block is 1st, 2nd, … inside its folder — the order is still the
 * canvas node order, so the terminals' "#N" badges renumber to match and the
 * choice is persisted. A folder header is visual only and never participates
 * in the list indices.
 */
export function TerminalsPanel({
  nodes,
  activeTerminalId,
  onFocusNode,
  onExpandNode,
  onReorder,
  onHeightChange,
}: TerminalsPanelProps) {
  const elements = useMemo(() => nodes.filter((node) => node.type != null), [nodes])
  const dockGroups = useMemo(() => groupDockElements(elements), [elements])
  const showRepositoryHeaders = dockGroups.length > 1
  const dockRows = useMemo(
    () =>
      dockGroups.flatMap((group) =>
        group.nodes.map((entry) => ({ ...entry, groupKey: group.key })),
      ),
    [dockGroups],
  )
  const dockRowIndexById = useMemo(
    () => new Map(dockRows.map((row, rowIndex) => [row.node.id, rowIndex])),
    [dockRows],
  )
  const [rawActiveIndex, setActiveIndex] = useState(0)
  // "Enviar em massa": shows a text field + send button under every terminal
  // row, so each one can get its own message fired off independently instead
  // of opening each terminal's drawer to type into it one at a time. Drafts
  // live here (not inside each row) so the header's "Enviar todas" button can
  // flush every non-empty draft in one click.
  const [composeMode, setComposeMode] = useState(false)
  // Collapsed the dock is just its title bar, so the canvas' bottom-right
  // corner stays usable. The choice is remembered across sessions.
  const [collapsed, setCollapsed] = useState(() => readDockCollapsed(browserStorage()))
  const [drafts, setDrafts] = useState<TerminalDrafts>({})
  // Reorder-by-drag, driven by pointer events rather than HTML5 drag-and-drop:
  // the row must travel INSIDE the dock, pushing its neighbours aside, instead
  // of the browser's floating "ghost" image that detaches from the panel and
  // can be dropped anywhere on screen.
  //
  // `drag` holds the visual row being moved, the measured row boxes (taken once,
  // at drag start — rows only *translate* during the drag, so re-measuring would
  // feed the moved positions back into the math), how far the pointer has
  // travelled vertically, and where the row currently belongs. Visual row
  // indices are separate from the flat canvas indices because headers and
  // grouped folders are presentation only.
  const [drag, setDrag] = useState<{
    fromRowIndex: number
    toRowIndex: number
    offsetY: number
    rects: { top: number; height: number }[]
  } | null>(null)
  const store = useTerminalSessions()
  const listRef = useRef<HTMLUListElement>(null)
  /** Pointer Y where the current drag began, so moves are a pure delta. */
  const dragStartYRef = useRef(0)

  const setCollapsedPreference = (next: boolean) => {
    setCollapsed(next)
    writeDockCollapsed(next, browserStorage())
  }

  const toggleCollapsed = () => setCollapsedPreference(!collapsed)

  const setDraft = (nodeId: string, text: string) => {
    setDrafts((current) => ({ ...current, [nodeId]: text }))
  }

  const sendDraft = (nodeId: string) => {
    const trimmed = drafts[nodeId]?.trim()
    if (!trimmed) {
      return
    }
    store.sendText(nodeId, toSubmittedTerminalText(trimmed), { kind: 'catalog-prompt' })
    setDrafts((current) => ({ ...current, [nodeId]: '' }))
  }

  const pendingIds = pendingDraftNodeIds(drafts)
  const sendAllDrafts = () => {
    pendingIds.forEach(sendDraft)
  }

  // Clamped at read-time (not synced via effect) so a block closing never
  // leaves the highlight pointing past the end of the list.
  const activeIndex = Math.min(rawActiveIndex, elements.length - 1)

  // Bug fix: clicking a terminal's card directly on the canvas opens its
  // drawer (`CanvasView` sets `expandedTerminalId`) without going through
  // this list at all, so the list's own `rawActiveIndex` — only ever written
  // by this component's own click/keyboard handlers — went stale and kept
  // highlighting whatever was last active *through the list*. Adjusted here
  // during render, comparing against a STATE snapshot of the previous prop
  // (not a ref — mutating a ref during render is unsafe for the React
  // Compiler) whenever the externally-driven `activeTerminalId` changes, so
  // both navigation paths — clicking the canvas vs. clicking/arrowing the
  // list — agree on which row is active. This is React's documented pattern
  // for adjusting state from a prop change without an effect (which would
  // set state one render late and flash the wrong row first).
  const [previousActiveTerminalId, setPreviousActiveTerminalId] = useState(activeTerminalId)
  if (activeTerminalId !== previousActiveTerminalId) {
    setPreviousActiveTerminalId(activeTerminalId)
    if (activeTerminalId) {
      const index = elements.findIndex((node) => node.id === activeTerminalId)
      if (index !== -1) {
        setActiveIndex(index)
      }
    }
  }

  const activateNode = (node: Node<CanvasNodeData>) => {
    onFocusNode(node.id)
    if (node.type === 'terminal') {
      onExpandNode(node.id)
    }
  }

  /**
   * `refocusList` keeps continuous Up/Down presses landing on the dock
   * (fighting the drawer's own auto-focus-for-typing) when the user is
   * already browsing the dock with the keyboard. It must stay false for the
   * global shortcut: stealing focus back into this (visually tiny) list
   * after switching away from a terminal the user was typing in would trap
   * their next keystrokes here instead of in the newly focused element.
   */
  const moveActive = (delta: number, refocusList: boolean) => {
    const currentRowIndex = dockRows.findIndex((row) => row.index === activeIndex)
    if (currentRowIndex === -1) {
      return
    }
    const nextRowIndex = nextActiveIndex(currentRowIndex, delta, dockRows.length)
    const nextRow = dockRows[nextRowIndex]
    if (!nextRow) {
      return
    }
    setActiveIndex(nextRow.index)
    activateNode(nextRow.node)
    if (refocusList) {
      window.requestAnimationFrame(() => listRef.current?.focus())
    }
  }

  /**
   * Reorders two visual rows only when they belong to the same folder. The
   * callback still receives ids, and the resulting active index is calculated
   * against the flat list that the canvas persists.
   */
  const reorderDockRows = (fromRowIndex: number, toRowIndex: number) => {
    if (fromRowIndex === toRowIndex) {
      return
    }
    const from = dockRows[fromRowIndex]
    const to = dockRows[toRowIndex]
    if (!from || !to || !canReorderDockRows(dockRows, fromRowIndex, toRowIndex)) {
      return
    }

    const edge = toRowIndex > fromRowIndex ? 'after' : 'before'
    const moved = moveById(elements, from.node.id, to.node.id, edge)
    if (moved === elements) {
      return
    }

    onReorder(from.node.id, to.node.id, edge)
    const movedIndex = moved.findIndex((node) => node.id === from.node.id)
    if (movedIndex !== -1) {
      setActiveIndex(movedIndex)
    }
  }

  /**
   * Grabs a row. Measures every row once here (see `drag` above) so the move
   * math and the neighbours' shifts both work off the pre-drag layout.
   */
  const startDrag = (rowIndex: number, event: ReactPointerEvent<HTMLElement>) => {
    const list = listRef.current
    if (!list || event.button !== 0 || !dockRows[rowIndex]) {
      return
    }
    const rects = Array.from(list.querySelectorAll('[data-element-row]')).map((row) => {
      const box = row.getBoundingClientRect()
      return { top: box.top, height: box.height }
    })
    if (rects.length !== dockRows.length) {
      return
    }
    // Keeps receiving move/up events even when the pointer outruns the row
    // (fast drags) or leaves the dock entirely.
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
    setDrag({ fromRowIndex: rowIndex, toRowIndex: rowIndex, offsetY: 0, rects })
    dragStartYRef.current = event.clientY
  }

  const updateDrag = (event: ReactPointerEvent<HTMLElement>) => {
    setDrag((current) => {
      if (!current) {
        return current
      }
      const { rects, fromRowIndex } = current
      const source = dockRows[fromRowIndex]
      const own = rects[fromRowIndex]
      if (!source || !own) {
        return current
      }

      // The visual group is contiguous even when the persisted flat list was
      // interleaved. Clamping to its first/last row makes a pointer over a
      // different folder's header a no-op instead of a cross-folder reorder.
      const groupRange = dockGroupRange(dockRows, fromRowIndex)
      const groupStart = groupRange?.start ?? -1
      const groupEnd = groupRange?.end ?? -1
      const first = rects[groupStart]
      const last = rects[groupEnd]
      if (!first || !last || groupStart === -1 || groupEnd === -1) {
        return current
      }

      // The row never leaves the list: its travel is capped at the top of the
      // first and last row of its folder, including the header gap between
      // folders in the measured layout.
      const offsetY = clamp(
        event.clientY - dragStartYRef.current,
        first.top - own.top,
        last.top + last.height - (own.top + own.height),
      )
      const toRowIndex = clamp(
        draggedRowIndex(own.top + own.height / 2 + offsetY, fromRowIndex, rects),
        groupStart,
        groupEnd,
      )
      return toRowIndex === current.toRowIndex && offsetY === current.offsetY
        ? current
        : { ...current, offsetY, toRowIndex }
    })
  }

  /** Drops the row where it currently sits, keeping the highlight (and the
   * keyboard cursor) on the block that moved. */
  const endDrag = () => {
    if (drag) {
      reorderDockRows(drag.fromRowIndex, drag.toRowIndex)
    }
    setDrag(null)
  }

  /** Keyboard equivalent of dragging: Alt+Arrow moves the ACTIVE row itself
   * (Shift+Arrow moves the cursor between rows). */
  const moveActiveRow = (delta: number) => {
    const fromRowIndex = dockRows.findIndex((row) => row.index === activeIndex)
    const toRowIndex = fromRowIndex + delta
    if (fromRowIndex < 0 || toRowIndex < 0 || toRowIndex >= dockRows.length) {
      return
    }
    reorderDockRows(fromRowIndex, toRowIndex)
  }

  // Always holds the latest moveActive so the window-level listener (mounted
  // once, below) never closes over stale elements/activeIndex values.
  const moveActiveRef = useRef(moveActive)
  useEffect(() => {
    moveActiveRef.current = moveActive
  })

  const [dockElement, setDockElement] = useState<HTMLDivElement | null>(null)
  const dockRef = useCallback((node: HTMLDivElement | null) => {
    setDockElement(node)
  }, [])

  const { reportDockTop } = useCanvasSurfaces()

  useEffect(() => {
    if (elements.length === 0 || !dockElement) {
      onHeightChange?.(0)
      // Sem dock não há piso: o painel da esquerda volta a usar a tela toda.
      reportDockTop(Number.POSITIVE_INFINITY)
      return
    }

    const publicar = () => {
      onHeightChange?.(dockElement.getBoundingClientRect().height)
      // O topo do dock, e não a altura, é o que o painel da esquerda precisa
      // saber para parar antes dele.
      reportDockTop(dockElement.getBoundingClientRect().top)
    }

    publicar()
    const observer = new ResizeObserver(publicar)
    observer.observe(dockElement)
    window.addEventListener('resize', publicar)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', publicar)
    }
  }, [onHeightChange, elements.length, dockElement, reportDockTop])

  useEffect(() => {
    const onWindowKeyDown = (event: KeyboardEvent) => {
      if (!event.shiftKey) return
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
      if (!shouldHandleGlobalShiftArrow(event.target)) return
      event.preventDefault()
      // Also stop it from reaching the terminal: xterm's own keydown handler
      // (registered directly on its textarea) unconditionally cancels arrow
      // keys AND still forwards them to the shell (e.g. command-history
      // recall) unless propagation is stopped before the event gets there.
      event.stopPropagation()
      moveActiveRef.current(event.key === 'ArrowDown' ? 1 : -1, false)
    }
    // Capture phase, not bubble: xterm.js attaches its own keydown handler
    // directly on the terminal's hidden textarea and calls stopPropagation
    // for most keys (including Shift+Arrow) as part of its own key handling.
    // A bubble-phase listener on `window` never sees that event once a
    // terminal has focus. A capture-phase listener on `window` runs before
    // the event reaches the textarea, so it always sees it first.
    window.addEventListener('keydown', onWindowKeyDown, true)
    return () => window.removeEventListener('keydown', onWindowKeyDown, true)
  }, [])

  // The dock is grouped visually, but the badge still represents the flat
  // persisted canvas order. During a drag, preview that same order by id so a
  // folder with interleaved source indices does not show misleading numbers.
  const dragPreviewIndexes = useMemo(() => {
    if (!drag) {
      return null
    }
    const from = dockRows[drag.fromRowIndex]
    const to = dockRows[drag.toRowIndex]
    if (!from || !to || !canReorderDockRows(dockRows, drag.fromRowIndex, drag.toRowIndex)) {
      return null
    }
    const edge = drag.toRowIndex > drag.fromRowIndex ? 'after' : 'before'
    const moved = moveById(elements, from.node.id, to.node.id, edge)
    return new Map(moved.map((node, index) => [node.id, index]))
  }, [drag, dockRows, elements])

  if (elements.length === 0) {
    return null
  }

  const commitActive = () => {
    const active = elements[activeIndex]
    if (active) {
      activateNode(active)
    }
  }

  return (
    // The wrapper is only an anchor: it never eats canvas clicks, and each of
    // the two states re-enables pointer events for itself while visible.
    <div
      ref={dockRef}
      data-terminals-dock
      className="pointer-events-none absolute bottom-4 right-4 z-20"
    >
      {/* Collapsed, the dock shrinks away into this puck in the corner. Both
          states share the same bottom-right anchor, so the scale animation
          reads as the panel folding down and to the side into the button. */}
      <button
        type="button"
        onClick={toggleCollapsed}
        title="Abrir elementos"
        aria-label="Abrir elementos"
        aria-expanded={false}
        aria-hidden={!collapsed}
        tabIndex={collapsed ? 0 : -1}
        className={`felixo-btn felixo-anim-corner-puck absolute bottom-0 right-0 flex items-center gap-2 rounded-full border border-white/10 bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-100 shadow-2xl hover:bg-zinc-800 ${
          collapsed ? 'felixo-anim-corner-puck-shown' : 'felixo-anim-corner-puck-hidden'
        }`}
      >
        <TerminalIcon size={15} className="shrink-0" />
        <span className="text-xs tabular-nums text-zinc-400">{elements.length}</span>
        <ChevronUp size={14} className="shrink-0 text-zinc-400" />
      </button>

      <div
        inert={collapsed}
        className={`felixo-anim-corner-dock flex max-h-[60vh] w-80 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-lg border border-white/10 bg-zinc-900 shadow-2xl ${
          collapsed
            ? 'felixo-anim-corner-dock-collapsed'
            : 'felixo-anim-corner-dock-expanded'
        }`}
        aria-hidden={collapsed}
      >
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2 text-sm font-medium text-zinc-100">
        <button
          type="button"
          onClick={toggleCollapsed}
          title="Recolher elementos"
          aria-label="Recolher elementos"
          aria-expanded={!collapsed}
          tabIndex={collapsed ? -1 : 0}
          className="felixo-btn flex min-w-0 flex-1 items-center gap-2 rounded text-left hover:text-white"
        >
          <TerminalIcon size={15} className="shrink-0" />
          <span className="truncate">Elementos</span>
          <span className="ml-auto text-xs font-normal text-zinc-500">
            {elements.length}
          </span>
          <ChevronDown size={14} className="shrink-0 text-zinc-400" />
        </button>
        <button
          type="button"
          onClick={() => {
            // Turning compose mode on from a collapsed dock must reveal the rows.
            setComposeMode((current) => !current)
            if (collapsed) setCollapsedPreference(false)
          }}
          title="Enviar mensagens diferentes para vários terminais"
          aria-label="Alternar modo de enviar mensagens em massa"
          aria-pressed={composeMode}
          className={`felixo-btn-icon rounded p-1 hover:bg-white/10 ${
            composeMode ? 'text-emerald-400' : 'text-zinc-400'
          }`}
        >
          <MessagesSquare size={14} />
        </button>
      </div>
      {composeMode && (
        <div className="felixo-anim-sequential-panel border-b border-white/10 px-3 py-2">
          <button
            type="button"
            onClick={sendAllDrafts}
            disabled={pendingIds.length === 0}
            className="felixo-btn flex w-full items-center justify-center gap-1.5 rounded bg-emerald-700 px-2 py-1.5 text-xs font-medium text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:opacity-50"
          >
            <Send size={12} />
            Enviar para todos {pendingIds.length > 0 ? `(${pendingIds.length})` : ''}
          </button>
        </div>
      )}
      <ul
        ref={listRef}
        tabIndex={collapsed ? -1 : 0}
        onKeyDown={(event) => {
          if (event.altKey && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            event.preventDefault()
            moveActiveRow(event.key === 'ArrowDown' ? 1 : -1)
            return
          }
          if (!event.shiftKey) return
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            moveActive(1, true)
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            moveActive(-1, true)
          } else if (event.key === 'Enter') {
            event.preventDefault()
            commitActive()
          }
        }}
        className={`flex min-h-0 flex-1 flex-col gap-0.5 overflow-auto p-1.5 outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-emerald-500/50 ${
          // The stagger plays as the dock unfolds; while a row is being dragged
          // it must not re-run and fight the drag's own transform.
          collapsed || drag ? '' : 'felixo-anim-stagger-list'
        }`}
      >
        {dockGroups.map((group) => (
          <Fragment key={`repository-${group.key || 'none'}`}>
            {showRepositoryHeaders && (
              <RepositoryHeading
                label={group.label || 'Sem pasta de trabalho'}
                path={group.key}
                count={group.nodes.length}
              />
            )}
            {group.nodes.map(({ node, index }) => {
              const rowIndex = dockRowIndexById.get(node.id)
              if (rowIndex === undefined) {
                return null
              }
              return (
                <ElementRow
                  key={node.id}
                  node={node}
                  // While a row is in flight the badges preview the order it
                  // would land in, so "#1" is already on the row that will be
                  // first in the persisted canvas order.
                  index={(dragPreviewIndexes?.get(node.id) ?? index) + 1}
                  active={index === activeIndex}
                  dragging={drag?.fromRowIndex === rowIndex}
                  // The dragged row follows the pointer; the ones it passes
                  // slide out of the way by exactly one row height.
                  translateY={
                    drag
                      ? drag.fromRowIndex === rowIndex
                        ? drag.offsetY
                        : rowShift(
                            rowIndex,
                            drag.fromRowIndex,
                            drag.toRowIndex,
                            drag.rects,
                          )
                      : 0
                  }
                  composeMode={composeMode}
                  draft={drafts[node.id] ?? ''}
                  onDraftChange={(text) => setDraft(node.id, text)}
                  onSend={() => sendDraft(node.id)}
                  onSelect={() => {
                    setActiveIndex(index)
                    activateNode(node)
                  }}
                  onGrabPointerDown={(event) => startDrag(rowIndex, event)}
                  onGrabPointerMove={updateDrag}
                  onGrabPointerUp={endDrag}
                />
              )
            })}
          </Fragment>
        ))}
      </ul>
      </div>
    </div>
  )
}

function RepositoryHeading({
  label,
  path,
  count,
}: {
  label: string
  path: string
  count: number
}) {
  return (
    <li data-repository-heading role="presentation" className="px-1 pb-0.5 pt-2 first:pt-0">
      <div
        title={path || 'Blocos sem pasta de trabalho'}
        className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500"
      >
        <span className="h-px min-w-2 flex-1 bg-white/10" aria-hidden />
        <span role="heading" aria-level={3} className="max-w-[15rem] truncate">
          {label}
        </span>
        <span className="tabular-nums text-zinc-600">{count}</span>
        <span className="h-px min-w-2 flex-1 bg-white/10" aria-hidden />
      </div>
    </li>
  )
}

function ElementRow({
  node,
  index,
  active,
  dragging,
  translateY,
  composeMode,
  draft,
  onDraftChange,
  onSend,
  onSelect,
  onGrabPointerDown,
  onGrabPointerMove,
  onGrabPointerUp,
}: {
  node: Node<CanvasNodeData>
  index: number
  active: boolean
  /** This row is the one being dragged — lifted above the others. */
  dragging: boolean
  /** How far this row is currently displaced, in px: the pointer delta for
   * the dragged row, one row height for the ones making room for it. */
  translateY: number
  composeMode: boolean
  draft: string
  onDraftChange: (text: string) => void
  onSend: () => void
  onSelect: () => void
  onGrabPointerDown: (event: ReactPointerEvent<HTMLElement>) => void
  onGrabPointerMove: (event: ReactPointerEvent<HTMLElement>) => void
  onGrabPointerUp: () => void
}) {
  const isTerminal = node.type === 'terminal'
  const snapshot = useSessionSnapshot(node.id)
  const activity = snapshot?.activity ?? 'starting'
  const Icon = TYPE_ICON[(node.type as CanvasNodeType) ?? 'note']

  return (
    <li
      data-element-row
      style={{ transform: translateY ? `translateY(${translateY}px)` : undefined }}
      className={`rounded ${
        dragging
          ? // No transition on the dragged row: it must track the pointer
            // 1:1, while the rows making room animate into place.
            'relative z-10 bg-zinc-800 shadow-lg ring-1 ring-emerald-500/40'
          : 'transition-transform duration-[280ms] ease-[cubic-bezier(0.16,1,0.3,1)]'
      }`}
    >
      <div className="flex items-start">
        <span
          // Drag starts on the grip only, so clicking anywhere else in the row
          // still just focuses the block.
          onPointerDown={onGrabPointerDown}
          onPointerMove={onGrabPointerMove}
          onPointerUp={onGrabPointerUp}
          onPointerCancel={onGrabPointerUp}
          title="Arraste para reordenar (ou Alt+↑/↓)"
          aria-hidden
          className="mt-1.5 shrink-0 cursor-grab touch-none pl-1 text-zinc-600 hover:text-zinc-300 active:cursor-grabbing"
        >
          <GripVertical size={12} />
        </span>
        <button
          type="button"
          onClick={onSelect}
          title={elementTitle(node)}
          className={`felixo-btn flex w-full items-start gap-2 rounded px-2 py-1.5 text-left hover:bg-white/5 ${
            active ? 'bg-white/10' : ''
          }`}
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-black/30 text-[10px] font-semibold tabular-nums text-emerald-300">
            {index}
          </span>
          <Icon size={13} className="mt-0.5 shrink-0 text-zinc-400" />
          <span className="min-w-0 flex-1 whitespace-normal break-words text-sm text-zinc-100">
            {elementTitle(node)}
          </span>
          {isTerminal &&
            (activity === 'working' ? (
              <Loader2 size={11} className="mt-0.5 shrink-0 animate-spin text-sky-400" />
            ) : (
              <span
                className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${ACTIVITY_DOT_CLASS[activity]}`}
                title={activity}
              />
            ))}
        </button>
      </div>
      {composeMode && isTerminal && (
        <RowComposer
          terminalTitle={elementTitle(node)}
          draft={draft}
          onDraftChange={onDraftChange}
          onSend={onSend}
        />
      )}
    </li>
  )
}

/**
 * One message field per terminal, sent independently: types the text and an
 * Enter into that terminal's own PTY session, so a different message can go
 * to each agent without opening its drawer. The draft itself lives in the
 * panel (not here) so the header's "Enviar para todos" button can flush it.
 */
function RowComposer({
  terminalTitle,
  draft,
  onDraftChange,
  onSend,
}: {
  terminalTitle: string
  draft: string
  onDraftChange: (text: string) => void
  onSend: () => void
}) {
  return (
    <div className="mb-1 flex items-center gap-1 px-2 pl-12">
      <input
        value={draft}
        onChange={(event) => onDraftChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            onSend()
          }
        }}
        onClick={(event) => event.stopPropagation()}
        placeholder="Mensagem para este terminal…"
        aria-label={`Mensagem para "${terminalTitle}"`}
        className="min-w-0 flex-1 rounded bg-zinc-900 px-2 py-1 text-xs text-zinc-100 outline-none ring-1 ring-white/10 placeholder:text-zinc-600 focus:ring-emerald-500/50"
      />
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          onSend()
        }}
        disabled={!draft.trim()}
        title="Enviar"
        aria-label={`Enviar mensagem para "${terminalTitle}"`}
        className="felixo-btn-icon shrink-0 rounded bg-emerald-700 p-1 text-white hover:bg-emerald-600 disabled:opacity-40"
      >
        <Send size={12} />
      </button>
    </div>
  )
}
