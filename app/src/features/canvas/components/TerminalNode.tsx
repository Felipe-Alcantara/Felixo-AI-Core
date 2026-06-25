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
  // ensure() is idempotent, so initialText only fires on the first creation.
  useEffect(() => {
    if (nodeData.initialTextReady === false) {
      return
    }

    store.ensure(id, {
      command: nodeData.command,
      args: nodeData.args,
      cwd: nodeData.cwd,
      initialText: nodeData.initialText,
    })
  }, [
    store,
    id,
    nodeData.command,
    nodeData.args,
    nodeData.cwd,
    nodeData.initialText,
    nodeData.initialTextReady,
  ])

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
      <TerminalSideHandles />
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
        {snapshot?.lastPrompt && (
          <div
            className="shrink-0 rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-1 text-[10px] leading-snug text-emerald-200"
            title={snapshot.lastPrompt}
          >
            <span className="mr-1 font-semibold text-emerald-400">›</span>
            <span className="line-clamp-2">{snapshot.lastPrompt}</span>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-hidden font-mono text-[10px] leading-snug text-zinc-400">
          {snapshot?.message ? (
            <span className="text-red-400">{snapshot.message}</span>
          ) : preview.length > 0 ? (
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

    </div>
  )
}

/**
 * A connection point on each side of the terminal, each an overlapping
 * source + target so a wire can be dragged out to (or dropped from) a file
 * block on any side. Mirrors the file block's FourSideHandles.
 */
function TerminalSideHandles() {
  const sides: Array<{ position: Position; id: string }> = [
    { position: Position.Top, id: 'top' },
    { position: Position.Right, id: 'right' },
    { position: Position.Bottom, id: 'bottom' },
    { position: Position.Left, id: 'left' },
  ]
  return (
    <>
      {sides.map(({ position, id }) => (
        <span key={id}>
          <Handle
            type="source"
            id={`s-${id}`}
            position={position}
            className="!h-2.5 !w-2.5 !bg-emerald-500"
          />
          <Handle
            type="target"
            id={`t-${id}`}
            position={position}
            className="!h-2.5 !w-2.5 !border-none !bg-transparent"
          />
        </span>
      ))}
    </>
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
