import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  FileDiff,
  GitBranch,
  GitCommit as GitCommitIcon,
  Minus,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
} from 'lucide-react'
import type { GitCommit, GitProjectSummary, GitRepoFile } from '../../../chat/types'
import { FelixoSelect } from '../../../shared/components/FelixoSelect'
import { CanvasPanel } from './CanvasPanel'
import { GitChangesList, type SelectedFile } from './GitChangesList'
import { GitDiffView } from './GitDiffView'
import { GitExplorer } from './GitExplorer'
import { GitHistory } from './GitHistory'
import { parseStatusEntries, type GitStatusEntry } from './git-status'
import { ancestorPaths, buildRepoTree, dirsWithChanges } from './repo-tree'

type CanvasProject = { id: string; name: string; path: string }

type GitPanelProps = {
  onClose: () => void
  /** Widens the toolbar column; the panel slides over to clear it. */
  toolsMenuOpen?: boolean
}

type ActionResult = { ok?: boolean; message?: string; output?: string } | undefined

/**
 * Source Control do canvas.
 *
 * Três colunas lado a lado: o repositório inteiro, as alterações pendentes e o
 * leitor. O editor que serviu de referência obriga a trocar de visão entre a
 * árvore e as mudanças — aqui as duas ficam abertas, porque são a mesma
 * pergunta vista de dois lados ("o que existe" e "o que mudou"), e ir de uma à
 * outra é o trabalho inteiro de preparar um commit.
 *
 * O cabeçalho carrega o que se faz antes e depois do commit: trocar de branch,
 * puxar e enviar. Só as formas seguras — `pull --ff-only`, `push` sem force —
 * porque tudo que reescreve histórico é trabalho para o terminal, com a
 * pessoa olhando.
 */
