// Evento bruto de saída de terminal. Fica em shared/ porque o painel de
// orquestração que o consome é do canvas, e não da tela de chat.

export type TerminalOutputKind =
  | 'assistant'
  | 'error'
  | 'lifecycle'
  | 'metrics'
  | 'stderr'
  | 'tool'

export type TerminalOutputEvent = {
  sessionId: string
  parentThreadId?: string
  source: 'stdout' | 'stderr' | 'system'
  chunk: string
  severity?: 'debug' | 'info' | 'warn' | 'error'
  kind?: TerminalOutputKind
  title?: string
  metadata?: Record<string, string | number | boolean | null | undefined>
}
