import { useCallback, useEffect, useState } from 'react'
import {
  ChevronRight,
  File as FileIcon,
  Folder,
  FolderGit2,
  FolderPlus,
  Loader2,
  Play,
  Trash2,
} from 'lucide-react'
import { CanvasPanel } from './CanvasPanel'
import { buildRunCommand, type RunFileOptions } from '../../services/run-file-command'

type CanvasProject = { id: string; name: string; path: string }
type DirectoryEntry = { name: string; isDirectory: boolean; path: string }
type Browsing = { project: CanvasProject; relativePath: string }

type ProjectsPanelProps = {
  onClose: () => void
  /** Notifies the canvas so the terminal menu picks up new projects. */
  onProjectsChanged?: () => void
  /** Unregisters a folder from the shared list — nothing is deleted on disk. */
  onRemoveFolder: (projectId: string) => Promise<boolean>
  /** Spawns a terminal whose process IS the file running — no shell typed after. */
  onRunFile: (options: RunFileOptions) => void
  /** Widens the toolbar column; the panel slides over to clear it. */
  toolsMenuOpen?: boolean
}

/**
 * Canvas-side projects tool — one place for the whole folder story: register a
 * project (folder picker + repo detection), drop one from the list, browse a
 * registered folder's files, and run one of them in a new terminal.
 *
 * Browsing replaces the list in the same panel frame rather than opening a
 * second popover, the same way PromptsPanel swaps in its detail view.
 */
