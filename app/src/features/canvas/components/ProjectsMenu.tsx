// Toolbar control to browse a project folder's files and run one directly in
// a new terminal — "Elemento novo" from the quality-standard task: open the
// directory of any folder and run files in it, next to the other auxiliary
// functions, the same way the terminal menu already opens folders as projects.
import { useEffect, useRef, useState } from 'react'
import {
  ChevronRight,
  File as FileIcon,
  Folder,
  FolderOpen,
  Loader2,
  Play,
} from 'lucide-react'
import { buildRunCommand } from '../services/run-file-command'
import {
  toolbarFlyoutClass,
  toolbarFlyoutStyle,
  useToolbarFlyoutPosition,
} from './toolbar-flyout'

type ProjectsMenuProject = { id: string; name: string; path: string }

export type RunFileOptions = {
  command: string
  args: string[]
  cwd: string
  label: string
}

type ProjectsMenuProps = {
  projects: ProjectsMenuProject[]
  /** Adds a folder as a project (picker + detect repos), returns the new ids. */
  onAddFolder: () => Promise<string[]>
  /** Spawns a terminal whose process IS the file running — no shell typed after. */
  onRunFile: (options: RunFileOptions) => void
  /** The tools menu widens the toolbar column; the flyout slides over to clear it. */
  toolsMenuOpen?: boolean
}

type DirectoryEntry = { name: string; isDirectory: boolean; path: string }
type Browsing = { project: ProjectsMenuProject; relativePath: string }

