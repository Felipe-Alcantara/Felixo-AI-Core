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

export type OrchestratorMode =
  | 'manual'
  | 'semi_auto'
  | 'automatic'
  | 'read_only'
  | 'experimental'

export type SkillPrompt = {
  id: string
  name: string
  description: string
  prompt: string
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export type OrchestratorSettings = {
  customContext: string
  globalMemories: string
  enabledSkills: string[]
  skills: SkillPrompt[]
  preferredModelIds: string[]
  blockedModelIds: string[]
  defaultWorkflow: string
  mode: OrchestratorMode
  maxAgentsPerTurn: number
  maxTurns: number
  maxTotalAgents: number
  maxRuntimeMinutes: number
  maxCostEstimate: number
  maxContextTokens: number
  requireConfirmationForSensitiveActions: boolean
}

export type ModelAvailabilityStatus =
  | 'available'
  | 'blocked'
  | 'unavailable'
  | 'error'
  | 'no_login'
  | 'limit_reached'
  | 'unknown'

export type ModelCapabilityProfile = {
  id: string
  name: string
  cliType: OrchestrationCliType
  providerModel?: string
  reasoningEffort?: ReasoningEffort
  execution: string
  supportsTools: boolean
  supportsMcp: boolean
  supportsFileEdits: boolean
  supportsLongContext: boolean
  supportsNativeSession: boolean
  strengths: string[]
  limits: string
  cost: string
  status: ModelAvailabilityStatus
}

export type AppTheme = 'dark' | 'high_contrast'

export type ProjectNote = {
  id: string
  title: string
  content: string
  projectIds: string[]
  createdAt: string
  updatedAt: string
}

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

export type RawOutputEvent = TerminalOutputEvent

type StreamEventBase = {
  sessionId: string
  threadId?: string
  parentThreadId?: string
  runId?: string
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

export type OrchestrationStatusStreamEvent = StreamEventBase & {
  type: 'orchestration_status'
  runId?: string
  status: OrchestrationRunStatus
}

export type OrchestrationStreamEvent =
  | SpawnAgentStreamEvent
  | AwaitingAgentsStreamEvent
  | FinalAnswerStreamEvent
  | OrchestrationStatusStreamEvent

export type OrchestrationRunStatus =
  | 'waiting_agents'
  | 'running_orchestrator'
  | 'completed'
  | 'failed'

export type OrchestrationAgentJobStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'error'

export type OrchestrationAgentJob = {
  agentId: string
  cliType: OrchestrationCliType
  prompt: string
  status: OrchestrationAgentJobStatus
  threadId?: string | null
  result?: string | null
  error?: string | null
  turn?: number
  startedAt?: string | null
  completedAt?: string | null
  createdAt?: string
  updatedAt?: string
}

export type OrchestrationRun = {
  runId: string
  status: OrchestrationRunStatus
  parentThreadId: string
  orchestratorCliType: OrchestrationCliType
  orchestratorModel: Model | null
  originalPrompt: string
  currentTurn: number
  maxTurns: number
  maxAgentsPerTurn: number
  maxTotalAgents: number
  maxRuntimeMinutes: number
  agentJobs: OrchestrationAgentJob[]
  turns: Array<{
    turn: number
    agentIds: string[]
    orchestratorResponse?: string
  }>
  finalAnswer?: string | null
  error?: string | null
  createdAt: string
  updatedAt: string
}

export type StreamEvent =
  | (StreamEventBase & { type: 'text'; text: string; streamItemId?: string })
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
  attachments?: ContextAttachment[]
  model?: ModelId
  sessionId?: string
  streamItemId?: string
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
  previewUrl?: string
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
