import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  FileText,
  GitBranch,
  GitCommit,
  RefreshCw,
  Undo2,
  X,
} from 'lucide-react'
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
  const [isMutating, setIsMutating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [commitMessage, setCommitMessage] = useState('')

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
      setStatusMessage(null)
    } else {
      setSummary(null)
      setError(result?.message ?? 'Falha ao consultar Git.')
    }

    setIsLoading(false)
  }, [])

  async function executeGitMutation({
    action,
    confirmMessage,
    successMessage,
    onSuccess,
  }: {
    action: () => Promise<
      | {
          ok: boolean
          message?: string
          output?: string
          summary?: GitProjectSummary
        }
      | undefined
    >
    confirmMessage: string
    successMessage: string
    onSuccess?: () => void
  }) {
    if (!selectedProject) {
      setError('Selecione um projeto Git.')
      return
    }

    if (!window.confirm(confirmMessage)) {
      return
    }

    setIsMutating(true)
    setError(null)
    setStatusMessage(null)

    try {
      const result = await action()

      if (!result?.ok) {
        setError(result?.message ?? 'Falha ao executar operação Git.')
        return
      }

      if (result.summary) {
        setSummary(result.summary)
      } else {
        await refreshSummary(selectedProject.path)
      }

      onSuccess?.()
      setStatusMessage(result.output || successMessage)
    } catch (mutationError) {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : 'Falha ao executar operação Git.',
      )
    } finally {
      setIsMutating(false)
    }
  }

  function stageAll() {
    void executeGitMutation({
      confirmMessage: 'Preparar todas as alterações deste repositório?',
      successMessage: 'Alterações preparadas.',
      action: async () =>
        window.felixo?.git?.stageAll({
          projectPath: selectedProject?.path ?? '',
        }) ?? createMissingGitBridgeResult(),
    })
  }

  function unstageAll() {
    void executeGitMutation({
      confirmMessage: 'Remover todas as alterações do stage?',
      successMessage: 'Stage limpo.',
      action: async () =>
        window.felixo?.git?.unstageAll({
          projectPath: selectedProject?.path ?? '',
        }) ?? createMissingGitBridgeResult(),
    })
  }

  function commitStagedChanges() {
    const message = commitMessage.trim()

    if (!message) {
      setError('Informe uma mensagem de commit.')
      return
    }

    void executeGitMutation({
      confirmMessage: `Criar commit com a mensagem "${message}"?`,
      successMessage: 'Commit criado.',
      action: async () =>
        window.felixo?.git?.commit({
          projectPath: selectedProject?.path ?? '',
          message,
        }) ?? createMissingGitBridgeResult(),
      onSuccess: () => setCommitMessage(''),
    })
  }

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
              Operações Git básicas para os projetos ativos.
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

          <div className="mb-4 grid gap-2 rounded-2xl border border-white/[0.08] bg-black/10 p-3 md:grid-cols-[auto_auto_minmax(0,1fr)_auto]">
            <button
              type="button"
              onClick={stageAll}
              disabled={!selectedProject || isLoading || isMutating || summary?.isClean}
              className="flex h-10 items-center justify-center gap-2 rounded-2xl border border-white/[0.08] px-3 text-xs font-medium text-zinc-300 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:text-zinc-700 disabled:hover:bg-transparent"
            >
              <CheckCircle2 size={14} aria-hidden="true" />
              Stage tudo
            </button>

            <button
              type="button"
              onClick={unstageAll}
              disabled={!selectedProject || isLoading || isMutating || summary?.isClean}
              className="flex h-10 items-center justify-center gap-2 rounded-2xl border border-white/[0.08] px-3 text-xs font-medium text-zinc-300 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:text-zinc-700 disabled:hover:bg-transparent"
            >
              <Undo2 size={14} aria-hidden="true" />
              Unstage
            </button>

            <input
              value={commitMessage}
              onChange={(event) => setCommitMessage(event.target.value)}
              placeholder="Mensagem do commit"
              className="h-10 min-w-0 rounded-2xl border border-white/[0.08] bg-[#1a1a19] px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:ring-2 focus:ring-cyan-200/30"
            />

            <button
              type="button"
              onClick={commitStagedChanges}
              disabled={
                !selectedProject ||
                isLoading ||
                isMutating ||
                !commitMessage.trim()
              }
              className="flex h-10 items-center justify-center gap-2 rounded-2xl bg-zinc-100 px-4 text-xs font-medium text-zinc-950 transition hover:bg-white disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-500"
            >
              <GitCommit size={14} aria-hidden="true" />
              Commit
            </button>
          </div>

          {error ? (
            <p className="rounded-2xl border border-theme-error/20 bg-theme-error/10 px-3 py-2 text-sm text-theme-error">
              {error}
            </p>
          ) : statusMessage ? (
            <p className="mb-4 rounded-2xl border border-theme-success/20 bg-theme-success/10 px-3 py-2 text-sm text-theme-success">
              {statusMessage}
            </p>
          ) : (
            <GitSummary summary={displayedSummary} isLoading={isLoading} />
          )}

          {!error && statusMessage && (
            <GitSummary summary={displayedSummary} isLoading={isLoading || isMutating} />
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
          <p className="mt-3 text-sm text-theme-success">Working tree limpo.</p>
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

function createMissingGitBridgeResult() {
  return {
    ok: false,
    message: 'Bridge Git indisponível.',
  }
}
