import type { ReactNode } from 'react'
import { GripVertical, X } from 'lucide-react'

/** CSS class React Flow uses as the node's drag handle (see NODE_DRAG_HANDLE). */
export const NODE_DRAG_HANDLE_CLASS = 'canvas-node-drag'

type NodeHeaderProps = {
  /** Static title — used when the header is not editable. */
  title?: ReactNode
  /** Optional leading icon. */
  icon?: ReactNode
  /** When provided, the title becomes an editable input seeded with this value. */
  editableValue?: string
  placeholder?: string
  onTitleChange?: (value: string) => void
  /** Tailwind classes for the header background/text, per node type. */
  className?: string
  onRemove?: () => void
  children?: ReactNode
}

/**
 * The grab bar at the top of every canvas node. Only this element is draggable
 * (via NODE_DRAG_HANDLE_CLASS), so the node body stays free to interact with —
 * you can type in a terminal or edit a note without moving the node. When
 * `editableValue`/`onTitleChange` are given, the title is a rename input.
 */
export function NodeHeader({
  title,
  icon,
  editableValue,
  placeholder,
  onTitleChange,
  className,
  onRemove,
  children,
}: NodeHeaderProps) {
  const editable = onTitleChange != null && editableValue != null

  return (
    <div
      className={`${NODE_DRAG_HANDLE_CLASS} flex cursor-grab items-center gap-1.5 px-2 py-1 text-xs active:cursor-grabbing ${className ?? ''}`}
    >
      <GripVertical size={13} className="shrink-0 opacity-50" />
      {icon && <span className="shrink-0 opacity-70">{icon}</span>}
      {editable ? (
        <TitleInput
          value={editableValue}
          placeholder={placeholder}
          onChange={onTitleChange}
        />
      ) : (
        <span className="min-w-0 flex-1 truncate font-medium">{title}</span>
      )}
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

function TitleInput({
  value,
  placeholder,
  onChange,
}: {
  value: string
  placeholder?: string
  onChange: (value: string) => void
}) {
  // Controlled directly by the persisted value — onChange updates it upstream,
  // which flows back as the new value, so no local draft state is needed.
  return (
    <input
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      // nodrag so editing the title doesn't drag the node.
      className="nodrag min-w-0 flex-1 bg-transparent font-medium outline-none placeholder:opacity-50"
    />
  )
}