export function GitPanel({ onClose, toolsMenuOpen }: GitPanelProps) {
  const [projects, setProjects] = useState<CanvasProject[]>([])
  const [projectPath, setProjectPath] = useState('')
  const [summary, setSummary] = useState<GitProjectSummary | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Resultado de push/pull/troca de branch — informação, não erro. */
  const [notice, setNotice] = useState<string | null>(null)

  const [selected, setSelected] = useState<SelectedFile | null>(null)
  const [diff, setDiff] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState<GitRepoFile | null>(null)
  const [readerLoading, setReaderLoading] = useState(false)

  const [files, setFiles] = useState<string[]>([])
  const [treeTotal, setTreeTotal] = useState(0)
  const [treeTruncated, setTreeTruncated] = useState(false)
  const [treeLoading, setTreeLoading] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [changedOnly, setChangedOnly] = useState(false)
  const [explorerOpen, setExplorerOpen] = useState(true)

  const [branches, setBranches] = useState<string[]>([])
  const [commits, setCommits] = useState<GitCommit[]>([])
  const [historyReadAt, setHistoryReadAt] = useState(0)
  const [historyLoading, setHistoryLoading] = useState(false)
  /** A coluna do meio mostra o que está por vir (alterações) ou o que já foi (histórico). */
  const [view, setView] = useState<'changes' | 'history'>('changes')

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
      return null
    }
    const result = await window.felixo?.git?.getSummary({ projectPath: path })
    if (result?.ok && result.summary) {
      setSummary(result.summary)
      setError(result.summary.error ?? null)
      return result.summary
    }
    setSummary(null)
    setError(result?.message ?? 'Falha ao consultar o repositório Git.')
    return null
  }, [])

  const loadTree = useCallback(async (path: string) => {
    if (!path) {
      setFiles([])
      setTreeTotal(0)
      setTreeTruncated(false)
      return [] as string[]
    }
    setTreeLoading(true)
    try {
      const result = await window.felixo?.git?.listFiles({ projectPath: path })
      const next = result?.ok && result.tree ? result.tree.files : []
      setFiles(next)
      setTreeTotal(result?.tree?.total ?? next.length)
      setTreeTruncated(Boolean(result?.tree?.truncated))
      return next
    } finally {
      setTreeLoading(false)
    }
  }, [])

  const loadBranches = useCallback(async (path: string) => {
    if (!path) {
      setBranches([])
      return
    }
    const result = await window.felixo?.git?.listBranches({
      projectPath: path,
    })
    setBranches(result?.ok && result.branches ? result.branches : [])
  }, [])

  const loadLog = useCallback(async (path: string) => {
    if (!path) {
      setCommits([])
      return
    }
    setHistoryLoading(true)
    try {
      const result = await window.felixo?.git?.getLog({ projectPath: path })
      setCommits(result?.ok && result.commits ? result.commits : [])
      setHistoryReadAt(Date.now())
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  /**
   * Alimenta o leitor: diff para quem tem alteração, conteúdo para quem não.
   * Um arquivo limpo não tem diff a pedir — mandar o git comparar o arquivo
   * com ele mesmo devolveria vazio, que a tela leria como "binário".
   */
  const loadReader = useCallback(async (file: SelectedFile | null, path: string) => {
    if (!file || !path) {
      setDiff(null)
      setFileContent(null)
      return
    }
    setReaderLoading(true)
    try {
      if (file.clean) {
        const result = await window.felixo?.git?.readFile({
          projectPath: path,
          filePath: file.path,
        })
        setDiff(null)
        setFileContent(result?.ok ? (result.file ?? null) : null)
        if (result && !result.ok && result.message) setError(result.message)
        return
      }
      const result = await window.felixo?.git?.getFileDiff({
        projectPath: path,
        filePath: file.path,
        staged: file.staged,
        untracked: file.untracked,
      })
      setFileContent(null)
      setDiff(result?.ok ? (result.diff?.diff ?? '') : null)
      if (result && !result.ok && result.message) setError(result.message)
    } finally {
      setReaderLoading(false)
    }
  }, [])

  const selectProject = useCallback(
    async (path: string) => {
      setProjectPath(path)
      setSelected(null)
      setDiff(null)
      setFileContent(null)
      setNotice(null)
      setQuery('')
      const [next, repoFiles] = await Promise.all([
        refresh(path),
        loadTree(path),
        loadBranches(path),
        loadLog(path),
      ])
      // O repositório abre já aberto onde há mudança: fechado na raiz, uma
      // árvore grande esconde exatamente o que trouxe a pessoa até aqui.
      const tree = buildRepoTree(repoFiles, parseStatusEntries(next?.statusLines ?? []))
      setExpanded(new Set(dirsWithChanges(tree)))
    },
    [loadBranches, loadLog, loadTree, refresh],
  )

  const entries = useMemo(() => parseStatusEntries(summary?.statusLines ?? []), [summary])
  const staged = useMemo(() => entries.filter((item) => item.staged), [entries])
  const unstaged = useMemo(
    () => entries.filter((item) => item.unstaged || item.untracked),
    [entries],
  )
  const tree = useMemo(() => buildRepoTree(files, entries), [entries, files])

  /** Abre as pastas até o arquivo, para ele aparecer selecionado na árvore. */
  const reveal = useCallback((path: string) => {
    const ancestors = ancestorPaths(path)
    if (ancestors.length === 0) return
    setExpanded((current) => {
      const next = new Set(current)
      for (const ancestor of ancestors) next.add(ancestor)
      return next
    })
  }, [])

  const openFile = useCallback(
    (entry: GitStatusEntry, stagedSide: boolean) => {
      const file: SelectedFile = {
        path: entry.path,
        staged: stagedSide,
        untracked: entry.untracked,
      }
      setSelected(file)
      reveal(entry.path)
      void loadReader(file, projectPath)
    },
    [loadReader, projectPath, reveal],
  )

  /**
   * Abre um arquivo pela árvore. Com alteração pendente, mostra o lado que a
   * pessoa ainda pode mexer — o não preparado, quando existe, senão o do
   * stage. Sem alteração, mostra o arquivo como está no disco.
   */
  const openPath = useCallback(
    (path: string) => {
      const entry = entries.find((item) => item.path === path)
      if (!entry) {
        const file: SelectedFile = {
          path,
          staged: false,
          untracked: false,
          clean: true,
        }
        setSelected(file)
        void loadReader(file, projectPath)
        return
      }
      openFile(entry, !(entry.unstaged || entry.untracked))
    },
    [entries, loadReader, openFile, projectPath],
  )

  const toggleDir = useCallback((path: string) => {
    setExpanded((current) => {
      const next = new Set(current)
      if (!next.delete(path)) next.add(path)
      return next
    })
  }, [])

  /**
   * Envolve uma ação de git: trava a interface, recarrega o status e, se havia
   * um arquivo aberto, relê o leitor — senão ele continuaria mostrando o
   * estado anterior ao que a pessoa acabou de fazer.
   */
  const runAction = useCallback(
    async (
      action: () => Promise<ActionResult> | undefined,
      fallback: string,
      options: {
        reloadTree?: boolean
        reloadLog?: boolean
        keepSelection?: boolean
      } = {},
    ) => {
      if (!projectPath) return
      setBusy(true)
      setNotice(null)
      try {
        const result = await action()
        if (!result?.ok) {
          setError(result?.message ?? fallback)
          return
        }
        setError(null)
        if (result.output) setNotice(result.output)
        const tasks: Promise<unknown>[] = [refresh(projectPath)]
        if (options.reloadTree) tasks.push(loadTree(projectPath))
        if (options.reloadLog) tasks.push(loadLog(projectPath), loadBranches(projectPath))
        await Promise.all(tasks)
        if (options.keepSelection === false) {
          setSelected(null)
          setDiff(null)
          setFileContent(null)
        } else {
          await loadReader(selected, projectPath)
        }
      } finally {
        setBusy(false)
      }
    },
    [loadBranches, loadLog, loadReader, loadTree, projectPath, refresh, selected],
  )

  const commit = useCallback(async () => {
    if (!message.trim()) return
    const text = message.trim()
    await runAction(
      () => window.felixo?.git?.commit({ projectPath, message: text }),
      'Falha ao criar o commit.',
      // Um commit muda o que existe no repositório, não só o que está sujo:
      // arquivo novo deixa de ser novo e arquivo apagado some da árvore.
      { reloadTree: true, reloadLog: true, keepSelection: false },
    )
    setMessage('')
  }, [message, projectPath, runAction])

  const discard = useCallback(
    (entry: GitStatusEntry) => {
      const question = entry.untracked
        ? `Apagar o arquivo novo "${entry.path}"? Ele ainda não está no git e não tem como voltar.`
        : `Descartar as alterações de "${entry.path}" e voltar ao último commit? Isso não tem como desfazer.`
      if (!window.confirm(question)) return
      void runAction(
        () =>
          window.felixo?.git?.discardFile({
            projectPath,
            filePath: entry.path,
            untracked: entry.untracked,
          }),
        'Falha ao descartar as alterações.',
        { reloadTree: true, keepSelection: selected?.path !== entry.path },
      )
    },
    [projectPath, runAction, selected],
  )

  const switchBranch = useCallback(
    (branch: string) => {
      if (!branch || branch === summary?.branch) return
      void runAction(
        () => window.felixo?.git?.switchBranch({ projectPath, branch }),
        'Falha ao trocar de branch.',
        { reloadTree: true, reloadLog: true, keepSelection: false },
      )
    },
    [projectPath, runAction, summary],
  )

  const refreshAll = useCallback(async () => {
    if (!projectPath) return
    await Promise.all([
      refresh(projectPath),
      loadTree(projectPath),
      loadBranches(projectPath),
      loadLog(projectPath),
    ])
  }, [loadBranches, loadLog, loadTree, projectPath, refresh])

  const projectOptions = useMemo(
    () => projects.map((project) => ({ value: project.path, label: project.name })),
    [projects],
  )
  const branchOptions = useMemo(() => {
    const known = new Set(branches)
    if (summary?.branch && !known.has(summary.branch)) known.add(summary.branch)
    return [...known].sort().map((name) => ({ value: name, label: name }))
  }, [branches, summary])

  const ahead = summary?.ahead ?? 0
  const behind = summary?.behind ?? 0

  return (
    <CanvasPanel
      title="Source Control"
      panelId="git"
      variant="workspace"
      icon={<GitBranch size={15} />}
      onClose={onClose}
      toolsMenuOpen={toolsMenuOpen}
    >
      <div className="felixo-scm">
        <header className="felixo-scm-head">
          {summary && (
            <button
              type="button"
              onClick={() => setExplorerOpen((current) => !current)}
              className="felixo-btn-icon felixo-scm-head-icon"
              title={explorerOpen ? 'Esconder o explorador' : 'Mostrar o explorador'}
              aria-pressed={explorerOpen}
            >
              {explorerOpen ? <PanelLeftClose size={14} /> : <PanelLeftOpen size={14} />}
            </button>
          )}
          <FelixoSelect
            value={projectPath}
            options={projectOptions}
            onChange={(path) => void selectProject(path)}
            placeholder="Escolha um repositório…"
            aria-label="Repositório"
            className="felixo-scm-project"
          />
          {summary && (
            <div
              className="felixo-scm-branch-field"
              title="Branch atual — escolha outra para trocar"
            >
              <GitBranch size={13} aria-hidden />
              <FelixoSelect
                value={summary.branch ?? ''}
                options={branchOptions}
                onChange={switchBranch}
                disabled={busy}
                searchable={branchOptions.length > 8}
                placeholder="sem branch"
                aria-label="Branch"
                className="felixo-scm-branch"
              />
              {summary.upstream ? (
                <span
                  className="felixo-scm-sync"
                  title={`${summary.upstream}: ${ahead} para enviar, ${behind} para puxar`}
                >
                  <ArrowUpFromLine size={11} aria-hidden />
                  {ahead}
                  <ArrowDownToLine size={11} aria-hidden />
                  {behind}
                </span>
              ) : (
                <span
                  className="felixo-scm-sync is-muted"
                  title="Esta branch ainda não tem upstream"
                >
                  sem remoto
                </span>
              )}
            </div>
          )}
          <span className="felixo-scm-spacer" />
          {summary && (
            <div className="felixo-scm-head-actions">
              <button
                type="button"
                onClick={() =>
                  void runAction(
                    () => window.felixo?.git?.pull({ projectPath }),
                    'Falha ao atualizar (pull).',
                    { reloadTree: true, reloadLog: true },
                  )
                }
                disabled={busy || !summary.upstream}
                className="felixo-btn felixo-scm-head-action"
                title={
                  summary.upstream
                    ? 'Puxar do remoto (só avanço rápido)'
                    : 'Sem upstream: não há de onde puxar'
                }
                aria-label={`Pull${behind > 0 ? ` (${behind})` : ''}`}
              >
                <ArrowDownToLine size={13} aria-hidden />
                <span className="felixo-scm-head-label">Pull</span>
                {behind > 0 && <span className="felixo-scm-head-count">{behind}</span>}
              </button>
              <button
                type="button"
                onClick={() =>
                  void runAction(
                    () => window.felixo?.git?.push({ projectPath }),
                    'Falha ao enviar (push).',
                    { reloadLog: true },
                  )
                }
                disabled={busy || !summary.branch}
                className="felixo-btn felixo-scm-head-action"
                title={
                  summary.upstream
                    ? 'Enviar commits para o remoto'
                    : 'Enviar e definir o upstream em origin'
                }
                aria-label={`Push${ahead > 0 ? ` (${ahead})` : ''}`}
              >
                <ArrowUpFromLine size={13} aria-hidden />
                <span className="felixo-scm-head-label">Push</span>
                {ahead > 0 && <span className="felixo-scm-head-count">{ahead}</span>}
              </button>
              <button
                type="button"
                onClick={() => void refreshAll()}
                disabled={busy}
                className="felixo-btn-icon felixo-scm-head-icon"
                title="Atualizar"
                aria-label="Atualizar"
              >
                <RefreshCw size={14} className={busy ? 'felixo-spin' : undefined} />
              </button>
            </div>
          )}
        </header>

        {projects.length === 0 && (
          <p className="felixo-scm-empty">
            Nenhum projeto cadastrado. Adicione um na ferramenta Projetos.
          </p>
        )}

        {error && <p className="felixo-scm-error">{error}</p>}
        {!error && notice && <p className="felixo-scm-notice">{notice}</p>}

        {summary && (
          <div className={`felixo-scm-body ${explorerOpen ? 'has-explorer' : ''}`}>
            {explorerOpen && (
              <GitExplorer
                root={tree}
                expanded={expanded}
                selectedPath={selected?.path ?? null}
                query={query}
                changedOnly={changedOnly}
                loading={treeLoading}
                truncated={treeTruncated}
                total={treeTotal}
                onQueryChange={setQuery}
                onChangedOnlyChange={setChangedOnly}
                onToggleDir={toggleDir}
                onOpenFile={openPath}
              />
            )}

            <div className="felixo-scm-side">
              <div className="felixo-scm-tabs" role="tablist" aria-label="Coluna do meio">
                <button
                  type="button"
                  role="tab"
                  aria-selected={view === 'changes'}
                  onClick={() => setView('changes')}
                  className={`felixo-btn felixo-scm-tab ${view === 'changes' ? 'is-active' : ''}`}
                >
                  Alterações
                  {entries.length > 0 && <span className="felixo-scm-count">{entries.length}</span>}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={view === 'history'}
                  onClick={() => setView('history')}
                  className={`felixo-btn felixo-scm-tab ${view === 'history' ? 'is-active' : ''}`}
                >
                  Histórico
                  {ahead > 0 && (
                    <span
                      className="felixo-scm-count is-warning"
                      title={`${ahead} commit(s) ainda não enviados`}
                    >
                      {ahead}
                    </span>
                  )}
                </button>
              </div>

              {view === 'history' && (
                <GitHistory
                  commits={commits}
                  loading={historyLoading}
                  ahead={ahead}
                  now={historyReadAt}
                />
              )}

              {view === 'changes' && (
                <>
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
                    <GitCommitIcon size={14} aria-hidden />
                    Commit{staged.length > 0 ? ` (${staged.length})` : ''}
                  </button>

                  <GitChangesList
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

                  <GitChangesList
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
                    onDiscard={discard}
                  />

                  {entries.length === 0 && (
                    <p className="felixo-scm-clean">
                      <Check size={13} aria-hidden />
                      Sem alterações pendentes.
                    </p>
                  )}
                </>
              )}
            </div>

            <GitDiffView
              file={selected}
              diff={diff}
              content={fileContent}
              loading={readerLoading}
              icone={<FileDiff size={22} aria-hidden />}
            />
          </div>
        )}
      </div>
    </CanvasPanel>
  )
}
