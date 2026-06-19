export type CanvasNodeType = 'terminal' | 'note'

export type TerminalNodeData = {
  /** Optional binary to launch; defaults to the shell on the backend. */
  command?: string
  /** Working directory to open the terminal in; defaults to the app cwd. */
  cwd?: string
  /** Human label shown on the node header. */
  label?: string
}

export type NoteNodeData = {
  text?: string
}

export type CanvasNodeData = TerminalNodeData & NoteNodeData

/** Shape persisted through the `window.felixo.canvas` bridge. */
export type PersistedCanvasNode = {
  id: string
  type: CanvasNodeType
  position: { x: number; y: number }
  width?: number | null
  height?: number | null
  data: CanvasNodeData
  createdAt?: string
  updatedAt?: string
}
