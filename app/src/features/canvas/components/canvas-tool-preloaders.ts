import type { CanvasTool } from './tools/CanvasToolsMenu'
import {
  loadAgentCanvasWriteRequestsPanel,
  loadAgentPresetsPanel,
  loadAgentUsagePanel,
  loadFetchAllPanel,
  loadGitPanel,
  loadModelsPanel,
  loadNotionTasksPanel,
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
  // Notificações não é lazy-loaded (mora direto em NotificationsPanel.tsx,
  // já no bundle do canvas) — nada a pré-carregar, mas a entrada precisa
  // existir para o Record cobrir todo o union de CanvasTool.
  notifications: () => Promise.resolve(),
  projects: loadProjectsPanel,
  notes: loadNotesPanel,
  models: loadModelsPanel,
  prompts: loadPromptsPanel,
  skills: loadSkillsPanel,
  git: loadGitPanel,
  fetchAll: loadFetchAllPanel,
  notionTasks: loadNotionTasksPanel,
  agentUsage: loadAgentUsagePanel,
  orchestrator: loadOrchestratorPanel,
  qaLogger: loadQaLoggerPanel,
  settings: loadSettingsPanel,
  agentCanvasWrite: loadAgentCanvasWriteRequestsPanel,
  agentPresets: loadAgentPresetsPanel,
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
