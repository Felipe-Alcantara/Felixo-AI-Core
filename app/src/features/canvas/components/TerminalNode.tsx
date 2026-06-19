import { memo } from 'react'
import {
  Handle,
  Position,
  NodeResizer,
  useReactFlow,
  type NodeProps,
} from '@xyflow/react'
import { LiveTerminalPanel } from '../../chat/components/LiveTerminalPanel'
import { NodeHeader } from './NodeHeader'
import type { TerminalNodeData } from '../types'

/**
 * A canvas node that embeds a real interactive terminal. The node id is the
 * stable PTY session identity, so the terminal survives panning/zooming the
 * canvas. Dragging happens via the header; the body is free to type in.
 */
function TerminalNodeComponent({ id, data, selected }: NodeProps) {
  const nodeData = (data ?? {}) as TerminalNodeData
  const { deleteElements } = useReactFlow()

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-lg border border-white/10 bg-[#0b0f14] shadow-xl">
      <NodeResizer
        isVisible={selected}
        minWidth={320}
        minHeight={200}
        lineClassName="!border-emerald-500/40"
        handleClassName="!h-2.5 !w-2.5 !rounded-sm !bg-emerald-500"
      />
      <Handle type="target" position={Position.Left} className="!bg-emerald-500" />
      <NodeHeader
        title={nodeData.label || 'Terminal'}
        className="bg-emerald-950/60 text-emerald-100"
        onRemove={() => void deleteElements({ nodes: [{ id }] })}
      />
      <div className="nodrag min-h-0 flex-1">
        <LiveTerminalPanel sessionId={id} command={nodeData.command} cwd={nodeData.cwd} />
      </div>
      <Handle type="source" position={Position.Right} className="!bg-emerald-500" />
    </div>
  )
}

export const TerminalNode = memo(TerminalNodeComponent)
