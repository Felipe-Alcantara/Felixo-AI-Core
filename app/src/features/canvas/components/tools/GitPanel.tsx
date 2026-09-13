import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Check,
  FileDiff,
  GitBranch,
  GitCommit,
  Minus,
  Plus,
  RefreshCw,
} from 'lucide-react'
import { FelixoSelect } from '../../../shared/components/FelixoSelect'
import { CanvasPanel } from './CanvasPanel'
import { GitDiffView } from './GitDiffView'
import {
  parseStatusEntries,
  splitPath,
  statusDescriptor,
  type GitStatusEntry,
} from './git-status'

type CanvasProject = { id: string; name: string; path: string }

type GitSummary = {
  branch: string | null
  statusLines: string[]
  diffStat: string
  recentCommits: string[]
  isClean: boolean
  error?: string
}

type GitPanelProps = {
  onClose: () => void
  /** Widens the toolbar column; the panel slides over to clear it. */
  toolsMenuOpen?: boolean
}

/** Arquivo aberto no leitor de diferenças, e de qual lado ele está sendo visto. */
type SelectedFile = { path: string; staged: boolean; untracked: boolean }

/**
 * Controle de versão do canvas.
 *
 * A lista é por arquivo, não as linhas cruas do `git status --short`: quem vai
 * revisar um commit precisa ver o que mudou em cada arquivo e escolher, um a
 * um, o que entra — e não decorar o formato porcelain. Um mesmo arquivo pode
 * aparecer nos dois grupos (editado depois de adicionado é o caso comum), que
 * é exatamente o que a lista antiga escondia ao mostrar só uma linha de texto.
 */
export function GitPanel({ onClose, toolsMenuOpen }: GitPanelProps) {
  const [projects, setProjects] = useState<CanvasProject[]>([])
  const [projectPath, setProjectPath] = useState('')
  const [summary, setSummary] = useState<GitSummary | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<SelectedFile | null>(null)
  const [diff, setDiff] = useState<string | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)

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

  const loadDiff = useCallback(async (file: SelectedFile | null, path: string) => {
    if (!file || !path) {
      setDiff(null)
      return
    }
    setDiffLoading(true)
    try {
      const result = await window.felixo?.git?.getFileDiff({
        projectPath: path,
        filePath: file.path,
        staged: file.staged,
        untracked: file.untracked,
      })
      setDiff(result?.ok ? (result.diff?.diff ?? '') : null)
      if (result && !result.ok && result.message) setError(result.message)
    } finally {
      setDiffLoading(false)
    }
  }, [])

  const selectProject = useCallback(
    (path: string) => {
      setProjectPath(path)
      setSelected(null)
      setDiff(null)
      void refresh(path)
    },
    [refresh],
  )

  const entries = useMemo(
    () => parseStatusEntries(summary?.statusLines ?? []),
    [summary],
  )
  const staged = useMemo(() => entries.filter((item) => item.staged), [entries])
  const unstaged = useMemo(
    () => entries.filter((item) => item.unstaged || item.untracked),
    [entries],
  )

  const openFile = useCallback(
    (entry: GitStatusEntry, stagedSide: boolean) => {
      const file: SelectedFile = {
        path: entry.path,
        staged: stagedSide,
        untracked: entry.untracked,
      }
      setSelected(file)
      void loadDiff(file, projectPath)
    },
    [loadDiff, projectPath],
  )

  /**
   * Envolve uma ação de git: trava a interface, recarrega o status e, se havia
   * um arquivo aberto, relê o diff — senão o leitor continuaria mostrando o
   * estado anterior ao que a pessoa acabou de fazer.
   */
  const runAction = useCallback(
    async (
      action: () => Promise<{ ok?: boolean; message?: string } | undefined> | undefined,
      fallback: string,
    ) => {
      if (!projectPath) return
      setBusy(true)
      try {
        const result = await action()
        if (!result?.ok) {
          setError(result?.message ?? fallback)
          return
        }
        setError(null)
        await refresh(projectPath)
        await loadDiff(selected, projectPath)
      } finally {
        setBusy(false)
      }
    },
    [loadDiff, projectPath, refresh, selected],
  )

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
      setError(null)
      setMessage('')
      setSelected(null)
      setDiff(null)
      await refresh(projectPath)
    } finally {
      setBusy(false)
    }
  }, [message, projectPath, refresh])

  const projectOptions = useMemo(
    () => projects.map((project) => ({ value: project.path, label: project.name })),
    [projects],
  )

  return (
    <CanvasPanel
      title="Controle de versão"
      panelId="git"
      variant="workspace"
      icon={<GitBranch size={15} />}
      onClose={onClose}
      toolsMenuOpen={toolsMenuOpen}
    >
      <div className="felixo-scm">
        <header className="felixo-scm-head">
          <FelixoSelect
            value={projectPath}
            options={projectOptions}
            onChange={selectProject}
            placeholder="Escolha um repositório…"
            aria-label="Repositório"
            className="felixo-scm-project"
          />
          {summary && (
            <span className="felixo-scm-branch" title="Branch atual">
              <GitBranch size={13} aria-hidden />
              {summary.branch ?? '—'}
            </span>
          )}
          <span className="felixo-scm-spacer" />
          {projectPath && (
            <button
              type="button"
              onClick={() => void refresh(projectPath)}
              disabled={busy}
              className="felixo-btn-icon felixo-scm-refresh"
              title="Atualizar status"
              aria-label="Atualizar status"
            >
              <RefreshCw size={14} />
            </button>
          )}
        </header>

        {projects.length === 0 && (
          <p className="felixo-scm-empty">
            Nenhum projeto cadastrado. Adicione um na ferramenta Projetos.
          </p>
        )}

        {error && <p className="felixo-scm-error">{error}</p>}

        {summary && (
          <div className="felixo-scm-body">
            <div className="felixo-scm-side">
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Mensagem do commit…"
                rows={2}
                className="felixo-scm-message"
                aria-label="Mensagem do commit"
              />
              <button
                type="button"
                onClick={() => void commit()}
                disabled={busy || !message.trim() || staged.length === 0}
                className="felixo-btn felixo-scm-commit"
                title={
                  staged.length === 0
                    ? 'Nada no stage: adicione ao menos um arquivo'
                    : 'Criar commit com o que está no stage'
                }
              >
                <GitCommit size={14} aria-hidden />
                Commit{staged.length > 0 ? ` (${staged.length})` : ''}
              </button>

              <FileGroup
                title="Stage"
                entries={staged}
                selected={selected}
                stagedSide
                actionLabel="Tirar do stage"
                actionIcon={<Minus size={13} aria-hidden />}
                bulkLabel="Tirar tudo do stage"
                disabled={busy}
                onOpen={(entry) => openFile(entry, true)}
                onFileAction={(entry) =>
                  void runAction(
                    () =>
                      window.felixo?.git?.unstageFile({
                        projectPath,
                        filePath: entry.path,
                      }),
                    'Falha ao tirar do stage.',
                  )
                }
                onBulk={() =>
                  void runAction(
                    () => window.felixo?.git?.unstageAll({ projectPath }),
                    'Falha ao tirar do stage.',
                  )
                }
              />

              <FileGroup
                title="Alterações"
                entries={unstaged}
                selected={selected}
                stagedSide={false}
                actionLabel="Adicionar ao stage"
                actionIcon={<Plus size={13} aria-hidden />}
                bulkLabel="Adicionar tudo ao stage"
                disabled={busy}
                onOpen={(entry) => openFile(entry, false)}
                onFileAction={(entry) =>
                  void runAction(
                    () =>
                      window.felixo?.git?.stageFile({
                        projectPath,
                        filePath: entry.path,
                      }),
                    'Falha ao adicionar ao stage.',
                  )
                }
                onBulk={() =>
                  void runAction(
                    () => window.felixo?.git?.stageAll({ projectPath }),
                    'Falha ao adicionar ao stage.',
                  )
                }
              />

              {entries.length === 0 && (
                <p className="felixo-scm-clean">
                  <Check size={13} aria-hidden />
                  Sem alterações pendentes.
                </p>
              )}
            </div>

            <GitDiffView
              file={selected}
              diff={diff}
              loading={diffLoading}
              icone={<FileDiff size={22} aria-hidden />}
            />
          </div>
        )}
      </div>
    </CanvasPanel>
  )
}

