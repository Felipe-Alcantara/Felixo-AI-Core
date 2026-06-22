import { memo, useEffect } from 'react'
import {
  Handle,
  Position,
  NodeResizer,
  useReactFlow,
  type NodeProps,
} from '@xyflow/react'
import { Loader2, Maximize2, Terminal as TerminalIcon } from 'lucide-react'
import { NodeHeader } from './NodeHeader'
import { CopyButton } from './TerminalCopyButton'
import {
  useSessionSnapshot,
  useTerminalSessions,
} from '../terminal/terminal-session-context'
import type { SessionActivity } from '../terminal/terminal-session-store'
import type { TerminalNodeData } from '../types'

type TerminalNodeDataWithHandlers = TerminalNodeData & {
  onExpand?: (nodeId: string) => void
  onDataChange?: (nodeId: string, patch: Partial<TerminalNodeData>) => void
}

/**
 * Collapsed terminal block: a small, calm card that shows what the session is
 * doing (working / idle / exited) and a preview of its last output. The live,
 * interactive terminal opens in a side drawer when expanded — the PTY keeps
 * running in the background via the session store regardless.
 */
function TerminalNodeComponent({ id, data, selected }: NodeProps) {
  const nodeData = (data ?? {}) as TerminalNodeDataWithHandlers
  const store = useTerminalSessions()
  const snapshot = useSessionSnapshot(id)
  const { deleteElements } = useReactFlow()

  // Start (or adopt) the background session as soon as the card mounts.
  useEffect(() => {
    store.ensure(id, { command: nodeData.command, cwd: nodeData.cwd })
  }, [store, id, nodeData.command, nodeData.cwd])

  const activity = snapshot?.activity ?? 'starting'
  const preview = snapshot?.previewLines ?? []

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-lg border border-white/10 bg-[#0b0f14] text-zinc-200 shadow-xl">
      <NodeResizer
        isVisible={selected}
        minWidth={200}
        minHeight={120}
        lineClassName="!border-emerald-500/40"
        handleClassName="!h-2.5 !w-2.5 !rounded-sm !bg-emerald-500"
      />
      <Handle type="target" position={Position.Left} className="!bg-emerald-500" />
      <NodeHeader
        icon={<TerminalIcon size={13} />}
        editableValue={nodeData.label ?? ''}
        placeholder="Terminal"
        onTitleChange={(label) => nodeData.onDataChange?.(id, { label })}
        className="bg-emerald-950/60 text-emerald-100"
        onRemove={() => {
          store.remove(id)
          void deleteElements({ nodes: [{ id }] })
        }}
      >
        <CopyButton onCopy={() => store.copy(id)} />
        <button
          type="button"
          className="nodrag rounded p-0.5 opacity-70 hover:bg-black/20 hover:opacity-100"
          onClick={() => nodeData.onExpand?.(id)}
          aria-label="Expandir terminal"
          title="Expandir"
        >
          <Maximize2 size={13} />
        </button>
      </NodeHeader>

      <button
        type="button"
        onClick={() => nodeData.onExpand?.(id)}
        className="nodrag flex min-h-0 flex-1 flex-col gap-1 p-2 text-left"
      >
        <ActivityBadge activity={activity} exitCode={snapshot?.exitCode} />
        <div className="min-h-0 flex-1 overflow-hidden font-mono text-[10px] leading-snug text-zinc-400">
          {preview.length > 0 ? (
            preview.map((line, index) => (
              <div key={index} className="overflow-hidden text-ellipsis whitespace-nowrap">
                {line}
              </div>
            ))
          ) : (
            <span className="text-zinc-600">Sem saída ainda…</span>
          )}
        </div>
      </button>

      <Handle type="source" position={Position.Right} className="!bg-emerald-500" />
    </div>
  )
}

function ActivityBadge({
  activity,
  exitCode,
}: {
  activity: SessionActivity
  exitCode?: number
}) {
  const config: Record<SessionActivity, { label: string; className: string }> = {
    starting: { label: 'iniciando…', className: 'text-amber-400' },
    working: { label: 'trabalhando', className: 'text-sky-400' },
    idle: { label: 'aguardando', className: 'text-emerald-400' },
    exited: {
      label: `encerrado${exitCode != null ? ` (${exitCode})` : ''}`,
      className: 'text-zinc-500',
    },
    error: { label: 'erro', className: 'text-red-400' },
  }
  const { label, className } = config[activity]

  return (
    <span className={`flex items-center gap-1 text-[11px] font-medium ${className}`}>
      {activity === 'working' && <Loader2 size={11} className="animate-spin" />}
      {activity === 'idle' && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />}
      {label}
    </span>
  )
}

export const TerminalNode = memo(TerminalNodeComponent)
