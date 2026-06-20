import { useCallback, useEffect, useState } from 'react'
import { GitBranch, GitCommit, Plus } from 'lucide-react'
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
      return
    }
    const result = await window.felixo?.git?.getSummary({ projectPath: path })
    setSummary(result?.ok && result.summary ? (result.summary as GitSummary) : null)
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
      await window.felixo?.git?.stageAll({ projectPath })
      await refresh(projectPath)
    } finally {
      setBusy(false)
    }
  }, [projectPath, refresh])

  const commit = useCallback(async () => {
    if (!projectPath || !message.trim()) return
    setBusy(true)
    try {
      await window.felixo?.git?.commit({ projectPath, message: message.trim() })
      setMessage('')
      await refresh(projectPath)
    } finally {
      setBusy(false)
    }
  }, [projectPath, message, refresh])

  return (
    <CanvasPanel title="Git" icon={<GitBranch size={15} />} onClose={onClose}>
      <select
        value={projectPath}
        onChange={(event) => selectProject(event.target.value)}
        className="mb-3 w-full rounded bg-zinc-800 px-2 py-1.5 text-sm text-zinc-100 ring-1 ring-white/10"
      >
        <option value="">Escolha um projeto…</option>
        {projects.map((project) => (
          <option key={project.id} value={project.path}>
            {project.name}
          </option>
        ))}
      </select>

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
            <p className="text-xs text-zinc-500">Sem alteracoes pendentes.</p>
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
