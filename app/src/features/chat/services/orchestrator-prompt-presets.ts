import promptPresets from '../../../../electron/services/orchestration/orchestrator-prompt-presets.json'

// A logica de deepFreeze/createOpenEndedOrchestrationRules tambem vive em
// orchestrator-prompt-presets-core.cjs (lado Electron/Node, via require).
// Nao importamos esse .cjs aqui: o Vite dev server nao faz interop
// confiavel de CJS (module.exports = {...}) para arquivos fora de
// node_modules, e a importacao (named ou default) falha em runtime com
// "does not provide an export named ..." mesmo com o build de producao
// (tsc -b + vite build) passando. A duplicacao abaixo e pequena (7 linhas)
// e coberta pelos testes em cli-prompt.test.ts.
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