type FileGroupProps = {
  title: string
  entries: GitStatusEntry[]
  selected: SelectedFile | null
  /** `true` no grupo que mostra o lado do stage. */
  stagedSide: boolean
  actionLabel: string
  actionIcon: ReactNode
  bulkLabel: string
  disabled: boolean
  onOpen: (entry: GitStatusEntry) => void
  onFileAction: (entry: GitStatusEntry) => void
  onBulk: () => void
}

function FileGroup({
  title,
  entries,
  selected,
  stagedSide,
  actionLabel,
  actionIcon,
  bulkLabel,
  disabled,
  onOpen,
  onFileAction,
  onBulk,
}: FileGroupProps) {
  if (entries.length === 0) return null

  return (
    <section className="felixo-scm-group">
      <header className="felixo-scm-group-head">
        <span className="felixo-scm-group-title">{title}</span>
        <span className="felixo-scm-count">{entries.length}</span>
        <button
          type="button"
          onClick={onBulk}
          disabled={disabled}
          className="felixo-btn-icon felixo-scm-group-action"
          title={bulkLabel}
          aria-label={bulkLabel}
        >
          {actionIcon}
        </button>
      </header>
      <ul className="felixo-scm-list">
        {entries.map((entry) => {
          const { dir, name } = splitPath(entry.path)
          const badge = statusDescriptor(entry, stagedSide)
          const active = selected?.path === entry.path && selected.staged === stagedSide
          return (
            <li key={entry.path}>
              <div className={`felixo-scm-row ${active ? 'is-active' : ''}`}>
                <button
                  type="button"
                  onClick={() => onOpen(entry)}
                  className="felixo-scm-open"
                  title={entry.path}
                >
                  <span className="felixo-scm-name">{name}</span>
                  {dir && <span className="felixo-scm-dir">{dir}</span>}
                </button>
                <button
                  type="button"
                  onClick={() => onFileAction(entry)}
                  disabled={disabled}
                  className="felixo-btn-icon felixo-scm-row-action"
                  title={`${actionLabel}: ${entry.path}`}
                  aria-label={`${actionLabel}: ${entry.path}`}
                >
                  {actionIcon}
                </button>
                <span
                  className={`felixo-scm-badge is-${badge.tone}`}
                  title={badge.label}
                  aria-label={badge.label}
                >
                  {badge.letter}
                </span>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
