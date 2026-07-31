import { useEffect, useRef, useState } from 'react'
import type { Node } from '@xyflow/react'
import { Loader2, Terminal as TerminalIcon } from 'lucide-react'
import { useSessionSnapshot } from '../../terminal/terminal-session-context'
import type { SessionActivity } from '../../terminal/terminal-session-store'
import type { CanvasNodeData } from '../../types'

type TerminalsPanelProps = {
  nodes: Node<CanvasNodeData>[]
  /** Centers/zooms the canvas on a terminal block and selects it. */
  onFocusNode: (nodeId: string) => void
  /** Opens the terminal's side drawer, ready to type. */
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

function terminalTitle(node: Node<CanvasNodeData>) {
  const data = node.data ?? {}
  return data.label || data.command || `Terminal ${node.id.slice(0, 6)}`
}

/**
 * Fixed, always-on dock (not a toggleable tool panel) listing every terminal
 * block currently on the canvas, numbered by creation order — matches the
 * "#N" badge shown on each terminal's header. Renders nothing when the
 * canvas has no terminals.
 *
 * Clicking a row centers it on the canvas AND opens its side drawer, ready
 * to type. Arrow Up/Down (while the dock has keyboard focus) walk through
 * the list quickly — they only move the canvas focus, not the drawer, so
 * repeated presses keep landing on the dock instead of racing the drawer's
 * own auto-focus-for-typing. Enter (or a click) commits to actually opening
 * the highlighted terminal.
 */
export function TerminalsPanel({ nodes, onFocusNode, onExpandNode }: TerminalsPanelProps) {
  const terminals = nodes.filter((node) => node.type === 'terminal')
  const [rawActiveIndex, setActiveIndex] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)

  // Clamped at read-time (not synced via effect) so a terminal closing
  // never leaves the highlight pointing past the end of the list.
  const activeIndex = Math.min(rawActiveIndex, terminals.length - 1)

  const moveActive = (delta: number) => {
    const next =
      (activeIndex + delta + terminals.length) % terminals.length
    setActiveIndex(next)
    onFocusNode(terminals[next].id)
    window.requestAnimationFrame(() => listRef.current?.focus())
  }

  // Always holds the latest moveActive so the window-level listener (mounted
  // once, below) never closes over stale terminals/activeIndex values.
  const moveActiveRef = useRef(moveActive)
  moveActiveRef.current = moveActive

  useEffect(() => {
    const onWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
      const target = event.target as HTMLElement | null
      if (target?.closest('[data-terminals-dock]')) return
      if (target?.closest('input, textarea, [contenteditable="true"], .xterm')) return
      event.preventDefault()
      moveActiveRef.current(event.key === 'ArrowDown' ? 1 : -1)
    }
    window.addEventListener('keydown', onWindowKeyDown)
    return () => window.removeEventListener('keydown', onWindowKeyDown)
  }, [])

  if (terminals.length === 0) {
    return null
  }

  const commitActive = () => {
    const active = terminals[activeIndex]
    if (active) {
      onFocusNode(active.id)
      onExpandNode(active.id)
    }
  }

  return (
    <div data-terminals-dock className="absolute bottom-4 right-4 z-20 flex max-h-[60vh] w-72 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-lg border border-white/10 bg-zinc-900 shadow-2xl">
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2 text-sm font-medium text-zinc-100">
        <TerminalIcon size={15} />
        Terminais
        <span className="ml-auto text-xs font-normal text-zinc-500">
          {terminals.length}
        </span>
      </div>
      <ul
        ref={listRef}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            moveActive(1)
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            moveActive(-1)
          } else if (event.key === 'Enter') {
            event.preventDefault()
            commitActive()
          }
        }}
        className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-auto p-1.5 outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-emerald-500/50"
      >
        {terminals.map((node, index) => (
          <TerminalRow
            key={node.id}
            node={node}
            index={index + 1}
            active={index === activeIndex}
            onSelect={() => {
              setActiveIndex(index)
              onFocusNode(node.id)
              onExpandNode(node.id)
            }}
          />
        ))}
      </ul>
    </div>
  )
}

function TerminalRow({
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
  const snapshot = useSessionSnapshot(node.id)
  const activity = snapshot?.activity ?? 'starting'

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-white/5 ${
          active ? 'bg-white/10' : ''
        }`}
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-black/30 text-[10px] font-semibold tabular-nums text-emerald-300">
          {index}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-zinc-100">
          {terminalTitle(node)}
        </span>
        {activity === 'working' ? (
          <Loader2 size={11} className="shrink-0 animate-spin text-sky-400" />
        ) : (
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${ACTIVITY_DOT_CLASS[activity]}`}
            title={activity}
          />
        )}
      </button>
    </li>
  )
}
