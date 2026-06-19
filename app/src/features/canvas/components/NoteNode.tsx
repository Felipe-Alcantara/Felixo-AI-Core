import { memo, useState } from 'react'
import {
  Handle,
  Position,
  NodeResizer,
  useReactFlow,
  type NodeProps,
} from '@xyflow/react'
import { NodeHeader } from './NodeHeader'
import type { NoteNodeData } from '../types'

/**
 * Data carried by a note node. `onTextChange` is injected by CanvasView so
 * edits flow back into canvas state and storage.
 */
type NoteNodeDataWithHandler = NoteNodeData & {
  onTextChange?: (nodeId: string, text: string) => void
}

/**
 * A simple free-text sticky note for the canvas — the "miro" side of the
 * dashboard: annotate how nodes connect without running anything. Dragging is
 * via the header; the body stays editable.
 */
function NoteNodeComponent({ id, data, selected }: NodeProps) {
  const nodeData = (data ?? {}) as NoteNodeDataWithHandler
  const [text, setText] = useState(nodeData.text ?? '')
  const { deleteElements } = useReactFlow()

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-lg border border-amber-300/30 bg-amber-100/95 text-amber-950 shadow-xl">
      <NodeResizer
        isVisible={selected}
        minWidth={160}
        minHeight={100}
        lineClassName="!border-amber-500/50"
        handleClassName="!h-2.5 !w-2.5 !rounded-sm !bg-amber-500"
      />
      <Handle type="target" position={Position.Left} className="!bg-amber-500" />
      <NodeHeader
        title="Nota"
        className="bg-amber-200/80 text-amber-900"
        onRemove={() => void deleteElements({ nodes: [{ id }] })}
      />
      <textarea
        value={text}
        onChange={(event) => {
          const next = event.target.value
          setText(next)
          nodeData.onTextChange?.(id, next)
        }}
        placeholder="Anotacao…"
        className="nodrag min-h-0 w-full flex-1 resize-none bg-transparent p-3 text-sm outline-none placeholder:text-amber-800/40"
      />
      <Handle type="source" position={Position.Right} className="!bg-amber-500" />
    </div>
  )
}

export const NoteNode = memo(NoteNodeComponent)
