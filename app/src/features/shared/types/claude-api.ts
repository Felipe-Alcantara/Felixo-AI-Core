/**
 * Contrato do bloco de conversa do Claude por chave de API (preload
 * `window.felixo.claudeApi`). Espelha `electron/services/claude-api/*`.
 */

export type ClaudeApiErrorKind = 'auth' | 'credit' | 'rate-limit' | 'overloaded' | 'other'

export type ClaudeApiAssistantBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }

export type ClaudeApiEvent =
  | { kind: 'ready'; claudeSessionId: string | null; model: string | null; apiKeySource: string | null }
  | { kind: 'text-delta'; text: string }
  | { kind: 'assistant-message'; messageId: string | null; blocks: ClaudeApiAssistantBlock[] }
  | { kind: 'tool-result'; toolUseId: string; isError: boolean; text: string }
  | {
      kind: 'permission-request'
      requestId: string
      toolName: string
      toolUseId: string | null
      description: string
      input: Record<string, unknown>
    }
  | {
      kind: 'turn-end'
      isError: boolean
      interrupted: boolean
      errorKind: ClaudeApiErrorKind | null
      resultText: string
      costUsd: number
      durationMs: number | null
    }
  | { kind: 'notice'; text: string; errorKind: ClaudeApiErrorKind | null }
  | { kind: 'process-exit'; code: number | null; signal?: string | null; message: string | null }

export type ClaudeApiResult = { ok: boolean; message?: string; alreadyRunning?: boolean }

export type ClaudeApiStartParams = {
  sessionId: string
  accountId: string
  cwd: string
  model?: string
  effort?: string
  yolo?: boolean
  resumeSessionId?: string
}

export type ClaudeApiBridge = {
  start: (params: ClaudeApiStartParams) => Promise<ClaudeApiResult>
  send: (params: { sessionId: string; text: string }) => Promise<ClaudeApiResult>
  respondPermission: (params: {
    sessionId: string
    requestId: string
    allow: boolean
    input?: Record<string, unknown>
    message?: string
  }) => Promise<ClaudeApiResult>
  interrupt: (sessionId: string) => Promise<ClaudeApiResult>
  stop: (sessionId: string) => Promise<ClaudeApiResult>
  onEvent: (callback: (payload: { sessionId: string; event: ClaudeApiEvent }) => void) => () => void
}
