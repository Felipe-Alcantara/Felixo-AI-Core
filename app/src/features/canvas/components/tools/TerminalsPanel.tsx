import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { Node } from '@xyflow/react'
import {
  FileText,
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
  previewIndex,
  rowShift,
} from './terminals-panel-reorder'

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
}

function elementTitle(node: Node<CanvasNodeData>) {
  const data = node.data ?? {}
  return (
    data.label ||
    data.command ||
    data.fileName ||
    `${node.type ?? 'Bloco'} ${node.id.slice(0, 6)}`
  )
}

/**
 * Fixed, always-on dock (not a toggleable tool panel) listing every block
 * currently on the canvas — terminais, notas, arquivos e grupos —, numbered
 * in the user's own order — matches the "#N" badge shown on each terminal's
 * header. Renders nothing when the canvas is empty.
 *
 * Clicking a row centers it on the canvas and, for terminals, opens the side
 * drawer ready to type (other block types already show their content inline
 * on the canvas card, so focusing is enough). Shift+Arrow Up/Down navigate
 * the list from anywhere on screen, regardless of which window/element has
 * focus, and immediately focus + expand the newly selected block.
 *
 * Rows can be dragged (by the grip, or by Alt+Arrow from the keyboard) to
 * pick which block is 1st, 2nd, … — the order is the canvas node order, so
 * the terminals' "#N" badges renumber to match and the choice is persisted.
 */
