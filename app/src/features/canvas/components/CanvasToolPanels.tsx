// Renderiza o painel lateral da ferramenta ativa (busca, projetos, notas,
// modelos, prompts, skills, git e configurações). Mantém o CanvasView focado
// na orquestração do fluxo, não no switch de painéis.
import type { Node } from '@xyflow/react'
import type { CanvasTool } from './tools/CanvasToolsMenu'
import { SearchPanel } from './tools/SearchPanel'
import { ProjectsPanel } from './tools/ProjectsPanel'
import { NotesPanel } from './tools/NotesPanel'
import { TerminalsPanel } from './tools/TerminalsPanel'
import { ModelsPanel } from './tools/ModelsPanel'
import { PromptsPanel } from './tools/PromptsPanel'
import { SkillsPanel, type SkillActivationResult } from './tools/SkillsPanel'
import { GitPanel } from './tools/GitPanel'
import { SettingsPanel } from './tools/SettingsPanel'
import type { CanvasSkill } from '../types'

type CanvasToolPanelsProps = {
  activeTool: CanvasTool | null
  onClose: () => void
  nodes: Node[]
  onFocusNode: (nodeId: string) => void
  /** Creates a new note block on the canvas (same flow as the toolbar button). */
  onAddNote: () => void
  onProjectsChanged: () => void
  onActivateSkill: (skill: CanvasSkill) => Promise<SkillActivationResult>
  onPromptSaved: (prompt: string) => void
  onBootstrapSaved: (prompt: string) => void
  onQualityStandardSaved: (value: { prompt: string; enabled: boolean }) => void
}

export function CanvasToolPanels({
  activeTool,
  onClose,
  nodes,
  onFocusNode,
  onAddNote,
  onProjectsChanged,
  onActivateSkill,
  onPromptSaved,
  onBootstrapSaved,
  onQualityStandardSaved,
}: CanvasToolPanelsProps) {
  switch (activeTool) {
    case 'projects':
      return <ProjectsPanel onClose={onClose} onProjectsChanged={onProjectsChanged} />
    case 'search':
      return <SearchPanel nodes={nodes} onFocusNode={onFocusNode} onClose={onClose} />
    case 'notes':
      return (
        <NotesPanel
          nodes={nodes}
          onFocusNode={onFocusNode}
          onAddNote={onAddNote}
          onClose={onClose}
        />
      )
    case 'terminals':
      return (
        <TerminalsPanel nodes={nodes} onFocusNode={onFocusNode} onClose={onClose} />
      )
    case 'models':
      return <ModelsPanel onClose={onClose} />
    case 'prompts':
      return <PromptsPanel onClose={onClose} />
    case 'skills':
      return <SkillsPanel onActivateSkill={onActivateSkill} onClose={onClose} />
    case 'git':
      return <GitPanel onClose={onClose} />
    case 'settings':
      return (
        <SettingsPanel
          onClose={onClose}
          onPromptSaved={onPromptSaved}
          onBootstrapSaved={onBootstrapSaved}
          onQualityStandardSaved={onQualityStandardSaved}
        />
      )
    default:
      return null
  }
}