export function ProjectsMenu({
  projects,
  onAddFolder,
  onRunFile,
  toolsMenuOpen = false,
}: ProjectsMenuProps) {
  const [open, setOpen] = useState(false)
  const [browsing, setBrowsing] = useState<Browsing | null>(null)
  const [entries, setEntries] = useState<DirectoryEntry[] | null>(null)
  // The backend's own resolved absolute path for the folder being browsed —
  // used as-is for cwd instead of re-joining path fragments ourselves, which
  // would risk mixing '/' (used for relativePath) with the OS's separator.
  const [currentDirPath, setCurrentDirPath] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const flyoutPosition = useToolbarFlyoutPosition({
    open,
    toolsMenuOpen,
    containerRef,
    panelRef,
    panelWidth: 288,
  })

  useEffect(() => {
    if (!open) {
      return
    }
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  useEffect(() => {
    if (!browsing) {
      return
    }
    let cancelled = false
    void window.felixo?.projects
      ?.listDirectory({ rootPath: browsing.project.path, subPath: browsing.relativePath })
      .then((result) => {
        if (cancelled) return
        if (result?.ok && Array.isArray(result.entries)) {
          setEntries(result.entries)
          setCurrentDirPath(result.path ?? browsing.project.path)
        } else {
          setLoadError(result?.message ?? 'Não foi possível listar a pasta.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [browsing])

  // Reset the previous folder's listing synchronously, in the event handler
  // that changes `browsing` — not in the effect above — so the fetch effect
  // only ever writes the RESULT of a request, never a synchronous reset.
  const openProject = (project: ProjectsMenuProject) => {
    setEntries(null)
    setLoadError(null)
    setBrowsing({ project, relativePath: '' })
  }

  const openSubfolder = (entry: DirectoryEntry) => {
    if (!browsing) return
    const nextRelative = browsing.relativePath
      ? `${browsing.relativePath}/${entry.name}`
      : entry.name
    setEntries(null)
    setLoadError(null)
    setBrowsing({ project: browsing.project, relativePath: nextRelative })
  }

  const goUp = () => {
    if (!browsing) return
    if (!browsing.relativePath) {
      setBrowsing(null)
      setEntries(null)
      setCurrentDirPath(null)
      return
    }
    const parts = browsing.relativePath.split('/')
    parts.pop()
    setBrowsing({ project: browsing.project, relativePath: parts.join('/') })
  }

  const runFile = (entry: DirectoryEntry) => {
    if (!browsing || !currentDirPath) return
    const { command, args } = buildRunCommand(entry.name)
    onRunFile({
      command,
      args,
      cwd: currentDirPath,
      label: `${entry.name} · ${browsing.project.name}`,
    })
    setOpen(false)
    setBrowsing(null)
    setEntries(null)
    setCurrentDirPath(null)
  }

  const breadcrumb = browsing
    ? [browsing.project.name, ...browsing.relativePath.split('/').filter(Boolean)].join(' / ')
    : ''

  return (
    <div ref={containerRef} className="relative w-36">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="felixo-btn flex w-full items-center gap-2 rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-100 shadow-lg ring-1 ring-white/10 hover:bg-zinc-700"
        title="Abrir uma pasta e rodar arquivos dela num terminal"
      >
        <FolderOpen size={16} />
        Projetos
      </button>

      {open && (
        <div
          ref={panelRef}
          // Anchored to a button partway down the toolbar, so the height cap
          // is the room left below it, not a flat fraction of the viewport.
          style={toolbarFlyoutStyle(flyoutPosition)}
          className={`felixo-anim-sequential-panel ${toolbarFlyoutClass()} ${flyoutPosition ? '' : 'invisible'} w-72 overflow-auto rounded-lg bg-zinc-800 p-2 shadow-xl ring-1 ring-white/10`}
        >
          {!browsing ? (
            <>
              <div className="px-1 pb-1 text-xs font-medium text-zinc-400">Pastas</div>
              {projects.length === 0 && (
                <div className="px-1 pb-2 text-xs text-zinc-500">
                  Nenhuma pasta adicionada ainda.
                </div>
              )}
              <ul className="mb-2 flex flex-col gap-0.5">
                {projects.map((project) => (
                  <li key={project.id}>
                    <button
                      type="button"
                      onClick={() => openProject(project)}
                      className="felixo-btn flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-zinc-100 hover:bg-white/5"
                    >
                      <Folder size={14} className="shrink-0 text-zinc-400" />
                      <span className="min-w-0 flex-1 truncate">{project.name}</span>
                      <ChevronRight size={14} className="shrink-0 text-zinc-500" />
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => void onAddFolder()}
                className="felixo-btn w-full rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-600"
              >
                + Adicionar pasta…
              </button>
            </>
          ) : (
            <>
              <div className="mb-1 flex items-center gap-1 px-1">
                <button
                  type="button"
                  onClick={goUp}
                  className="felixo-btn-icon rounded p-1 text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
                  title="Voltar"
                  aria-label="Voltar para a pasta anterior"
                >
                  <ChevronRight size={14} className="rotate-180" />
                </button>
                <span className="min-w-0 flex-1 truncate text-xs text-zinc-400" title={breadcrumb}>
                  {breadcrumb}
                </span>
              </div>

              {entries === null && !loadError && (
                <div className="flex items-center gap-2 px-2 py-3 text-xs text-zinc-500">
                  <Loader2 size={12} className="animate-spin" />
                  Carregando…
                </div>
              )}
              {loadError && (
                <div className="px-2 py-2 text-xs text-red-400">{loadError}</div>
              )}
              {entries && entries.length === 0 && (
                <div className="px-2 py-2 text-xs text-zinc-500">Pasta vazia.</div>
              )}
              <ul className="flex flex-col gap-0.5">
                {entries?.map((entry) => (
                  <li key={entry.path}>
                    <button
                      type="button"
                      onClick={() => (entry.isDirectory ? openSubfolder(entry) : runFile(entry))}
                      className="felixo-btn flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-zinc-100 hover:bg-white/5"
                      title={entry.isDirectory ? undefined : `Rodar ${entry.name} num terminal`}
                    >
                      {entry.isDirectory ? (
                        <Folder size={14} className="shrink-0 text-zinc-400" />
                      ) : (
                        <FileIcon size={14} className="shrink-0 text-zinc-500" />
                      )}
                      <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                      {entry.isDirectory ? (
                        <ChevronRight size={14} className="shrink-0 text-zinc-500" />
                      ) : (
                        <Play size={12} className="shrink-0 text-emerald-400" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  )
}
