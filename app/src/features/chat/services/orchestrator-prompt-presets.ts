import promptPresets from '../../../../electron/services/orchestration/orchestrator-prompt-presets.json'

export const ORCHESTRATOR_PROMPT_PRESETS = deepFreeze(promptPresets)

export function createOpenEndedOrchestrationRules(hint: {
  seed: string
  openEndedTopic: string
}) {
  return [
    `- Seed efemera desta mensagem: ${hint.seed}.`,
    `- O usuario pediu algo como "qualquer coisa"; pergunte ao sub-agente uma pergunta curta e concreta sobre: ${hint.openEndedTopic}.`,
    ...ORCHESTRATOR_PROMPT_PRESETS.multiAgentProtocol.openEndedRules,
  ]
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value
  }

  Object.freeze(value)

  for (const nestedValue of Object.values(value)) {
    deepFreeze(nestedValue)
  }

  return value
}
