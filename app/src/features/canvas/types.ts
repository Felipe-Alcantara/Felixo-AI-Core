export type CanvasNodeType = 'terminal' | 'note' | 'group' | 'file' | 'webpage'

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
  /**
   * Absolute path of a text file that already existed on disk, opened by the
   * person. Mutually exclusive with `fileName`: when present the block only
   * points at someone else's file, so it neither creates nor deletes it — and
   * the scratchpad/plan modes, which are about coordinating agents through a
   * file the block owns, don't apply.
   */
  filePath?: string
  /** Basename of `filePath`, kept so the header reads well before the file loads. */
  fileLabel?: string
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
  /** One-shot in-memory prompt used by responsibility handoff; never persisted. */
  handoffText?: string
  /** Render-time flag: waits for canvas connections/path resolution before spawning. */
  initialTextReady?: boolean
  /** Interpreter to try when `command` isn't installed (Windows `py`/`python`). */
  fallbackCommand?: string
  /**
   * "Run this file" sessions: the command is the whole job, so the terminal
   * must stay interactive after it finishes instead of closing with it.
   */
  keepShellOpen?: boolean
  /**
   * Render-time only (never persisted): this terminal's position among the
   * currently open terminal blocks, 1-based in creation order. Recomputed on
   * every render from the live node list, so it stays contiguous as
   * terminals open/close — never a stored, ever-growing counter.
   */
  terminalIndex?: number
}

/**
 * A canvas block that embeds a live <webview> — a mini-browser docked in the
 * canvas. Only the current/last-navigated URL is kept: back/forward history
 * lives in the webview's own in-memory session and is never serialized.
 */
export type WebpageNodeData = {
  /** Current/last-navigated URL — restored as-is when the block reopens. */
  url?: string
  /** Human label shown on the node header (searchable). */
  label?: string
}

export type NoteColor = 'amber' | 'emerald' | 'sky' | 'rose' | 'zinc'

export type NoteNodeData = {
  text?: string
  /** Sticky-note color; defaults to amber. */
  color?: NoteColor
  /** Human label shown on the node header (searchable). */
  label?: string
}

/**
 * The user's explicit ordering of the blocks, set by dragging rows in the
 * "Elementos" dock. It decides both the dock's list order and each terminal's
 * "#N" badge, and is persisted per node — the storage layer lists nodes by
 * `updated_at`, so without it the order reshuffles on every save/restart.
 * Absent on nodes created before this existed (and on freshly added blocks
 * until the first reorder); those fall back to their position in the loaded
 * list, which keeps them after the explicitly-ordered ones.
 */
export type OrderedNodeData = {
  orderIndex?: number
}

export type CanvasNodeData = TerminalNodeData &
  NoteNodeData &
  GroupNodeData &
  FileNodeData &
  WebpageNodeData &
  OrderedNodeData

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

/** Estado de sincronização de um repositório após o fetch do Fetch All. */
export type FetchAllRepoState =
  | 'UP_TO_DATE'
  | 'NEEDS_PULL'
  | 'NEEDS_PUSH'
  | 'DIVERGED'
  | 'DIRTY'
  | 'CONFLICT'
  | 'NO_REMOTE'
  | 'NO_UPSTREAM'
  | 'DETACHED'
  | 'FETCH_ERROR'
  | 'GIT_ERROR'

export type FetchAllRepoStatus = {
  path: string
  name: string
  state: FetchAllRepoState
  /** Rótulo legível do estado, montado no processo principal. */
  stateLabel: string
  branch: string
  ahead: number
  behind: number
  detail: string
  dirtyFiles: string[]
}

/** Plano revisável: o que dá para resolver sozinho e o que só é reportado. */
export type FetchAllPlan = {
  upToDate: FetchAllRepoStatus[]
  toPull: FetchAllRepoStatus[]
  toPush: FetchAllRepoStatus[]
  problems: FetchAllRepoStatus[]
  total: number
}

export type FetchAllActionResult = {
  status: FetchAllRepoStatus
  action: 'pull' | 'push' | 'commit'
  ok: boolean
  message: string
}

export type FetchAllSettings = {
  /** Vazio significa "todos os discos locais". */
  scanRoots: string[]
  excludeDirs: string[]
  ignoredPaths: string[]
  analyzeWorkers: number
}

/** Avanço da passada, publicado pelo processo principal enquanto ela roda. */
export type FetchAllProgress = {
  phase: 'idle' | 'scanning' | 'analyzing' | 'executing'
  type: 'scan' | 'analyze' | 'execute' | 'done'
  scannedDirs?: number
  foundRepos?: number
  currentPath?: string
  analyzed?: number
  total?: number
  repoName?: string
  stateLabel?: string
  done?: number
  result?: FetchAllActionResult
}
