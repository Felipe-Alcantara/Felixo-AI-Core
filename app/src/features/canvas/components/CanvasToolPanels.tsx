// Renderiza o painel lateral da ferramenta ativa (busca, projetos, notas,
// modelos, prompts, skills, git, fetch all, limites e uso, orquestrador, QA
// logger e configurações).
// Mantém o CanvasView focado na orquestração do fluxo, não no switch de painéis.
// Os módulos das ferramentas ficam fora do chunk do canvas: abrir uma
// ferramenta é a única ação que justifica baixar e executar seu código.
import { Component, Suspense, type ReactNode } from 'react'
import type { Node } from '@xyflow/react'
import type { CanvasTool } from './tools/CanvasToolsMenu'
import { CanvasPanel } from './tools/CanvasPanel'
import {
  LazyAgentUsagePanel,
  LazyFetchAllPanel,
  LazyGitPanel,
  LazyModelsPanel,
  LazyNotesPanel,
  LazyOrchestratorPanel,
  LazyProjectsPanel,
  LazyPromptsPanel,
  LazyQaLoggerPanel,
  LazySearchPanel,
  LazySettingsPanel,
  LazySkillsPanel,
} from './canvas-tool-loaders'
import type { SkillActivationResult } from './tools/SkillsPanel'
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

const TOOL_LABELS: Record<CanvasTool, string> = {
  search: 'Busca',
  projects: 'Projetos',
  notes: 'Notas',
  models: 'Modelos',
  prompts: 'Prompts',
  skills: 'Skills',
  git: 'Git',
  fetchAll: 'Fetch All',
  agentUsage: 'Limites e uso',
  orchestrator: 'Orquestrador',
  qaLogger: 'QA Logger',
  settings: 'Configurações',
}

type ToolPanelFallbackProps = {
  activeTool: CanvasTool
  toolsMenuOpen: boolean
  onClose: () => void
}

function ToolPanelLoading({
  activeTool,
  toolsMenuOpen,
  onClose,
}: ToolPanelFallbackProps) {
  return (
    <CanvasPanel
      title={TOOL_LABELS[activeTool]}
      panelId={`loading-${activeTool}`}
      onClose={onClose}
      toolsMenuOpen={toolsMenuOpen}
    >
      <div
        className="flex min-h-24 items-center justify-center text-sm text-zinc-400"
        role="status"
        aria-live="polite"
      >
        Carregando {TOOL_LABELS[activeTool]}…
      </div>
    </CanvasPanel>
  )
}

function ToolPanelError({
  activeTool,
  toolsMenuOpen,
  onClose,
}: ToolPanelFallbackProps) {
  return (
    <CanvasPanel
      title={TOOL_LABELS[activeTool]}
      panelId={`error-${activeTool}`}
      onClose={onClose}
      toolsMenuOpen={toolsMenuOpen}
    >
      <div className="space-y-3 text-sm text-zinc-300" role="alert">
        <p>Não foi possível carregar este painel.</p>
        <p className="text-xs text-zinc-500">
          O recurso faz parte do app empacotado. Verifique a instalação e tente
          abrir o app novamente.
        </p>
        <button
          type="button"
          className="felixo-btn rounded bg-zinc-700 px-3 py-2 text-xs text-zinc-100 hover:bg-zinc-600"
          onClick={() => window.location.reload()}
        >
          Recarregar app
        </button>
      </div>
    </CanvasPanel>
  )
}

type ToolPanelErrorBoundaryProps = ToolPanelFallbackProps & { children: ReactNode }
type ToolPanelErrorBoundaryState = { hasError: boolean }

class ToolPanelErrorBoundary extends Component<
  ToolPanelErrorBoundaryProps,
  ToolPanelErrorBoundaryState
> {
  state: ToolPanelErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ToolPanelErrorBoundaryState {
    return { hasError: true }
  }

  componentDidUpdate(previousProps: ToolPanelErrorBoundaryProps) {
    if (
      previousProps.activeTool !== this.props.activeTool &&
      this.state.hasError
    ) {
      this.setState({ hasError: false })
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <ToolPanelError
          activeTool={this.props.activeTool}
          toolsMenuOpen={this.props.toolsMenuOpen}
          onClose={this.props.onClose}
        />
      )
    }

    return this.props.children
  }
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
  if (!activeTool) return null

  const panel = (() => {
    switch (activeTool) {
      case 'projects':
        return (
          <LazyProjectsPanel
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
          <LazySearchPanel
            nodes={nodes}
            onFocusNode={onFocusNode}
            onClose={onClose}
            toolsMenuOpen={toolsMenuOpen}
          />
        )
      case 'notes':
        return (
          <LazyNotesPanel
            nodes={nodes}
            onFocusNode={onFocusNode}
            onAddNote={onAddNote}
            onClose={onClose}
            toolsMenuOpen={toolsMenuOpen}
          />
        )
      case 'models':
        return <LazyModelsPanel onClose={onClose} toolsMenuOpen={toolsMenuOpen} />
      case 'prompts':
        return (
          <LazyPromptsPanel
            onClose={onClose}
            onInsertPrompt={onInsertPrompt}
            toolsMenuOpen={toolsMenuOpen}
          />
        )
      case 'skills':
        return (
          <LazySkillsPanel
            onActivateSkill={onActivateSkill}
            onClose={onClose}
            toolsMenuOpen={toolsMenuOpen}
          />
        )
      case 'git':
        return <LazyGitPanel onClose={onClose} toolsMenuOpen={toolsMenuOpen} />
      case 'fetchAll':
        return <LazyFetchAllPanel onClose={onClose} toolsMenuOpen={toolsMenuOpen} />
      case 'agentUsage':
        return <LazyAgentUsagePanel onClose={onClose} toolsMenuOpen={toolsMenuOpen} />
      case 'orchestrator':
        return <LazyOrchestratorPanel onClose={onClose} toolsMenuOpen={toolsMenuOpen} />
      case 'qaLogger':
        return <LazyQaLoggerPanel onClose={onClose} toolsMenuOpen={toolsMenuOpen} />
      case 'settings':
        return (
          <LazySettingsPanel
            onClose={onClose}
            onPromptSaved={onPromptSaved}
            onBootstrapSaved={onBootstrapSaved}
            onQualityStandardSaved={onQualityStandardSaved}
            toolsMenuOpen={toolsMenuOpen}
          />
        )
    }
  })()

  return (
    <ToolPanelErrorBoundary
      activeTool={activeTool}
      toolsMenuOpen={toolsMenuOpen}
      onClose={onClose}
    >
      <Suspense
        fallback={
          <ToolPanelLoading
            activeTool={activeTool}
            toolsMenuOpen={toolsMenuOpen}
            onClose={onClose}
          />
        }
      >
        {panel}
      </Suspense>
    </ToolPanelErrorBoundary>
  )
}
