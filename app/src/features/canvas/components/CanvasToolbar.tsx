// Barra de ações do canvas: criar blocos, alternar seleção/pan e
// exportar/importar/limpar o canvas. Puramente presentacional — as ações
// chegam por props do CanvasView.
import { useRef, type ChangeEvent } from 'react'
import {
  Download,
  FileText,
  Group,
  Hand,
  Maximize,
  MousePointer2,
  StickyNote,
  Trash2,
  Upload,
} from 'lucide-react'
import { CanvasToolsMenu, type CanvasTool } from './tools/CanvasToolsMenu'
import { TerminalMenu } from './TerminalMenu'
import type { CanvasProject } from '../hooks/useCanvasProjects'

const TOOLBAR_BUTTON_CLASS =
  'flex items-center gap-2 rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-100 shadow-lg ring-1 ring-white/10 hover:bg-zinc-700'

type CanvasToolbarProps = {
  activeTool: CanvasTool | null
  onSelectTool: (tool: CanvasTool) => void
  projects: CanvasProject[]
  onAddTerminal: (options: {
    command?: string
    args?: string[]
    cwd?: string
    label: string
  }) => void
  onAddFolder: () => Promise<string[]>
  onAddNote: () => void
  onAddFile: () => void
  onAddGroup: () => void
  canvasMode: 'select' | 'pan'
  onToggleMode: () => void
  onFitView: () => void
  onExport: () => void
  onImportFile: (event: ChangeEvent<HTMLInputElement>) => void
  onClear: () => void
  isBusy: boolean
  isClearing: boolean
}

export function CanvasToolbar({
  activeTool,
  onSelectTool,
  projects,
  onAddTerminal,
  onAddFolder,
  onAddNote,
  onAddFile,
  onAddGroup,
  canvasMode,
  onToggleMode,
  onFitView,
  onExport,
  onImportFile,
  onClear,
  isBusy,
  isClearing,
}: CanvasToolbarProps) {
  const importInputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="absolute left-4 top-4 z-10 flex items-start gap-2">
      <CanvasToolsMenu activeTool={activeTool} onSelect={onSelectTool} />
      <TerminalMenu
        projects={projects}
        onAdd={onAddTerminal}
        onAddFolder={onAddFolder}
      />
      <button type="button" onClick={onAddNote} className={TOOLBAR_BUTTON_CLASS}>
        <StickyNote size={16} />
        Nota
      </button>
      <button
        type="button"
        onClick={onAddFile}
        className={TOOLBAR_BUTTON_CLASS}
        title="Bloco de arquivo .md compartilhado (agentes podem editar)"
      >
        <FileText size={16} />
        Arquivo
      </button>
      <button type="button" onClick={onAddGroup} className={TOOLBAR_BUTTON_CLASS}>
        <Group size={16} />
        Grupo
      </button>

      <button
        type="button"
        onClick={onToggleMode}
        className={TOOLBAR_BUTTON_CLASS}
        title={
          canvasMode === 'select'
            ? 'Modo seleção — Q para mover a tela'
            : 'Modo mover tela — Q para selecionar'
        }
      >
        {canvasMode === 'select' ? (
          <>
            <MousePointer2 size={16} />
            Selecionar
          </>
        ) : (
          <>
            <Hand size={16} />
            Mover tela
          </>
        )}
      </button>

      <button
        type="button"
        onClick={onFitView}
        className={TOOLBAR_BUTTON_CLASS}
        title="Enquadrar todos os blocos na tela"
      >
        <Maximize size={16} />
        Ver tudo
      </button>

      <button
        type="button"
        onClick={onExport}
        disabled={isBusy}
        className={`${TOOLBAR_BUTTON_CLASS} disabled:opacity-60`}
        title="Exportar canvas para um arquivo portátil"
      >
        <Download size={16} />
        Exportar
      </button>

      <button
        type="button"
        onClick={() => importInputRef.current?.click()}
        disabled={isBusy}
        className={`${TOOLBAR_BUTTON_CLASS} disabled:opacity-60`}
        title="Importar canvas de outro computador"
      >
        <Upload size={16} />
        Importar
      </button>
      <input
        ref={importInputRef}
        type="file"
        accept=".fxcanvas,application/json"
        onChange={onImportFile}
        className="hidden"
      />

      <button
        type="button"
        onClick={onClear}
        disabled={isBusy}
        className="flex items-center gap-2 rounded-lg bg-red-950/80 px-3 py-2 text-sm text-red-100 shadow-lg ring-1 ring-red-500/20 hover:bg-red-900 disabled:cursor-wait disabled:opacity-60"
        title="Excluir todos os blocos, conexões e arquivos .md do canvas"
      >
        <Trash2 size={16} />
        {isClearing ? 'Limpando...' : 'Limpar'}
      </button>
    </div>
  )
}
