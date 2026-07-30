const promptPresets = require('./orchestrator-prompt-presets.json')
const { createPromptPresetsRuntime } = require('./orchestrator-prompt-presets-core.cjs')

const { ORCHESTRATOR_PROMPT_PRESETS, createOpenEndedOrchestrationRules } =
  createPromptPresetsRuntime(promptPresets)

module.exports = {
  ORCHESTRATOR_PROMPT_PRESETS,
  createOpenEndedOrchestrationRules,
}
