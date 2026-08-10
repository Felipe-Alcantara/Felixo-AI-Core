// Renderiza o painel lateral da ferramenta ativa (busca, projetos, notas,
// modelos, prompts, skills, git e configurações). Mantém o CanvasView focado
// na orquestração do fluxo, não no switch de painéis.
import type { Node } from '@xyflow/react'
import type { CanvasTool } from './tools/CanvasToolsMenu'
import { SearchPanel } from './tools/SearchPanel'
import { ProjectsPanel } from './tools/ProjectsPanel'
import { NotesPanel } from './tools/NotesPanel'
import { ModelsPanel } from './tools/ModelsPanel'
import { PromptsPanel } from './tools/PromptsPanel'
import { SkillsPanel, type SkillActivationResult } from './tools/SkillsPanel'
import { GitPanel } from './tools/GitPanel'
import { SettingsPanel } from './tools/SettingsPanel'
import type { CanvasSkill } from '../types'

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
