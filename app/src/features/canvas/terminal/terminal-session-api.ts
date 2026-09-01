import type { AgentSessionReference } from '../services/agent-session'
import type { ContextFileKind } from '../services/context-file-delivery'
import type { TerminalScrollbackStatus } from './terminal-scrollback'
import type { SessionMetadata } from './session-metadata'

/** The small lifecycle vocabulary needed by cards, the dock, and notices. */
export type SessionActivity =
  | 'starting'
  | 'working'
  | 'idle'
  | 'waiting_approval'
  | 'exited'
  | 'error'

export type SessionSnapshot = {
  activity: SessionActivity
  previewLines: string[]
  scrollback?: TerminalScrollbackStatus
  exitCode?: number
  message?: string
  contextWarning?: string
  lastPrompt?: string
  generation?: number
}

export type TerminalTranscript = { text: string }

export type SessionOptions = {
  command?: string
  args?: string[]
  cwd?: string
  initialText?: string
  sourceLabel?: string
  fallbackCommand?: string
  keepShellOpen?: boolean
  accountId?: string
  providerId?: string
  startedAt?: number
  onOpenWebpage?: (url: string) => void
  agentSession?: AgentSessionReference
  resumeAgentSession?: boolean
  onAgentSession?: (reference: AgentSessionReference) => void
  terminalCount?: number
}

export type SessionListener = (snapshot: SessionSnapshot) => void

/**
 * Runtime surface shared by the canvas and the real xterm-backed store.
 * Keeping this contract free of the concrete store lets the canvas render
 * before the PTY implementation is downloaded.
 */
export type TerminalSessionStoreApi = {
  restart: (id: string, options?: SessionOptions) => void
  ensure: (id: string, options?: SessionOptions) => void
  attach: (id: string, container: HTMLElement) => void
  handleFileDrop: (id: string, files: Iterable<File>) => void
  fit: (id: string) => void
  focus: (id: string) => void
  sendText: (
    id: string,
    text: string,
    options?: { kind?: ContextFileKind },
  ) => Promise<void>
  copy: (id: string) => Promise<string>
  getTranscript: (id: string) => TerminalTranscript
  getShellHistory: (id: string) => TerminalTranscript
  getSnapshot: (id: string) => SessionSnapshot | undefined
  getSessionMetadata: (id: string) => SessionMetadata | undefined
  getSnapshots: () => Record<string, SessionSnapshot>
  subscribeAll: (listener: () => void) => () => void
  subscribe: (id: string, listener: SessionListener) => () => void
  remove: (id: string) => void
  clear: () => void
}
