// Renderiza o painel lateral da ferramenta ativa (busca, projetos, notas,
// modelos, prompts, skills, git, fetch all, limites e uso, orquestrador, QA
// logger e configurações).
// Mantém o CanvasView focado na orquestração do fluxo, não no switch de painéis.
import type { Node } from '@xyflow/react'
import type { CanvasTool } from './tools/CanvasToolsMenu'
import { SearchPanel } from './tools/SearchPanel'
import { ProjectsPanel } from './tools/ProjectsPanel'
import { NotesPanel } from './tools/NotesPanel'
import { ModelsPanel } from './tools/ModelsPanel'
import { PromptsPanel } from './tools/PromptsPanel'
import { SkillsPanel, type SkillActivationResult } from './tools/SkillsPanel'
import { GitPanel } from './tools/GitPanel'
import { FetchAllPanel } from './tools/FetchAllPanel'
import { AgentUsagePanel } from './tools/AgentUsagePanel'
import { OrchestratorPanel } from './tools/OrchestratorPanel'
import { QaLoggerPanel } from './tools/QaLoggerPanel'
import { SettingsPanel } from './tools/SettingsPanel'
import type { CanvasSkill } from '../types'
import type { RunFileOptions } from '../services/run-file-command'

type CanvasToolPanelsProps = {
  activeTool: CanvasTool | null
  /** Widens the toolbar column, so every panel slides further right to clear it. */
  toolsMenuOpen: boolean
  onClose: () => void
  nodes: Node[]
  onFocusNode: (nodeId: string) => void
  /** Creates a new note block on the canvas (same flow as the toolbar button). */
  onAddNote: () => void
  onProjectsChanged: () => void
  /** Unregisters a folder from the shared projects list — nothing leaves disk. */
  onRemoveFolder: (projectId: string) => Promise<boolean>
  /** Spawns a terminal whose process IS the file picked in the projects panel. */
  onRunFile: (options: RunFileOptions) => void
  /** Abre um arquivo do projeto num bloco do canvas, em vez de rodá-lo. */
  onOpenFileInCanvas: (filePath: string, fileName: string) => void
  onActivateSkill: (skill: CanvasSkill) => Promise<SkillActivationResult>
  onInsertPrompt: (prompt: string) => Promise<SkillActivationResult>
  onPromptSaved: (prompt: string) => void
  onBootstrapSaved: (prompt: string) => void
  onQualityStandardSaved: (value: { prompt: string; enabled: boolean }) => void
}

export function CanvasToolPanels({
  activeTool,
  toolsMenuOpen,
  onClose,
  nodes,
  onFocusNode,
  onAddNote,
  onProjectsChanged,
  onRemoveFolder,
  onRunFile,
  onOpenFileInCanvas,
  onActivateSkill,
  onInsertPrompt,
  onPromptSaved,
  onBootstrapSaved,
  onQualityStandardSaved,
}: CanvasToolPanelsProps) {
  switch (activeTool) {
    case 'projects':
      return (
        <ProjectsPanel
          onClose={onClose}
          onProjectsChanged={onProjectsChanged}
          onRemoveFolder={onRemoveFolder}
          onRunFile={onRunFile}
          onOpenFileInCanvas={onOpenFileInCanvas}
          toolsMenuOpen={toolsMenuOpen}
        />
      )
    case 'search':
      return (
        <SearchPanel
          nodes={nodes}
          onFocusNode={onFocusNode}
          onClose={onClose}
          toolsMenuOpen={toolsMenuOpen}
        />
      )
    case 'notes':
      return (
        <NotesPanel
          nodes={nodes}
          onFocusNode={onFocusNode}
          onAddNote={onAddNote}
          onClose={onClose}
          toolsMenuOpen={toolsMenuOpen}
        />
      )
    case 'models':
      return <ModelsPanel onClose={onClose} toolsMenuOpen={toolsMenuOpen} />
    case 'prompts':
      return (
        <PromptsPanel
          onClose={onClose}
          onInsertPrompt={onInsertPrompt}
          toolsMenuOpen={toolsMenuOpen}
        />
      )
    case 'skills':
      return (
        <SkillsPanel
          onActivateSkill={onActivateSkill}
          onClose={onClose}
          toolsMenuOpen={toolsMenuOpen}
        />
      )
    case 'git':
      return <GitPanel onClose={onClose} toolsMenuOpen={toolsMenuOpen} />
    case 'fetchAll':
      return <FetchAllPanel onClose={onClose} toolsMenuOpen={toolsMenuOpen} />
    case 'agentUsage':
      return <AgentUsagePanel onClose={onClose} toolsMenuOpen={toolsMenuOpen} />
    case 'orchestrator':
      return <OrchestratorPanel onClose={onClose} toolsMenuOpen={toolsMenuOpen} />
    case 'qaLogger':
      return <QaLoggerPanel onClose={onClose} toolsMenuOpen={toolsMenuOpen} />
    case 'settings':
      return (
        <SettingsPanel
          onClose={onClose}
          onPromptSaved={onPromptSaved}
          onBootstrapSaved={onBootstrapSaved}
          onQualityStandardSaved={onQualityStandardSaved}
          toolsMenuOpen={toolsMenuOpen}
        />
      )
    default:
      return null
  }
}
