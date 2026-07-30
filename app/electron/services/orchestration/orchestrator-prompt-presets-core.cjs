// Fonte única da lógica de presets de prompt (congelamento + regras de
// pedido aberto). Consumida tanto pelo lado Electron/Node (via require, ver
// orchestrator-prompt-presets.cjs) quanto pelo lado frontend/Vite (via
// import, ver src/features/chat/services/orchestrator-prompt-presets.ts).
// Mantida como CommonJS puro (.cjs) para funcionar em ambos os empacotadores
// sem depender de allowJs no tsconfig: o frontend só precisa da declaração de
// tipos em orchestrator-prompt-presets-core.d.ts ao lado deste arquivo.
//
// Cada lado carrega o próprio orchestrator-prompt-presets.json (require ou
// import) e passa para createPromptPresetsRuntime — assim este módulo não
// acopla aos dois formatos de import de JSON.

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value
  }

  Object.freeze(value)

  for (const nestedValue of Object.values(value)) {
    deepFreeze(nestedValue)
  }

  return value
}

function createPromptPresetsRuntime(promptPresets) {
  const ORCHESTRATOR_PROMPT_PRESETS = deepFreeze(promptPresets)

  function createOpenEndedOrchestrationRules(hint) {
    return [
      `- Seed efemera desta mensagem: ${hint.seed}.`,
      `- O usuario pediu algo como "qualquer coisa"; pergunte ao sub-agente uma pergunta curta e concreta sobre: ${hint.openEndedTopic}.`,
      ...ORCHESTRATOR_PROMPT_PRESETS.multiAgentProtocol.openEndedRules,
    ]
  }

  return { ORCHESTRATOR_PROMPT_PRESETS, createOpenEndedOrchestrationRules }
}

module.exports = { deepFreeze, createPromptPresetsRuntime }
