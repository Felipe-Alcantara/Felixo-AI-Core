// Tipos de modelo e orquestração moram em shared/ (usados pelo canvas e pelo
// chat). Importados para uso local e re-exportados para os imports existentes
// continuarem valendo.
import type {
  Model,
  ModelId,
  OrchestrationCliType,
} from '../shared/types/models'
import type { TerminalOutputEvent } from '../shared/types/terminal-output'

export type {
  CliType,
  Model,
  ModelAvailabilityStatus,
  ModelCapabilityProfile,
  ModelFileSelection,
  ModelId,
  OrchestrationCliType,
  OrchestratorMode,
  OrchestratorSettings,
  ReasoningEffort,
  SkillPrompt,
} from '../shared/types/models'

// O tema deixou de ser da tela de chat e passou a ser do app; o alias fica
// para não quebrar quem já importava daqui.
export type { AppTheme } from '../shared/theme/theme-storage'

export type ProjectNote = {
  id: string
  title: string
  content: string
  projectIds: string[]
  createdAt: string
  updatedAt: string
}

// O evento de saída de terminal mora em shared/; re-exportado para os imports
// existentes continuarem valendo.
export type {
  TerminalOutputEvent,
  TerminalOutputKind,
} from '../shared/types/terminal-output'

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

// O tipo do log do backend mora em shared/; re-exportado para os imports
// existentes continuarem valendo.
export type { QaLogEntry } from '../shared/types/qa-log'

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
  instructions?: string
  docsDirectory?: string
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

// Os tipos do Felixo System Design moram em shared/ (usados pelo canvas e pelo
// chat); re-exportados aqui para os imports existentes continuarem valendo.
export type {
  SystemDesignConfig,
  SystemDesignDocument,
  SystemDesignDocumentSummary,
} from '../shared/system-design/types'

// Automation types live in shared/ (used by chat and canvas); re-exported here
// so existing chat imports keep working.
export type {
  AutomationScope,
  AutomationDefinition,
} from '../shared/types/automations'

export type GitProjectSummary = {
  projectPath: string
  branch: string | null
  statusLines: string[]
  diffStat: string
  recentCommits: string[]
  isClean: boolean
  error?: string
}
