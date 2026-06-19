import { memo, useState } from 'react'
import {
  Handle,
  Position,
  NodeResizer,
  useReactFlow,
  type NodeProps,
} from '@xyflow/react'
import { Eye, Pencil } from 'lucide-react'
import { NodeHeader } from './NodeHeader'
import { NOTE_COLORS, resolveNoteTheme } from './note-colors'
import { MarkdownContent } from '../../chat/components/MarkdownContent'
import type { NoteColor, NoteNodeData } from '../types'

/**
 * Data carried by a note node. `onDataChange` is injected by CanvasView so
 * edits (text, color) flow back into canvas state and storage.
 */
type NoteNodeDataWithHandler = NoteNodeData & {
  onDataChange?: (nodeId: string, patch: Partial<NoteNodeData>) => void
}

/**
 * A markdown sticky note for the canvas — the "miro" side of the dashboard.
 * Write markdown (checklists `- [ ]`, headings `#`, etc.) in edit mode and
 * flip to preview to render it. Color is pickable from the header; dragging is
 * via the header, the body stays editable.
 */
function NoteNodeComponent({ id, data, selected }: NodeProps) {
  const nodeData = (data ?? {}) as NoteNodeDataWithHandler
  const [text, setText] = useState(nodeData.text ?? '')
  const [preview, setPreview] = useState(false)
  const theme = resolveNoteTheme(nodeData.color)
  const { deleteElements } = useReactFlow()

  return (
    <div
      className={`flex h-full w-full flex-col overflow-hidden rounded-lg border shadow-xl ${theme.container}`}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={180}
        minHeight={120}
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
          <button
            type="button"
            onClick={() => setPreview((current) => !current)}
            className="ml-1 rounded p-0.5 opacity-70 hover:bg-black/20 hover:opacity-100"
            aria-label={preview ? 'Editar nota' : 'Visualizar nota'}
            title={preview ? 'Editar' : 'Visualizar'}
          >
            {preview ? <Pencil size={13} /> : <Eye size={13} />}
          </button>
        </div>
      </NodeHeader>

      {preview ? (
        <div className="nodrag min-h-0 flex-1 overflow-auto p-2">
          <div className="markdown-content rounded bg-zinc-900/90 p-3 text-sm text-zinc-100">
            {text.trim() ? (
              <MarkdownContent content={text} />
            ) : (
              <span className="text-zinc-500">Nota vazia.</span>
            )}
          </div>
        </div>
      ) : (
        <textarea
          value={text}
          onChange={(event) => {
            const next = event.target.value
            setText(next)
            nodeData.onDataChange?.(id, { text: next })
          }}
          placeholder="Markdown: # titulo, - [ ] tarefa, **negrito**…"
          className={`nodrag min-h-0 w-full flex-1 resize-none bg-transparent p-3 font-mono text-sm outline-none ${theme.text}`}
        />
      )}
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
