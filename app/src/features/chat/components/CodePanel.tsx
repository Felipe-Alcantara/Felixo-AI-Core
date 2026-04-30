import { useCallback, useEffect, useMemo, useState } from 'react'
import { FileText, GitBranch, GitCommit, RefreshCw, X } from 'lucide-react'
import type { GitProjectSummary, Project } from '../types'

type CodePanelProps = {
  isOpen: boolean
  projects: Project[]
  activeProjectIds: Set<string>
  onClose: () => void
}

export function CodePanel({
  isOpen,
  projects,
  activeProjectIds,
  onClose,
}: CodePanelProps) {
  const projectOptions = useMemo(() => {
    const activeProjects = projects.filter((project) =>
      activeProjectIds.has(project.id),
    )

    return activeProjects.length > 0 ? activeProjects : projects
  }, [activeProjectIds, projects])
  const [selectedProjectPath, setSelectedProjectPath] = useState('')
  const [summary, setSummary] = useState<GitProjectSummary | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedProject =
    projectOptions.find((project) => project.path === selectedProjectPath) ??
    projectOptions[0] ??
    null

  const refreshSummary = useCallback(async (projectPath: string) => {
    if (!projectPath) {
      setSummary(null)
      setError('Adicione um projeto Git para consultar o painel Code.')
      return
    }

    setIsLoading(true)
    setError(null)

    const result = await window.felixo?.git?.getSummary({ projectPath })

    if (result?.ok && result.summary) {
      setSummary(result.summary)
      setError(null)
    } else {
      setSummary(null)
      setError(result?.message ?? 'Falha ao consultar Git.')
    }

    setIsLoading(false)
  }, [])

  useEffect(() => {
    if (!isOpen || !selectedProject) {
      return
    }

    queueMicrotask(() => {
      refreshSummary(selectedProject.path)
    })
  }, [isOpen, refreshSummary, selectedProject])

  if (!isOpen) {
    return null
  }

  const displayedSummary = selectedProject ? summary : null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <section
        className="flex max-h-[86vh] w-full max-w-[820px] flex-col rounded-3xl border border-white/10 bg-[#242423] shadow-shell"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">Code</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Base inicial para operacoes Git read-only dos projetos ativos.
            </p>
          </div>

          <button
            type="button"
            title="Fechar"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/[0.08] hover:text-zinc-100"
          >
            <X size={16} aria-hidden="true" />
            <span className="sr-only">Fechar</span>
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <select
              value={selectedProject?.path ?? ''}
              onChange={(event) => setSelectedProjectPath(event.target.value)}
              disabled={projectOptions.length === 0}
              className="h-10 min-w-0 flex-1 rounded-2xl border border-white/[0.08] bg-[#1a1a19] px-3 text-sm text-zinc-100 outline-none focus:ring-2 focus:ring-violet-200/30 disabled:cursor-not-allowed disabled:text-zinc-600"
            >
              {projectOptions.length === 0 ? (
                <option value="">Nenhum projeto</option>
              ) : (
                projectOptions.map((project) => (
                  <option key={project.id} value={project.path}>
                    {project.name}
                  </option>
                ))
              )}
            </select>

            <button
              type="button"
              title="Atualizar Git"
              onClick={() => refreshSummary(selectedProject?.path ?? '')}
              disabled={!selectedProject || isLoading}
              className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/[0.08] text-zinc-300 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:text-zinc-700 disabled:hover:bg-transparent"
            >
              <RefreshCw
                size={16}
                aria-hidden="true"
                className={isLoading ? 'animate-spin' : ''}
              />
              <span className="sr-only">Atualizar Git</span>
            </button>
          </div>

          {error ? (
            <p className="rounded-2xl border border-red-300/20 bg-red-400/10 px-3 py-2 text-sm text-red-200">
              {error}
            </p>
          ) : (
            <GitSummary summary={displayedSummary} isLoading={isLoading} />
          )}
        </div>
      </section>
    </div>
  )
}

function GitSummary({
  summary,
  isLoading,
}: {
  summary: GitProjectSummary | null
  isLoading: boolean
}) {
  if (isLoading && !summary) {
    return <p className="text-sm text-zinc-500">Consultando Git...</p>
  }

  if (!summary) {
    return <p className="text-sm text-zinc-500">Selecione um projeto Git.</p>
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <section className="rounded-2xl border border-white/[0.08] bg-black/10 p-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-medium text-zinc-300">
          <GitBranch size={14} aria-hidden="true" />
          Status
        </div>
        <p className="font-mono text-xs text-zinc-500">
          Branch: {summary.branch ?? 'desconhecida'}
        </p>
        {summary.isClean ? (
          <p className="mt-3 text-sm text-emerald-200">Working tree limpo.</p>
        ) : (
          <pre className="mt-3 max-h-52 overflow-auto whitespace-pre-wrap rounded-xl bg-black/20 p-2 font-mono text-[11px] leading-relaxed text-zinc-300">
            {summary.statusLines.join('\n')}
          </pre>
        )}
      </section>

      <section className="rounded-2xl border border-white/[0.08] bg-black/10 p-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-medium text-zinc-300">
          <FileText size={14} aria-hidden="true" />
          Diff stat
        </div>
        <pre className="max-h-52 overflow-auto whitespace-pre-wrap rounded-xl bg-black/20 p-2 font-mono text-[11px] leading-relaxed text-zinc-300">
          {summary.diffStat || 'Sem diff unstaged.'}
        </pre>
      </section>

      <section className="rounded-2xl border border-white/[0.08] bg-black/10 p-3 md:col-span-2">
        <div className="mb-2 flex items-center gap-2 text-xs font-medium text-zinc-300">
          <GitCommit size={14} aria-hidden="true" />
          Commits recentes
        </div>
        <pre className="max-h-52 overflow-auto whitespace-pre-wrap rounded-xl bg-black/20 p-2 font-mono text-[11px] leading-relaxed text-zinc-300">
          {summary.recentCommits.join('\n') || 'Sem commits para exibir.'}
        </pre>
      </section>
    </div>
  )
}
