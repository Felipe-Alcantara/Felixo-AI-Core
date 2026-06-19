import { memo, useState } from 'react'
import {
  Handle,
  Position,
  NodeResizer,
  useReactFlow,
  type NodeProps,
} from '@xyflow/react'
import { NodeHeader } from './NodeHeader'
import { NOTE_COLORS, resolveNoteTheme } from './note-colors'
import type { NoteColor, NoteNodeData } from '../types'

/**
 * Data carried by a note node. `onDataChange` is injected by CanvasView so
 * edits (text, color) flow back into canvas state and storage.
 */
type NoteNodeDataWithHandler = NoteNodeData & {
  onDataChange?: (nodeId: string, patch: Partial<NoteNodeData>) => void
}

/**
 * A free-text sticky note for the canvas — the "miro" side of the dashboard.
 * Color is pickable from the header; dragging is via the header, the body
 * stays editable.
 */
function NoteNodeComponent({ id, data, selected }: NodeProps) {
  const nodeData = (data ?? {}) as NoteNodeDataWithHandler
  const [text, setText] = useState(nodeData.text ?? '')
  const theme = resolveNoteTheme(nodeData.color)
  const { deleteElements } = useReactFlow()

  return (
    <div
      className={`flex h-full w-full flex-col overflow-hidden rounded-lg border shadow-xl ${theme.container}`}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={160}
        minHeight={100}
        lineClassName="!border-black/20"
        handleClassName="!h-2.5 !w-2.5 !rounded-sm !bg-black/40"
      />
      <Handle type="target" position={Position.Left} className="!bg-black/40" />
      <NodeHeader
        title="Nota"
        className={theme.header}
        onRemove={() => void deleteElements({ nodes: [{ id }] })}
      >
        <div className="nodrag flex items-center gap-1">
          {NOTE_COLORS.map((color) => (
            <ColorSwatch
              key={color}
              color={color}
              active={(nodeData.color ?? 'amber') === color}
              onSelect={() => nodeData.onDataChange?.(id, { color })}
            />
          ))}
        </div>
      </NodeHeader>
      <textarea
        value={text}
        onChange={(event) => {
          const next = event.target.value
          setText(next)
          nodeData.onDataChange?.(id, { text: next })
        }}
        placeholder="Anotacao…"
        className={`nodrag min-h-0 w-full flex-1 resize-none bg-transparent p-3 text-sm outline-none ${theme.text}`}
      />
      <Handle type="source" position={Position.Right} className="!bg-black/40" />
    </div>
  )
}

function ColorSwatch({
  color,
  active,
  onSelect,
}: {
  color: NoteColor
  active: boolean
  onSelect: () => void
}) {
  const theme = resolveNoteTheme(color)

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`Cor ${color}`}
      className={`h-3.5 w-3.5 rounded-full ring-1 ring-black/20 ${theme.swatch} ${
        active ? 'ring-2 ring-black/60' : ''
      }`}
    />
  )
}

export const NoteNode = memo(NoteNodeComponent)
