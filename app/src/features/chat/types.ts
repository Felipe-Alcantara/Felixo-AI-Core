export type ModelId = string

export type CliType = 'claude' | 'codex' | 'gemini' | 'unknown'

export type Model = {
  id: ModelId
  name: string
  command: string
  source: string
  cliType: CliType
}

export type ModelFileSelection = Omit<Model, 'id'>

export type TerminalOutputKind =
  | 'assistant'
  | 'error'
  | 'lifecycle'
  | 'metrics'
  | 'stderr'
  | 'tool'

export type TerminalOutputEvent = {
  sessionId: string
  source: 'stdout' | 'stderr' | 'system'
  chunk: string
  severity?: 'debug' | 'info' | 'warn' | 'error'
  kind?: TerminalOutputKind
  title?: string
  metadata?: Record<string, string | number | boolean | null | undefined>
}

export type RawOutputEvent = TerminalOutputEvent

type StreamEventBase = {
  sessionId: string
  threadId?: string
}

export type StreamEvent =
  | (StreamEventBase & { type: 'text'; text: string })
  | (StreamEventBase & { type: 'tool_use'; tool: string; input: string })
  | (StreamEventBase & { type: 'tool_result'; output: string })
  | {
      type: 'done'
      sessionId: string
      threadId?: string
      cost?: number
      duration?: number
      stopped?: boolean
    }
  | (StreamEventBase & {
      type: 'error'
      message: string
    })

export type QaLogEntry = {
  id: number
  createdAt: string
  level: 'debug' | 'info' | 'warn' | 'error'
  scope: string
  sessionId?: string
  message: string
  details: unknown
}

export type ChatMessage = {
  id: number
  role: 'assistant' | 'user'
  content: string
  model?: ModelId
  sessionId?: string
  isStreaming?: boolean
  createdAt: string
}

export type Project = {
  id: string
  name: string
  path: string
}

export type ChatSession = {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: string
  updatedAt: string
}
