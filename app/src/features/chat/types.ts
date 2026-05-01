export type ModelId = string

export type CliType =
  | 'claude'
  | 'codex'
  | 'codex-app-server'
  | 'gemini'
  | 'gemini-acp'
  | 'unknown'

export type ReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export type Model = {
  id: ModelId
  name: string
  command: string
  source: string
  cliType: CliType
  providerModel?: string
  reasoningEffort?: ReasoningEffort
}

export type ModelFileSelection = Omit<Model, 'id'>

export type OrchestrationCliType = Exclude<CliType, 'unknown'>

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

export type SpawnAgentStreamEvent = StreamEventBase & {
  type: 'spawn_agent'
  agentId: string
  cliType: OrchestrationCliType
  prompt: string
}

export type AwaitingAgentsStreamEvent = StreamEventBase & {
  type: 'awaiting_agents'
  agentIds: string[]
}

export type FinalAnswerStreamEvent = StreamEventBase & {
  type: 'final_answer'
  content: string
}

export type OrchestrationStreamEvent =
  | SpawnAgentStreamEvent
  | AwaitingAgentsStreamEvent
  | FinalAnswerStreamEvent

export type StreamEvent =
  | (StreamEventBase & { type: 'text'; text: string })
  | (StreamEventBase & { type: 'tool_use'; tool: string; input: string })
  | (StreamEventBase & { type: 'tool_result'; output: string })
  | OrchestrationStreamEvent
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

export type ContextAttachment = {
  id: string
  name: string
  path?: string
  type: string
  size: number
  contentPreview?: string
}

export type ChatSession = {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: string
  updatedAt: string
}

export type AutomationScope = 'chat' | 'code' | 'docs' | 'git' | 'planning'

export type AutomationDefinition = {
  id: string
  name: string
  description: string
  prompt: string
  scope: AutomationScope
  isDefault?: boolean
  createdAt?: string
  updatedAt?: string
}

export type GitProjectSummary = {
  projectPath: string
  branch: string | null
  statusLines: string[]
  diffStat: string
  recentCommits: string[]
  isClean: boolean
  error?: string
}
