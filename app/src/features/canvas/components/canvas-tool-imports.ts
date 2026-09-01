import type { CanvasTool } from './tools/CanvasToolsMenu'

type LoadedCanvasToolsGlobal = typeof globalThis & {
  __felixoLoadedCanvasTools?: CanvasTool[]
}

function markToolLoaded(tool: CanvasTool): void {
  const runtime = globalThis as LoadedCanvasToolsGlobal
  const loadedTools = runtime.__felixoLoadedCanvasTools ?? []
  if (!loadedTools.includes(tool)) {
    loadedTools.push(tool)
  }
  runtime.__felixoLoadedCanvasTools = loadedTools

  // A DOM marker keeps the benchmark observable across Electron's isolated
  // execution worlds as well as from the renderer itself.
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.felixoLoadedCanvasTools = loadedTools.join(',')
  }

  if (typeof performance !== 'undefined') {
    performance.mark(`felixo:chunk:${tool}:loaded`)
  }
}

export const loadSearchPanel = () =>
  import('./tools/SearchPanel').then(({ SearchPanel }) => {
    markToolLoaded('search')
    return { default: SearchPanel }
  })
export const loadProjectsPanel = () =>
  import('./tools/ProjectsPanel').then(({ ProjectsPanel }) => {
    markToolLoaded('projects')
    return { default: ProjectsPanel }
  })
export const loadNotesPanel = () =>
  import('./tools/NotesPanel').then(({ NotesPanel }) => {
    markToolLoaded('notes')
    return { default: NotesPanel }
  })
export const loadModelsPanel = () =>
  import('./tools/ModelsPanel').then(({ ModelsPanel }) => {
    markToolLoaded('models')
    return { default: ModelsPanel }
  })
export const loadPromptsPanel = () =>
  import('./tools/PromptsPanel').then(({ PromptsPanel }) => {
    markToolLoaded('prompts')
    return { default: PromptsPanel }
  })
export const loadSkillsPanel = () =>
  import('./tools/SkillsPanel').then(({ SkillsPanel }) => {
    markToolLoaded('skills')
    return { default: SkillsPanel }
  })
export const loadGitPanel = () =>
  import('./tools/GitPanel').then(({ GitPanel }) => {
    markToolLoaded('git')
    return { default: GitPanel }
  })
export const loadFetchAllPanel = () =>
  import('./tools/FetchAllPanel').then(({ FetchAllPanel }) => {
    markToolLoaded('fetchAll')
    return { default: FetchAllPanel }
  })
export const loadAgentUsagePanel = () =>
  import('./tools/AgentUsagePanel').then(({ AgentUsagePanel }) => {
    markToolLoaded('agentUsage')
    return { default: AgentUsagePanel }
  })
export const loadOrchestratorPanel = () =>
  import('./tools/OrchestratorPanel').then(({ OrchestratorPanel }) => {
    markToolLoaded('orchestrator')
    return { default: OrchestratorPanel }
  })
export const loadQaLoggerPanel = () =>
  import('./tools/QaLoggerPanel').then(({ QaLoggerPanel }) => {
    markToolLoaded('qaLogger')
    return { default: QaLoggerPanel }
  })
export const loadSettingsPanel = () =>
  import('./tools/SettingsPanel').then(({ SettingsPanel }) => {
    markToolLoaded('settings')
    return { default: SettingsPanel }
  })
