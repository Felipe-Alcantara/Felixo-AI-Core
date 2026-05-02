import { useCallback, useEffect, useRef, useState } from 'react'
import { FolderOpen, GitBranch, Loader2, Plus, Trash2, X } from 'lucide-react'
import type { Project } from '../types'

type Tab = 'repo' | 'workspace'

type ProjectsModalProps = {
  isOpen: boolean
  projects: Project[]
  onClose: () => void
  onAddProjects: (projects: Project[]) => void
  onRemoveProject: (project: Project) => void
}

export function ProjectsModal({
  isOpen,
  projects,
  onClose,
  onAddProjects,
  onRemoveProject,
}: ProjectsModalProps) {
  const [tab, setTab] = useState<Tab>('repo')
  const [loading, setLoading] = useState(false)
  const [detected, setDetected] = useState<{ name: string; path: string }[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const dialogRef = useRef<HTMLDialogElement>(null)

  const resetWorkspaceSelection = useCallback(() => {
    setDetected([])
    setSelected(new Set())
  }, [])

  const closeModal = useCallback(() => {
    resetWorkspaceSelection()
    onClose()
  }, [onClose, resetWorkspaceSelection])

  useEffect(() => {
    if (isOpen) {
      dialogRef.current?.showModal()
    } else {
      dialogRef.current?.close()
    }
  }, [isOpen])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeModal()
    }
    if (isOpen) document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [closeModal, isOpen])

  async function pickRepo() {
    if (!window.felixo?.projects) return
    setLoading(true)
    try {
      const folderPath = await window.felixo.projects.pickFolder()
      if (!folderPath) return
      const name = folderPath.split('/').at(-1) ?? folderPath
      const alreadyAdded = projects.some((p) => p.path === folderPath)
      if (!alreadyAdded) {
        onAddProjects([{ id: crypto.randomUUID(), name, path: folderPath }])
      }
    } finally {
      setLoading(false)
    }
  }

  async function pickWorkspace() {
    if (!window.felixo?.projects) return
    setLoading(true)
    try {
      const folderPath = await window.felixo.projects.pickFolder()
      if (!folderPath) {
        setLoading(false)
        return
      }
      const repos = await window.felixo.projects.detectRepos(folderPath)
      const existingPaths = new Set(projects.map((p) => p.path))
      const fresh = repos.filter((r) => !existingPaths.has(r.path))
      setDetected(fresh)
      setSelected(new Set(fresh.map((r) => r.path)))
    } catch (err) {
      console.error('[projects] pickWorkspace error:', err)
    } finally {
      setLoading(false)
    }
  }

  function toggleSelected(path: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  function confirmWorkspace() {
    const toAdd = detected
      .filter((r) => selected.has(r.path))
      .map((r) => ({ id: crypto.randomUUID(), name: r.name, path: r.path }))
    if (toAdd.length > 0) onAddProjects(toAdd)
    resetWorkspaceSelection()
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={closeModal}
    >
      <div
        className="relative flex w-full max-w-lg flex-col rounded-2xl border border-white/[0.08] bg-[#1e1e1d] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4">
          <h2 className="text-[14px] font-semibold text-zinc-200">Projetos</h2>
          <button
            type="button"
            onClick={closeModal}
            className="rounded p-1 text-zinc-500 transition hover:text-zinc-300"
          >
            <X size={14} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-white/[0.08] px-5 pt-3">
          {(['repo', 'workspace'] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => { setTab(t); setDetected([]); setSelected(new Set()) }}
              className={[
                'mb-[-1px] border-b-2 px-3 pb-2.5 text-[12px] transition',
                tab === t
                  ? 'border-amber-400 text-zinc-200'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300',
              ].join(' ')}
            >
              {t === 'repo' ? 'Repositório' : 'Workspace'}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-4 px-5 py-5">
          {tab === 'repo' && (
            <>
              <p className="text-[12px] text-zinc-500">
                Selecione uma pasta que seja um repositório Git.
              </p>
              <button
                type="button"
                disabled={loading}
                onClick={pickRepo}
                className="flex h-9 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-[12px] text-zinc-300 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loading ? <Loader2 size={13} className="animate-spin" /> : <FolderOpen size={13} />}
                Selecionar pasta
              </button>
            </>
          )}

          {tab === 'workspace' && (
            <>
              <p className="text-[12px] text-zinc-500">
                Selecione uma pasta com vários repositórios. O app detecta subpastas com <code className="rounded bg-white/[0.06] px-1 text-zinc-400">.git</code> automaticamente.
              </p>
              <button
                type="button"
                disabled={loading}
                onClick={pickWorkspace}
                className="flex h-9 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-[12px] text-zinc-300 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loading ? <Loader2 size={13} className="animate-spin" /> : <FolderOpen size={13} />}
                Selecionar workspace
              </button>

              {detected.length > 0 && (
                <>
                  <div className="max-h-48 overflow-y-auto rounded-lg border border-white/[0.08]">
                    {detected.map((repo) => (
                      <label
                        key={repo.path}
                        className="flex cursor-pointer items-center gap-3 px-3 py-2.5 transition hover:bg-white/[0.04]"
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(repo.path)}
                          onChange={() => toggleSelected(repo.path)}
                          className="accent-amber-400"
                        />
                        <GitBranch size={12} className="shrink-0 text-zinc-500" />
                        <span className="min-w-0">
                          <span className="block truncate text-[12px] text-zinc-300">{repo.name}</span>
                          <span className="block truncate text-[10px] text-zinc-600">{repo.path}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                  <button
                    type="button"
                    disabled={selected.size === 0}
                    onClick={confirmWorkspace}
                    className="flex h-9 items-center gap-2 self-end rounded-lg bg-amber-500/20 px-4 text-[12px] text-amber-300 transition hover:bg-amber-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Plus size={13} />
                    Adicionar {selected.size} {selected.size === 1 ? 'repositório' : 'repositórios'}
                  </button>
                </>
              )}

              {detected.length === 0 && !loading && (
                <p className="text-center text-[11px] text-zinc-700">
                  Nenhum repositório Git detectado ainda.
                </p>
              )}
            </>
          )}
        </div>

        {/* Project list */}
        {projects.length > 0 && (
          <div className="border-t border-white/[0.08] px-5 py-4">
            <p className="mb-2 text-[11px] text-zinc-600">Projetos adicionados</p>
            <div className="max-h-40 space-y-1 overflow-y-auto">
              {projects.map((project) => (
                <div
                  key={project.id}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5"
                >
                  <GitBranch size={12} className="shrink-0 text-zinc-600" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] text-zinc-300">{project.name}</span>
                    <span className="block truncate text-[10px] text-zinc-600">{project.path}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemoveProject(project)}
                    className="shrink-0 rounded p-1 text-zinc-600 transition hover:text-theme-error"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
