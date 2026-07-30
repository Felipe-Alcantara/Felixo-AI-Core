import type { Node } from '@xyflow/react'
import { Loader2, Terminal as TerminalIcon } from 'lucide-react'
import { CanvasPanel } from './CanvasPanel'
import { useSessionSnapshot } from '../../terminal/terminal-session-context'
import type { SessionActivity } from '../../terminal/terminal-session-store'
import type { CanvasNodeData } from '../../types'

type TerminalsPanelProps = {
  nodes: Node<CanvasNodeData>[]
  /** Centers/zooms the canvas on a terminal block and selects it. */
  onFocusNode: (nodeId: string) => void
  onClose: () => void
}

const ACTIVITY_DOT_CLASS: Record<SessionActivity, string> = {
  starting: 'bg-amber-400',
  working: 'bg-sky-400',
  idle: 'bg-emerald-400',
  exited: 'bg-zinc-600',
  error: 'bg-red-400',
}

function terminalTitle(node: Node<CanvasNodeData>) {
  const data = node.data ?? {}
  return data.label || data.command || `Terminal ${node.id.slice(0, 6)}`
}

/**
 * Live list of every terminal block currently on the canvas, numbered by
 * creation order (matches the "#N" badge shown on each terminal's header).
 * Picking one centers and selects it — the way to "walk" through open agent
 * sessions without hunting for them on a crowded board.
 */
export function TerminalsPanel({ nodes, onFocusNode, onClose }: TerminalsPanelProps) {
  const terminals = nodes.filter((node) => node.type === 'terminal')

  return (
    <CanvasPanel title="Terminais" icon={<TerminalIcon size={15} />} onClose={onClose}>
      {terminals.length === 0 ? (
        <p className="text-sm text-zinc-500">Nenhum terminal aberto no canvas.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {terminals.map((node, index) => (
            <TerminalRow
              key={node.id}
              node={node}
              index={index + 1}
              onFocusNode={onFocusNode}
            />
          ))}
        </ul>
      )}
    </CanvasPanel>
  )
}

function TerminalRow({
  node,
  index,
  onFocusNode,
}: {
  node: Node<CanvasNodeData>
  index: number
  onFocusNode: (nodeId: string) => void
}) {
  const snapshot = useSessionSnapshot(node.id)
  const activity = snapshot?.activity ?? 'starting'

  return (
    <li>
      <button
        type="button"
        onClick={() => onFocusNode(node.id)}
        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-white/5"
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
