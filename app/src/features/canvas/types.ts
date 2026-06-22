export type CanvasNodeType = 'terminal' | 'note' | 'group' | 'file'

export type GroupNodeData = {
  label?: string
}

export type FileNodeData = {
  /** Filename of the .md inside the app's canvas-files directory. */
  fileName?: string
  label?: string
}

export type TerminalNodeData = {
  /** Optional binary to launch; defaults to the shell on the backend. */
  command?: string
  /** Working directory to open the terminal in; defaults to the app cwd. */
  cwd?: string
  /** Human label shown on the node header. */
  label?: string
}

export type NoteColor = 'amber' | 'emerald' | 'sky' | 'rose' | 'zinc'

export type NoteNodeData = {
  text?: string
  /** Sticky-note color; defaults to amber. */
  color?: NoteColor
}

export type CanvasNodeData = TerminalNodeData & NoteNodeData & GroupNodeData & FileNodeData

/** Shape persisted through the `window.felixo.canvas` bridge. */
export type PersistedCanvasNode = {
  id: string
  type: CanvasNodeType
  /** Parent group id, when the node lives inside a group. */
  parentId?: string | null
  position: { x: number; y: number }
  width?: number | null
  height?: number | null
  data: CanvasNodeData
  createdAt?: string
  updatedAt?: string
}
