import promptPresets from '../../../../electron/services/orchestration/orchestrator-prompt-presets.json'
import { createPromptPresetsRuntime } from '../../../../electron/services/orchestration/orchestrator-prompt-presets-core.cjs'

const runtime = createPromptPresetsRuntime(promptPresets)

export const ORCHESTRATOR_PROMPT_PRESETS = runtime.ORCHESTRATOR_PROMPT_PRESETS
export const createOpenEndedOrchestrationRules =
  runtime.createOpenEndedOrchestrationRules
