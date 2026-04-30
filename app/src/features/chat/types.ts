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

export type RawOutputEvent = {
  sessionId: string
  source: 'stdout' | 'stderr'
  chunk: string
  severity?: 'debug' | 'info' | 'warn' | 'error'
}

export type StreamEvent =
  | { type: 'text'; text: string; sessionId: string }
  | { type: 'tool_use'; tool: string; input: string; sessionId: string }
  | { type: 'tool_result'; output: string; sessionId: string }
  | {
      type: 'done'
      cost?: number
      duration?: number
      stopped?: boolean
      sessionId: string
    }
  | { type: 'error'; message: string; sessionId: string }

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
