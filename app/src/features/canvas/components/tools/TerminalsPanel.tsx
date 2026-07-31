import { useEffect, useRef, useState } from 'react'
import type { Node } from '@xyflow/react'
import {
  FileText,
  Group,
  Loader2,
  StickyNote,
  Terminal as TerminalIcon,
} from 'lucide-react'
import { useSessionSnapshot } from '../../terminal/terminal-session-context'
import type { SessionActivity } from '../../terminal/terminal-session-store'
import type { CanvasNodeData, CanvasNodeType } from '../../types'
import { nextActiveIndex, shouldHandleGlobalShiftArrow } from './terminals-panel-navigation'

type TerminalsPanelProps = {
  nodes: Node<CanvasNodeData>[]
  /** Centers/zooms the canvas on a block and selects it. */
  onFocusNode: (nodeId: string) => void
  /** Opens the terminal's side drawer, ready to type. No-op for other block types. */
  onExpandNode: (nodeId: string) => void
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
 * by creation order — matches the "#N" badge shown on each terminal's
 * header. Renders nothing when the canvas is empty.
 *
 * Clicking a row centers it on the canvas and, for terminals, opens the side
 * drawer ready to type (other block types already show their content inline
 * on the canvas card, so focusing is enough). Shift+Arrow Up/Down navigate
 * the list from anywhere on screen, regardless of which window/element has
 * focus, and immediately focus + expand the newly selected block.
 */
export function TerminalsPanel({ nodes, onFocusNode, onExpandNode }: TerminalsPanelProps) {
  const elements = nodes.filter((node) => node.type != null)
  const [rawActiveIndex, setActiveIndex] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)

  // Clamped at read-time (not synced via effect) so a block closing never
  // leaves the highlight pointing past the end of the list.
  const activeIndex = Math.min(rawActiveIndex, elements.length - 1)

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
      </div>
      <ul
        ref={listRef}
        tabIndex={0}
        onKeyDown={(event) => {
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
            index={index + 1}
            active={index === activeIndex}
            onSelect={() => {
              setActiveIndex(index)
              activateNode(node)
            }}
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
  onSelect,
}: {
  node: Node<CanvasNodeData>
  index: number
  active: boolean
  onSelect: () => void
}) {
  const isTerminal = node.type === 'terminal'
  const snapshot = useSessionSnapshot(node.id)
  const activity = snapshot?.activity ?? 'starting'
  const Icon = TYPE_ICON[(node.type as CanvasNodeType) ?? 'note']

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        title={elementTitle(node)}
        className={`flex w-full items-start gap-2 rounded px-2 py-1.5 text-left hover:bg-white/5 ${
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
    </li>
  )
}
