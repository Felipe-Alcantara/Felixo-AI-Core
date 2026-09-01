import type { CanvasTool } from './tools/CanvasToolsMenu'
import {
  loadAgentUsagePanel,
  loadFetchAllPanel,
  loadGitPanel,
  loadModelsPanel,
  loadNotesPanel,
  loadOrchestratorPanel,
  loadProjectsPanel,
  loadPromptsPanel,
  loadQaLoggerPanel,
  loadSearchPanel,
  loadSettingsPanel,
  loadSkillsPanel,
} from './canvas-tool-imports'

const PRELOADERS: Record<CanvasTool, () => Promise<unknown>> = {
  search: loadSearchPanel,
  projects: loadProjectsPanel,
  notes: loadNotesPanel,
  models: loadModelsPanel,
  prompts: loadPromptsPanel,
  skills: loadSkillsPanel,
  git: loadGitPanel,
  fetchAll: loadFetchAllPanel,
  agentUsage: loadAgentUsagePanel,
  orchestrator: loadOrchestratorPanel,
  qaLogger: loadQaLoggerPanel,
  settings: loadSettingsPanel,
}

/**
 * Hover/focus is a deliberate intent signal: preload only the option the
 * person is pointing at, never all tools when the menu opens. The panel still
 * remains lazy for direct state changes and keyboard navigation.
 */
export function preloadCanvasTool(tool: CanvasTool): void {
  void PRELOADERS[tool]().catch(() => {
    // The lazy component owns the visible error state if the actual selection
    // happens after a failed prefetch.
  })
}
