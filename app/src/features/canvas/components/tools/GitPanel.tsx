import { useCallback, useEffect, useState } from 'react'
import { GitBranch, GitCommit, Plus, RefreshCw } from 'lucide-react'
import { CanvasPanel } from './CanvasPanel'

type CanvasProject = { id: string; name: string; path: string }

type GitSummary = {
  branch: string | null
  statusLines: string[]
  isClean: boolean
  error?: string
}

type GitPanelProps = {
  onClose: () => void
}

/** Canvas-side git tool — pick a project and stage/commit through IPC. */
export function GitPanel({ onClose }: GitPanelProps) {
  const [projects, setProjects] = useState<CanvasProject[]>([])
  const [projectPath, setProjectPath] = useState('')
  const [summary, setSummary] = useState<GitSummary | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  const refresh = useCallback(async (path: string) => {
    if (!path) {
      setSummary(null)
      setError(null)
      return
    }
    const result = await window.felixo?.git?.getSummary({ projectPath: path })
    if (result?.ok && result.summary) {
      const next = result.summary as GitSummary
      setSummary(next)
      setError(next.error ?? null)
    } else {
      setSummary(null)
      setError(result?.message ?? 'Falha ao consultar o repositório Git.')
    }
  }, [])

  const selectProject = useCallback(
    (path: string) => {
      setProjectPath(path)
      void refresh(path)
    },
    [refresh],
  )

  const stageAll = useCallback(async () => {
    if (!projectPath) return
    setBusy(true)
    try {
      const result = await window.felixo?.git?.stageAll({ projectPath })
      if (result && !result.ok) {
        setError(result.message ?? 'Falha ao preparar alterações.')
      }
      await refresh(projectPath)
    } finally {
      setBusy(false)
    }
  }, [projectPath, refresh])

  const commit = useCallback(async () => {
    if (!projectPath || !message.trim()) return
    setBusy(true)
    try {
      const result = await window.felixo?.git?.commit({
        projectPath,
        message: message.trim(),
      })
      if (result && !result.ok) {
        setError(result.message ?? 'Falha ao criar o commit.')
        return
      }
      setMessage('')
      await refresh(projectPath)
    } finally {
      setBusy(false)
    }
  }, [projectPath, message, refresh])

  return (
    <CanvasPanel title="Git" icon={<GitBranch size={15} />} onClose={onClose}>
      <div className="mb-3 flex items-center gap-2">
        <select
          value={projectPath}
          onChange={(event) => selectProject(event.target.value)}
          className="min-w-0 flex-1 rounded bg-zinc-800 px-2 py-1.5 text-sm text-zinc-100 ring-1 ring-white/10"
        >
          <option value="">Escolha um projeto…</option>
          {projects.map((project) => (
            <option key={project.id} value={project.path}>
              {project.name}
            </option>
          ))}
        </select>
        {projectPath && (
          <button
            type="button"
            onClick={() => void refresh(projectPath)}
            disabled={busy}
            className="rounded p-1.5 text-zinc-400 hover:bg-white/10 hover:text-zinc-100 disabled:opacity-50"
            title="Atualizar status"
          >
            <RefreshCw size={14} />
          </button>
        )}
      </div>

      {projects.length === 0 && (
        <p className="text-sm text-zinc-500">
          Nenhum projeto cadastrado. Adicione um na ferramenta Projetos.
        </p>
      )}

      {error && (
        <p className="mb-2 rounded bg-red-950/50 p-2 text-xs text-red-300">{error}</p>
      )}

      {summary && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <GitBranch size={13} />
            <span className="text-zinc-200">{summary.branch ?? '—'}</span>
            {summary.isClean && <span className="text-emerald-400">· limpo</span>}
          </div>

          {summary.statusLines.length > 0 ? (
            <div className="max-h-32 overflow-auto rounded bg-zinc-800/60 p-2 font-mono text-[11px] text-zinc-300">
              {summary.statusLines.map((line, index) => (
                <div key={index} className="whitespace-nowrap">
                  {line}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-zinc-500">Sem alterações pendentes.</p>
          )}

          <button
            type="button"
            onClick={() => void stageAll()}
            disabled={busy || summary.isClean}
            className="flex items-center justify-center gap-2 rounded bg-zinc-700 px-3 py-1.5 text-sm text-zinc-100 hover:bg-zinc-600 disabled:opacity-50"
          >
            <Plus size={14} />
            Stage all
          </button>

          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Mensagem do commit…"
            rows={2}
            className="w-full resize-y rounded bg-zinc-800/60 p-2 text-sm text-zinc-200 outline-none placeholder:text-zinc-600"
          />
          <button
            type="button"
            onClick={() => void commit()}
            disabled={busy || !message.trim()}
            className="flex items-center justify-center gap-2 rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
          >
            <GitCommit size={14} />
            Commit
          </button>
        </div>
      )}
    </CanvasPanel>
  )
}
