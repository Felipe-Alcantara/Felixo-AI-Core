import { lazy } from 'react'
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

export const LazySearchPanel = lazy(loadSearchPanel)
export const LazyProjectsPanel = lazy(loadProjectsPanel)
export const LazyNotesPanel = lazy(loadNotesPanel)
export const LazyModelsPanel = lazy(loadModelsPanel)
export const LazyPromptsPanel = lazy(loadPromptsPanel)
export const LazySkillsPanel = lazy(loadSkillsPanel)
export const LazyGitPanel = lazy(loadGitPanel)
export const LazyFetchAllPanel = lazy(loadFetchAllPanel)
export const LazyAgentUsagePanel = lazy(loadAgentUsagePanel)
export const LazyOrchestratorPanel = lazy(loadOrchestratorPanel)
export const LazyQaLoggerPanel = lazy(loadQaLoggerPanel)
export const LazySettingsPanel = lazy(loadSettingsPanel)
