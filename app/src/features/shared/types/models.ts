// Tipos de modelo e de orquestração usados pelo canvas e (enquanto existir)
// pela tela de chat. Ficam em shared/ porque descrevem o app, não uma tela.

export type ModelId = string

export type CliType =
  | 'claude'
  | 'codex'
  | 'codex-app-server'
  | 'gemini'
  | 'gemini-acp'
  | 'unknown'

export type ReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'ultra'

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
