import { memo, useEffect, useRef, useState } from 'react'
import { NODE_MIN_SIZE } from '../services/node-geometry'
import { NodeResizer, useReactFlow, type NodeProps } from '@xyflow/react'
import { Trash2 } from 'lucide-react'
import { NODE_DRAG_HANDLE_CLASS } from './NodeHeader'
import type { GroupNodeData } from '../types'

type GroupNodeDataWithHandler = GroupNodeData & {
  onDataChange?: (nodeId: string, patch: Partial<GroupNodeData>) => void
}

/**
 * A visual container that holds other nodes (a React Flow subflow). Dragging
 * the group moves its children; the editable title bar is the drag handle so
 * the large body stays free to drop nodes into.
 */
function GroupNodeComponent({ id, data, selected }: NodeProps) {
  const nodeData = (data ?? {}) as GroupNodeDataWithHandler
  const [label, setLabel] = useState(nodeData.label ?? 'Grupo')
  const { deleteElements } = useReactFlow()

  // Reimportar um .fxcanvas que reaproveita o mesmo id de um grupo já montado
  // atualiza `nodeData.label` sem remontar o componente — sem resincronizar,
  // o rótulo antigo ficava na tela até uma edição manual. Mesmo padrão do
  // NoteNode: só resincroniza quando o valor não veio da própria digitação.
  const lastSyncedLabelRef = useRef(nodeData.label ?? 'Grupo')
  useEffect(() => {
    const incoming = nodeData.label ?? 'Grupo'
    if (incoming === lastSyncedLabelRef.current) return
    lastSyncedLabelRef.current = incoming
    setLabel(incoming)
  }, [nodeData.label])

  return (
    <div className="felixo-canvas-group h-full w-full rounded-xl border-2 border-dashed border-white/10 bg-(--f-core-white)/5">
      <NodeResizer
        isVisible={selected}
        minWidth={NODE_MIN_SIZE.group.width}
        minHeight={NODE_MIN_SIZE.group.height}
      />
      <div
        className={`${NODE_DRAG_HANDLE_CLASS} flex cursor-grab items-center gap-1.5 rounded-t-lg bg-(--f-core-white)/20 px-2 py-1 active:cursor-grabbing`}
      >
        <input
          value={label}
          onChange={(event) => {
            const next = event.target.value
            lastSyncedLabelRef.current = next
            setLabel(next)
            nodeData.onDataChange?.(id, { label: next })
          }}
          aria-label="Nome do grupo"
          // nodrag so editing the title doesn't drag the whole group.
          className="nodrag min-w-0 flex-1 bg-transparent text-xs font-semibold text-(--f-core-white) outline-hidden"
          placeholder="Grupo"
        />
        <button
          type="button"
          className="felixo-btn-icon nodrag rounded-sm p-0.5 text-(--f-core-white-soft) opacity-70 hover:bg-black/20 hover:opacity-100"
          onClick={() => void deleteElements({ nodes: [{ id }] })}
          aria-label="Remover grupo"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}

export const GroupNode = memo(GroupNodeComponent)
