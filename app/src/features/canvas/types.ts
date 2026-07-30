export type CanvasNodeType = 'terminal' | 'note' | 'group' | 'file'

export type GroupNodeData = {
  label?: string
}

/**
 * How the linked .md is treated:
 * - `scratchpad` (default): a light, free-form living log (objective, state,
 *   blockers, next step, signals) that cheap models keep accurate in a loop.
 * - `plan`: the block can ask a connected terminal to write a concrete repo
 *   diagnosis (problems, incomplete, helpers, improvements) into the file.
 */
export type FileNodeMode = 'scratchpad' | 'plan'

export type FileNodeData = {
  /** Filename of the .md inside the app's canvas-files directory. */
  fileName?: string
  label?: string
  /** Per-block mode; defaults to `scratchpad` when absent. */
  mode?: FileNodeMode
}

/**
 * A canvas skill: a named, described pointer to a file the agent should use.
 * Activating it tells a connected terminal's agent to read/apply that file.
 */
export type CanvasSkill = {
  id: string
  name: string
  description: string
  /** Absolute path to the skill file the agent should read/use. */
  path: string
}

/** Outcome of an on-demand repo-diagnosis request from a file block. */
export type DiagnosisRequestStatus =
  | 'ok'
  | 'no-terminal'
  | 'no-file'
  | 'resolve-failed'

export type TerminalNodeData = {
  /** Optional binary to launch; defaults to the shell on the backend. */
  command?: string
  /** CLI arguments for the command (model/effort/yolo flags). */
  args?: string[]
  /** Working directory to open the terminal in; defaults to the app cwd. */
  cwd?: string
  /** Human label shown on the node header. */
  label?: string
  /** Text typed into the agent shortly after spawn (e.g. standing instruction). Persisted with the node so reopen replays it. */
  initialText?: string
  /** Render-time flag: waits for canvas connections/path resolution before spawning. */
  initialTextReady?: boolean
  /**
   * Render-time only (never persisted): this terminal's position among the
   * currently open terminal blocks, 1-based in creation order. Recomputed on
   * every render from the live node list, so it stays contiguous as
   * terminals open/close — never a stored, ever-growing counter.
   */
  terminalIndex?: number
}

export type NoteColor = 'amber' | 'emerald' | 'sky' | 'rose' | 'zinc'

export type NoteNodeData = {
  text?: string
  /** Sticky-note color; defaults to amber. */
  color?: NoteColor
  /** Human label shown on the node header (searchable). */
  label?: string
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

export type PersistedCanvasEdge = {
  id: string
  source: string
  target: string
  createdAt?: string
  updatedAt?: string
}

export type CanvasTransferBundle = {
  format: 'felixo-canvas'
  version: 1
  exportedAt: string
  nodes: PersistedCanvasNode[]
  edges: PersistedCanvasEdge[]
  files: Array<{ name: string; content: string }>
}
