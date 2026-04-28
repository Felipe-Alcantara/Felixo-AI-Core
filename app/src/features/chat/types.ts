export type AgentId = 'codex' | 'claude' | 'gemini' | 'openclaude'

export type Agent = {
  id: AgentId
  name: string
  command: string
  tone: string
  accentClass: string
}

export type ChatMessage = {
  id: number
  role: 'assistant' | 'user'
  content: string
  agent?: AgentId
  createdAt: string
}
