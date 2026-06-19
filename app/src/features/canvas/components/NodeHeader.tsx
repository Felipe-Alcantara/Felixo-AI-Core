import type { ReactNode } from 'react'
import { GripVertical, X } from 'lucide-react'

/** CSS class React Flow uses as the node's drag handle (see NODE_DRAG_HANDLE). */
export const NODE_DRAG_HANDLE_CLASS = 'canvas-node-drag'

type NodeHeaderProps = {
  title: ReactNode
  /** Tailwind classes for the header background/text, per node type. */
  className?: string
  onRemove?: () => void
  children?: ReactNode
}

/**
 * The grab bar at the top of every canvas node. Only this element is draggable
 * (via NODE_DRAG_HANDLE_CLASS), so the node body stays free to interact with —
 * you can type in a terminal or edit a note without moving the node.
 */
export function NodeHeader({ title, className, onRemove, children }: NodeHeaderProps) {
  return (
    <div
      className={`${NODE_DRAG_HANDLE_CLASS} flex cursor-grab items-center gap-1.5 px-2 py-1 text-xs active:cursor-grabbing ${className ?? ''}`}
    >
      <GripVertical size={13} className="shrink-0 opacity-50" />
      <span className="min-w-0 flex-1 truncate font-medium">{title}</span>
      {children}
      {onRemove && (
        <button
          type="button"
          // nodrag so clicking the close button never starts a drag.
          className="nodrag rounded p-0.5 opacity-60 hover:bg-black/20 hover:opacity-100"
          onClick={onRemove}
          aria-label="Remover no"
        >
          <X size={13} />
        </button>
      )}
    </div>
  )
}