export function TerminalsPanel({
  nodes,
  activeTerminalId,
  onFocusNode,
  onExpandNode,
  onReorder,
}: TerminalsPanelProps) {
  const elements = nodes.filter((node) => node.type != null)
  const [rawActiveIndex, setActiveIndex] = useState(0)
  // "Enviar em massa": shows a text field + send button under every terminal
  // row, so each one can get its own message fired off independently instead
  // of opening each terminal's drawer to type into it one at a time. Drafts
  // live here (not inside each row) so the header's "Enviar todas" button can
  // flush every non-empty draft in one click.
  const [composeMode, setComposeMode] = useState(false)
  const [drafts, setDrafts] = useState<TerminalDrafts>({})
  // Reorder-by-drag, driven by pointer events rather than HTML5 drag-and-drop:
  // the row must travel INSIDE the dock, pushing its neighbours aside, instead
  // of the browser's floating "ghost" image that detaches from the panel and
  // can be dropped anywhere on screen.
  //
  // `drag` holds the row being moved, the measured row boxes (taken once, at
  // drag start — rows only *translate* during the drag, so re-measuring would
  // feed the moved positions back into the math), how far the pointer has
  // travelled vertically, and where the row currently belongs.
  const [drag, setDrag] = useState<{
    fromIndex: number
    toIndex: number
    offsetY: number
    rects: { top: number; height: number }[]
  } | null>(null)
  const store = useTerminalSessions()
  const listRef = useRef<HTMLUListElement>(null)
  /** Pointer Y where the current drag began, so moves are a pure delta. */
  const dragStartYRef = useRef(0)

  const setDraft = (nodeId: string, text: string) => {
    setDrafts((current) => ({ ...current, [nodeId]: text }))
  }

  const sendDraft = (nodeId: string) => {
    const trimmed = drafts[nodeId]?.trim()
    if (!trimmed) {
      return
    }
    store.sendText(nodeId, toSubmittedTerminalText(trimmed))
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
    const next = nextActiveIndex(activeIndex, delta, elements.length)
    setActiveIndex(next)
    activateNode(elements[next])
    if (refocusList) {
      window.requestAnimationFrame(() => listRef.current?.focus())
    }
  }

  /**
   * Grabs a row. Measures every row once here (see `drag` above) so the move
   * math and the neighbours' shifts both work off the pre-drag layout.
   */
  const startDrag = (index: number, event: ReactPointerEvent<HTMLElement>) => {
    const list = listRef.current
    if (!list || event.button !== 0) {
      return
    }
    const rects = Array.from(list.querySelectorAll('[data-element-row]')).map((row) => {
      const box = row.getBoundingClientRect()
      return { top: box.top, height: box.height }
    })
    if (rects.length !== elements.length) {
      return
    }
    // Keeps receiving move/up events even when the pointer outruns the row
    // (fast drags) or leaves the dock entirely.
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
    setDrag({ fromIndex: index, toIndex: index, offsetY: 0, rects })
    dragStartYRef.current = event.clientY
  }

  const updateDrag = (event: ReactPointerEvent<HTMLElement>) => {
    setDrag((current) => {
      if (!current) {
        return current
      }
      const { rects, fromIndex } = current
      // The row never leaves the list: its travel is capped at the top of the
      // first row and the bottom of the last one.
      const first = rects[0]
      const last = rects[rects.length - 1]
      const own = rects[fromIndex]
      const offsetY = clamp(
        event.clientY - dragStartYRef.current,
        first.top - own.top,
        last.top + last.height - (own.top + own.height),
      )
      const toIndex = draggedRowIndex(own.top + own.height / 2 + offsetY, fromIndex, rects)
      return toIndex === current.toIndex && offsetY === current.offsetY
        ? current
        : { ...current, offsetY, toIndex }
    })
  }

  /** Drops the row where it currently sits, keeping the highlight (and the
   * keyboard cursor) on the block that moved. */
  const endDrag = () => {
    if (drag && drag.toIndex !== drag.fromIndex) {
      onReorder(
        elements[drag.fromIndex].id,
        elements[drag.toIndex].id,
        drag.toIndex > drag.fromIndex ? 'after' : 'before',
      )
      setActiveIndex(drag.toIndex)
    }
    setDrag(null)
  }

  /** Keyboard equivalent of dragging: Alt+Arrow moves the ACTIVE row itself
   * (Shift+Arrow moves the cursor between rows). */
  const moveActiveRow = (delta: number) => {
    const to = activeIndex + delta
    if (to < 0 || to >= elements.length) {
      return
    }
    // Swapping with the neighbour = landing on the far side of it.
    onReorder(elements[activeIndex].id, elements[to].id, delta > 0 ? 'after' : 'before')
    setActiveIndex(to)
  }

  // Always holds the latest moveActive so the window-level listener (mounted
  // once, below) never closes over stale elements/activeIndex values.
  const moveActiveRef = useRef(moveActive)
  useEffect(() => {
    moveActiveRef.current = moveActive
  })

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
    <div data-terminals-dock className="absolute bottom-4 right-4 z-20 flex max-h-[60vh] w-80 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-lg border border-white/10 bg-zinc-900 shadow-2xl">
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2 text-sm font-medium text-zinc-100">
        <TerminalIcon size={15} />
        Elementos
        <span className="ml-auto text-xs font-normal text-zinc-500">
          {elements.length}
        </span>
        <button
          type="button"
          onClick={() => setComposeMode((current) => !current)}
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
        <div className="border-b border-white/10 px-3 py-2">
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
        tabIndex={0}
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
        className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-auto p-1.5 outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-emerald-500/50"
      >
        {elements.map((node, index) => (
          <ElementRow
            key={node.id}
            node={node}
            // While a row is in flight the badges preview the order it would
            // land in, so "#1" is already on the row that will be first.
            index={(drag ? previewIndex(index, drag.fromIndex, drag.toIndex) : index) + 1}
            active={index === activeIndex}
            dragging={drag?.fromIndex === index}
            // The dragged row follows the pointer; the ones it passes slide
            // out of the way by exactly one row height.
            translateY={
              drag
                ? drag.fromIndex === index
                  ? drag.offsetY
                  : rowShift(index, drag.fromIndex, drag.toIndex, drag.rects)
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
            onGrabPointerDown={(event) => startDrag(index, event)}
            onGrabPointerMove={updateDrag}
            onGrabPointerUp={endDrag}
          />
        ))}
      </ul>
    </div>
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
          : 'transition-transform duration-150'
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
