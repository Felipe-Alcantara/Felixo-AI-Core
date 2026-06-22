import { useCallback, useEffect, useState } from 'react'
import { FolderGit2, FolderPlus, Trash2 } from 'lucide-react'
import { CanvasPanel } from './CanvasPanel'

type CanvasProject = { id: string; name: string; path: string }

type ProjectsPanelProps = {
  onClose: () => void
  /** Notifies the canvas so the terminal menu picks up new projects. */
  onProjectsChanged?: () => void
}

/**
 * Canvas-side projects manager — lists, adds (folder picker) and removes
 * projects straight through the IPC bridge, independent of the chat UI.
 */
export function ProjectsPanel({ onClose, onProjectsChanged }: ProjectsPanelProps) {
  const [projects, setProjects] = useState<CanvasProject[]>([])
  const [busy, setBusy] = useState(false)

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

  const removeProject = useCallback(
    async (projectId: string) => {
      await window.felixo?.projects?.delete(projectId)
      await reload()
      onProjectsChanged?.()
    },
    [reload, onProjectsChanged],
  )

  return (
    <CanvasPanel title="Projetos" icon={<FolderGit2 size={15} />} onClose={onClose}>
      <button
        type="button"
        onClick={() => void addProject()}
        disabled={busy}
        className="mb-3 flex w-full items-center justify-center gap-2 rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
      >
        <FolderPlus size={15} />
        {busy ? 'Adicionando…' : 'Adicionar pasta'}
      </button>

      {projects.length === 0 ? (
        <p className="text-sm text-zinc-500">Nenhum projeto ainda.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {projects.map((project) => (
            <li
              key={project.id}
              className="flex items-center gap-2 rounded bg-zinc-800/60 px-2 py-1.5"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-zinc-100">{project.name}</div>
                <div className="truncate text-xs text-zinc-500" title={project.path}>
                  {project.path}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void removeProject(project.id)}
                className="rounded p-1 text-zinc-400 hover:bg-white/10 hover:text-red-400"
                aria-label={`Remover ${project.name}`}
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </CanvasPanel>
  )
}