export function ProjectsPanel({
  onClose,
  onProjectsChanged,
  onRemoveFolder,
  onRunFile,
  toolsMenuOpen,
}: ProjectsPanelProps) {
  const [projects, setProjects] = useState<CanvasProject[]>([])
  const [busy, setBusy] = useState(false)
  const [browsing, setBrowsing] = useState<Browsing | null>(null)
  const [entries, setEntries] = useState<DirectoryEntry[] | null>(null)
  // The backend's own resolved absolute path for the folder being browsed —
  // used as-is for cwd instead of re-joining path fragments ourselves, which
  // would risk mixing '/' (used for relativePath) with the OS's separator.
  const [currentDirPath, setCurrentDirPath] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  // Pasta esperando confirmação para sair da lista. Confirmar em dois toques
  // dentro do próprio painel evita o window.confirm nativo, que cortaria a
  // animação com um diálogo modal do sistema.
  const [pendingRemovalId, setPendingRemovalId] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const result = await window.felixo?.projects?.list()
    if (result?.ok && Array.isArray(result.projects)) {
      setProjects(result.projects as CanvasProject[])
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void window.felixo?.projects?.list().then((result) => {
      if (!cancelled && result?.ok && Array.isArray(result.projects)) {
        setProjects(result.projects as CanvasProject[])
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

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

  const addProject = useCallback(async () => {
    const bridge = window.felixo?.projects
    if (!bridge) {
      return
    }

    setBusy(true)
    try {
      const folder = await bridge.pickFolder()
      if (!folder) {
        return
      }

      const repos = await bridge.detectRepos(folder)
      const picked =
        repos.length > 0
          ? repos
          : [{ name: folder.split('/').filter(Boolean).pop() ?? folder, path: folder }]

      // Skip repos already registered (same path) so re-adding a parent folder
      // doesn't create duplicates.
      const existingPaths = new Set(projects.map((project) => project.path))
      for (const repo of picked) {
        if (existingPaths.has(repo.path)) {
          continue
        }
        await bridge.save({
          id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
          name: repo.name,
          path: repo.path,
        })
      }

      await reload()
      onProjectsChanged?.()
    } finally {
      setBusy(false)
    }
  }, [reload, onProjectsChanged, projects])

  // Passa pelo hook do canvas (não IPC direto) para o menu de terminais e esta
  // lista saírem da mesma fonte e reagirem juntos à remoção.
  const removeProject = useCallback(
    async (projectId: string) => {
      setPendingRemovalId(null)
      await onRemoveFolder(projectId)
      await reload()
      onProjectsChanged?.()
    },
    [onRemoveFolder, reload, onProjectsChanged],
  )

  // Reset the previous folder's listing synchronously, in the event handler
  // that changes `browsing` — not in the fetch effect — so that effect only
  // ever writes the RESULT of a request, never a synchronous reset.
  const openProject = (project: CanvasProject) => {
    setEntries(null)
    setLoadError(null)
    setPendingRemovalId(null)
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
    onClose()
  }

  const breadcrumb = browsing
    ? [browsing.project.name, ...browsing.relativePath.split('/').filter(Boolean)].join(' / ')
    : ''

  if (browsing) {
    return (
      <CanvasPanel
        title={browsing.project.name}
        icon={<FolderGit2 size={15} />}
        onClose={onClose}
        toolsMenuOpen={toolsMenuOpen}
      >
        <div className="mb-2 flex items-center gap-1">
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
        {loadError && <div className="px-2 py-2 text-xs text-red-400">{loadError}</div>}
        {entries && entries.length === 0 && (
          <div className="px-2 py-2 text-xs text-zinc-500">Pasta vazia.</div>
        )}
        <ul className="felixo-anim-stagger-list flex flex-col gap-0.5">
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
      </CanvasPanel>
    )
  }

  return (
    <CanvasPanel
      title="Projetos"
      icon={<FolderGit2 size={15} />}
      onClose={onClose}
      toolsMenuOpen={toolsMenuOpen}
    >
      <button
        type="button"
        onClick={() => void addProject()}
        disabled={busy}
        className="felixo-btn mb-3 flex w-full items-center justify-center gap-2 rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
      >
        <FolderPlus size={15} />
        {busy ? 'Adicionando…' : 'Adicionar pasta'}
      </button>

      {projects.length === 0 ? (
        <p className="text-sm text-zinc-500">Nenhum projeto ainda.</p>
      ) : (
        <ul className="felixo-anim-stagger-list flex flex-col gap-1">
          {projects.map((project) =>
            pendingRemovalId === project.id ? (
              <li
                key={project.id}
                className="flex items-center gap-1 rounded bg-red-500/10 px-2 py-1.5 ring-1 ring-red-500/30"
              >
                <span className="min-w-0 flex-1 truncate text-xs text-zinc-300">
                  Tirar <span className="text-zinc-100">{project.name}</span> da lista?
                </span>
                <button
                  type="button"
                  onClick={() => void removeProject(project.id)}
                  className="felixo-btn shrink-0 rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-500"
                >
                  Remover
                </button>
                <button
                  type="button"
                  onClick={() => setPendingRemovalId(null)}
                  className="felixo-btn shrink-0 rounded px-2 py-1 text-xs text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
                >
                  Cancelar
                </button>
              </li>
            ) : (
              <li
                key={project.id}
                className="group flex items-center gap-1 rounded bg-zinc-800/60 px-2 py-1.5"
              >
                <button
                  type="button"
                  onClick={() => openProject(project)}
                  className="felixo-btn flex min-w-0 flex-1 items-center gap-2 rounded text-left"
                  title="Abrir a pasta e rodar arquivos dela num terminal"
                >
                  <Folder size={14} className="shrink-0 text-zinc-400" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-zinc-100">{project.name}</span>
                    <span className="block truncate text-xs text-zinc-500" title={project.path}>
                      {project.path}
                    </span>
                  </span>
                  <ChevronRight size={14} className="shrink-0 text-zinc-500" />
                </button>
                <button
                  type="button"
                  onClick={() => setPendingRemovalId(project.id)}
                  // Sempre no DOM (só transparente) para a linha não mudar de
                  // largura no hover e empurrar o nome da pasta.
                  className="felixo-btn-icon shrink-0 rounded p-1 text-zinc-500 opacity-0 transition-opacity duration-200 hover:bg-white/10 hover:text-red-400 focus-visible:opacity-100 group-hover:opacity-100"
                  title={`Tirar ${project.name} da lista de projetos`}
                  aria-label={`Remover ${project.name} dos projetos`}
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ),
          )}
        </ul>
      )}
    </CanvasPanel>
  )
}
