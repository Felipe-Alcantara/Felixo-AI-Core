import { memo, useState } from 'react'
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

  return (
    <div className="h-full w-full rounded-xl border-2 border-dashed border-indigo-400/40 bg-indigo-500/5">
      <NodeResizer
        isVisible={selected}
        minWidth={240}
        minHeight={180}
        lineClassName="!border-indigo-400/50"
        handleClassName="!h-2.5 !w-2.5 !rounded-sm !bg-indigo-400"
      />
      <div
        className={`${NODE_DRAG_HANDLE_CLASS} flex cursor-grab items-center gap-1.5 rounded-t-lg bg-indigo-500/20 px-2 py-1 active:cursor-grabbing`}
      >
        <input
          value={label}
          onChange={(event) => {
            const next = event.target.value
            setLabel(next)
            nodeData.onDataChange?.(id, { label: next })
          }}
          // nodrag so editing the title doesn't drag the whole group.
          className="nodrag min-w-0 flex-1 bg-transparent text-xs font-semibold text-indigo-100 outline-none"
          placeholder="Grupo"
        />
        <button
          type="button"
          className="nodrag rounded p-0.5 text-indigo-200 opacity-70 hover:bg-black/20 hover:opacity-100"
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
