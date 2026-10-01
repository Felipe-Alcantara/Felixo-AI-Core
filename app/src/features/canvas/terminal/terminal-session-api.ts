import type { AgentResumeFailure, AgentSessionReference } from '../services/agent-session'
import type { ContextFileKind } from '../services/context-file-delivery'
import type { TerminalScrollbackStatus } from './terminal-scrollback'
import type { SessionMetadata } from './session-metadata'
import type { PromptInsertion } from '../../shared/types/prompt-insertion'
import type { ReadingBuffer } from './reading/reading-lines'

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
  /** Provenance of the most recent programmatic or submitted prompt. */
  lastPromptInsertion?: PromptInsertion
  generation?: number
}

export type TerminalTranscript = { text: string }

/**
 * A tela do terminal para a Leitura: o buffer ativo do xterm e a largura.
 * Quem lê não guarda o buffer — ele muda a cada escrita e é outro depois de
 * um Reiniciar (`generation`).
 */
export type TerminalReadingSource = {
  buffer: ReadingBuffer
  cols: number
  generation: number
}

export type SessionOptions = {
  command?: string
  args?: string[]
  cwd?: string
  initialText?: string
  /** O `initialText` é uma passagem: o relançamento automático nunca o reenvia. */
  initialTextIsHandoff?: boolean
  sourceLabel?: string
  fallbackCommand?: string
  keepShellOpen?: boolean
  accountId?: string
  providerId?: string
  /** Fixa (padrão) ou da cadeia de contas. */
  accountMode?: 'pinned' | 'chain'
  /** Ticket de uso único da cadeia; só no primeiro spawn do bloco. */
  chainTicket?: string
  startedAt?: number
  agentSession?: AgentSessionReference
  resumeAgentSession?: boolean
  /** Versão instalada da CLI com que o plano de retomada foi decidido. */
  cliVersion?: string | null
  /** A última falha de retomada registrada no nó; o store nunca a repete. */
  resumeFailure?: AgentResumeFailure
  onAgentSession?: (reference: AgentSessionReference) => void
  /**
   * A CLI respondeu, no boot de um spawn com argumentos de retomada, que a
   * conversa não existe (`expired`) ou que falta login (`auth`). No máximo uma
   * vez por spawn; nunca em spawn sem retomada nem em reanexo a um PTY vivo.
   * `reference` é a conversa que esse spawn tentou retomar.
   */
  onResumeFailure?: (reason: AgentResumeFailure['reason'], reference: AgentSessionReference) => void
  terminalCount?: number
  /** Render-time Modo Performance flag; never persisted in the canvas node. */
  performanceMode?: boolean
}

export type SessionListener = (snapshot: SessionSnapshot) => void

/**
 * Real outcome of `sendText`, replacing the old "fire and forget, assume it
 * worked" contract. `pty.write` can reject or report `delivered: false` (PTY
 * closed, IPC error, drain failure) and the caller needs to know that instead
 * of a false "sent" — this is the base fix for the catalog-delivery
 * reliability bug: callers built on top of this can now show pending/error
 * states instead of a fake success.
 */
export type SendTextResult =
  /**
   * `inline`: o arquivo temporário do contexto falhou e o texto foi direto
   * no terminal (fallback), com o aviso no bloco. A interface diz isso em vez
   * do "inserido" de sempre.
   */
  | { delivered: true; inline?: boolean }
  | { delivered: false; reason: 'no-session' | 'rejected' | 'error'; message?: string }

/** Optional context kind plus the identity kept beside the terminal payload. */
export type SendTextOptions = {
  kind?: ContextFileKind
  insertion?: PromptInsertion
  /** Alias kept for integrations that call the record a prompt insertion. */
  promptInsertion?: PromptInsertion
  /** Alias accepted by older adapters that expose metadata terminology. */
  metadata?: PromptInsertion
}

/** Third argument accepted by the store; a record can be passed directly. */
export type SendTextInput = SendTextOptions | PromptInsertion

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
    options?: SendTextInput,
  ) => Promise<SendTextResult>
  /** Digita texto puro no PTY, sem Enter e sem arquivo de contexto (ditado por voz). */
  typeText: (id: string, text: string) => Promise<SendTextResult>
  copy: (id: string) => Promise<string>
  getTranscript: (id: string) => TerminalTranscript
  getShellHistory: (id: string) => TerminalTranscript
  /** A tela para a Leitura; `undefined` sem sessão (ou antes de o runtime carregar). */
  getReadingSource: (id: string) => TerminalReadingSource | undefined
  /**
   * Avisa quando a tela do terminal muda, no máximo uma vez por quadro. O
   * snapshot só muda na troca de atividade, de propósito; a Leitura precisa
   * de cada redesenho. Sobrevive ao Reiniciar, como `subscribe`.
   */
  subscribeOutput: (id: string, listener: () => void) => () => void
  getSnapshot: (id: string) => SessionSnapshot | undefined
  getSessionMetadata: (id: string) => SessionMetadata | undefined
  getSnapshots: () => Record<string, SessionSnapshot>
  subscribeAll: (listener: () => void) => () => void
  subscribe: (id: string, listener: SessionListener) => () => void
  remove: (id: string) => void
  clear: () => void
}
