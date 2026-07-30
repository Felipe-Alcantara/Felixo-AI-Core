export type OpenEndedOrchestrationHint = {
  seed: string
  openEndedTopic: string
}

export function deepFreeze<T>(value: T): T

export function createPromptPresetsRuntime<T>(promptPresets: T): {
  ORCHESTRATOR_PROMPT_PRESETS: T
  createOpenEndedOrchestrationRules(hint: OpenEndedOrchestrationHint): string[]
}
