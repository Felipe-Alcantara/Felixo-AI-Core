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

export type ChatMessage = {
  id: number
  role: 'assistant' | 'user'
  content: string
  model?: ModelId
  createdAt: string
}
