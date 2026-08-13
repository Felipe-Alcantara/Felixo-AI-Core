import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  EyeOff,
  FileText,
  RefreshCw,
  RotateCcw,
  Search,
  X,
} from 'lucide-react'
import { CanvasPanel } from './CanvasPanel'
import {
  buildPlanSections,
  countAutoCommitCandidates,
  describeProgress,
  planHasSafeActions,
  summarizeResults,
} from './fetch-all-plan'
import type {
  FetchAllActionResult,
  FetchAllPlan,
  FetchAllProgress,
  FetchAllSettings,
} from '../../types'

type FetchAllPanelProps = {
  onClose: () => void
  /** Widens the toolbar column; the panel slides over to clear it. */
  toolsMenuOpen?: boolean
}

const TONE_CLASSES = {
  action: 'text-emerald-400',
  warning: 'text-amber-400',
  neutral: 'text-zinc-500',
} as const

/**
 * Ferramenta Fetch All do canvas: varre os discos atrás de repositórios git,
 * mostra o plano de sincronização e executa só o que é seguro.
 *
 * A execução é sempre um segundo passo confirmado: a varredura só lê (o fetch
 * mexe apenas nas referências dentro de `.git`), e pull/push/commit acontecem
 * depois de a pessoa revisar o plano e confirmar.
 */
export function FetchAllPanel({ onClose, toolsMenuOpen }: FetchAllPanelProps) {
  const [plan, setPlan] = useState<FetchAllPlan | null>(null)
  const [settings, setSettings] = useState<FetchAllSettings | null>(null)
  const [progress, setProgress] = useState<FetchAllProgress | null>(null)
  const [results, setResults] = useState<FetchAllActionResult[] | null>(null)
  const [reportPath, setReportPath] = useState('')
  const [scanMode, setScanMode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [autoCommit, setAutoCommit] = useState(false)
  const [confirmingExecute, setConfirmingExecute] = useState(false)
  const [showIgnored, setShowIgnored] = useState(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const loadSettings = useCallback(async () => {
    const result = await window.felixo?.fetchAll?.getSettings()
    if (mountedRef.current && result?.ok && result.settings) {
      setSettings(result.settings)
    }
  }, [])

  // Retoma o que já existe: a varredura roda no processo principal e continua
  // viva mesmo com o painel fechado, então reabrir não pode zerar o plano.
  useEffect(() => {
    void (async () => {
      const [state] = await Promise.all([
        window.felixo?.fetchAll?.getState(),
        loadSettings(),
      ])
      if (!mountedRef.current || !state?.ok) return
      setPlan(state.plan ?? null)
      setScanMode(state.scanMode ?? '')
      setBusy(Boolean(state.busy))
    })()
  }, [loadSettings])

  useEffect(
    () =>
      window.felixo?.fetchAll?.onProgress((event) => {
        setProgress(event.type === 'done' ? null : event)
      }),
    [],
  )

  const sections = useMemo(() => buildPlanSections(plan), [plan])
  const autoCommitCount = useMemo(() => countAutoCommitCandidates(plan), [plan])
  const canExecute = planHasSafeActions(plan, autoCommit)
  const progressLabel = describeProgress(progress)

  const scan = useCallback(async (useCache: boolean) => {
    setBusy(true)
    setError(null)
    setResults(null)
    setReportPath('')
    setConfirmingExecute(false)

    try {
      const result = await window.felixo?.fetchAll?.scan({ useCache })
      if (!mountedRef.current) return
      if (!result?.ok) {
        setError(result?.message ?? 'Falha ao varrer os discos.')
        return
      }
      if (result.cancelled) return
      setPlan(result.plan ?? null)
      setScanMode(result.scanMode ?? '')
    } finally {
      if (mountedRef.current) {
        setBusy(false)
        setProgress(null)
      }
    }
  }, [])

  const execute = useCallback(async () => {
    setBusy(true)
    setError(null)
    setConfirmingExecute(false)

    try {
      const result = await window.felixo?.fetchAll?.execute({ autoCommit })
      if (!mountedRef.current) return
      if (!result?.ok) {
        setError(result?.message ?? 'Falha ao executar o plano.')
        return
      }
      setResults(result.results ?? [])
      setReportPath(result.reportPath ?? '')
      // O plano executado envelheceu junto com os repositórios: o serviço o
      // descarta, e a interface não pode continuar oferecendo as mesmas ações.
      setPlan(null)
    } finally {
      if (mountedRef.current) {
        setBusy(false)
        setProgress(null)
      }
    }
  }, [autoCommit])

  const ignorePath = useCallback(async (targetPath: string) => {
    const result = await window.felixo?.fetchAll?.ignorePath({ path: targetPath })
    if (!mountedRef.current) return
    if (!result?.ok) {
      setError(result?.message ?? 'Falha ao ignorar a pasta.')
      return
    }
    if (result.settings) setSettings(result.settings)
    setPlan(result.plan ?? null)
  }, [])

  const unignorePath = useCallback(async (targetPath: string) => {
    const result = await window.felixo?.fetchAll?.unignorePath({ path: targetPath })
    if (mountedRef.current && result?.ok && result.settings) {
      setSettings(result.settings)
    }
  }, [])

  return (
    <CanvasPanel
      title="Fetch All"
      icon={<RefreshCw size={15} />}
      onClose={onClose}
      widthClassName="w-96"
      toolsMenuOpen={toolsMenuOpen}
    >
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => void scan(false)}
          disabled={busy}
          className="felixo-btn flex flex-1 items-center justify-center gap-2 rounded bg-zinc-700 px-3 py-1.5 text-sm text-zinc-100 hover:bg-zinc-600 disabled:opacity-50"
          title="Varre todos os discos locais e faz fetch em cada repositório"
        >
          <Search size={14} />
          Varredura completa
        </button>
        <button
          type="button"
          onClick={() => void scan(true)}
          disabled={busy}
          className="felixo-btn flex items-center gap-2 rounded bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300 ring-1 ring-white/10 hover:bg-zinc-700 disabled:opacity-50"
          title="Reaproveita a lista da última varredura completa (não encontra repositórios novos)"
        >
          <RotateCcw size={14} />
          Rápida
        </button>
      </div>

      {busy && (
        <div className="mb-3 flex items-center gap-2 rounded bg-zinc-800/60 px-2 py-1.5 text-xs text-zinc-300">
          <RefreshCw size={13} className="animate-spin" />
          <span className="min-w-0 flex-1 truncate">
            {progressLabel || 'Preparando…'}
          </span>
          <button
            type="button"
            onClick={() => void window.felixo?.fetchAll?.cancel()}
            className="felixo-btn-icon rounded p-1 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
            title="Cancelar a passada"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {error && (
        <p className="mb-2 rounded bg-red-950/50 p-2 text-xs text-red-300">{error}</p>
      )}

      {plan && (
        <div className="mb-3 rounded bg-zinc-800/60 p-2 text-xs text-zinc-400">
          <p>
            <span className="text-zinc-200">{plan.total}</span> repositório(s)
            {scanMode ? ` · varredura ${scanMode}` : ''}
          </p>
          <p className="mt-1 flex flex-wrap gap-x-3">
            <span className="text-emerald-400">
              <ArrowDownToLine size={11} className="mr-1 inline" />
              {plan.toPull.length} pull
            </span>
            <span className="text-emerald-400">
              <ArrowUpFromLine size={11} className="mr-1 inline" />
              {plan.toPush.length} push
            </span>
            <span className="text-amber-400">
              <AlertTriangle size={11} className="mr-1 inline" />
              {plan.problems.length} pendência(s)
            </span>
            <span>{plan.upToDate.length} atualizado(s)</span>
          </p>
        </div>
      )}

      {sections.map((section) => (
        <section key={section.key} className="mb-3">
          <h3 className={`mb-1 text-xs font-medium ${TONE_CLASSES[section.tone]}`}>
            {section.label} ({section.repos.length})
          </h3>
          <ul className="max-h-40 overflow-auto rounded bg-zinc-800/40">
            {section.repos.map((repo) => (
              <li
                key={repo.path}
                className="group flex items-start gap-2 border-b border-white/5 px-2 py-1.5 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-zinc-200" title={repo.path}>
                    {repo.name}
                    {repo.branch && (
                      <span className="ml-1 text-zinc-500">({repo.branch})</span>
                    )}
                  </p>
                  {(repo.detail || section.key === 'problems') && (
                    <p className="truncate text-[11px] text-zinc-500">
                      {repo.detail || repo.stateLabel}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void ignorePath(repo.path)}
                  disabled={busy}
                  className="felixo-btn-icon rounded p-1 text-zinc-600 opacity-0 transition-opacity hover:bg-white/10 hover:text-zinc-200 group-hover:opacity-100 disabled:opacity-0"
                  title="Ignorar esta pasta nas próximas varreduras"
                >
                  <EyeOff size={13} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {plan && (
        <div className="flex flex-col gap-2 border-t border-white/10 pt-3">
          {autoCommitCount > 0 && (
            <label className="flex items-start gap-2 text-xs text-zinc-300">
              <input
                type="checkbox"
                checked={autoCommit}
                onChange={(event) => {
                  setAutoCommit(event.target.checked)
                  setConfirmingExecute(false)
                }}
                className="mt-0.5"
              />
              <span>
                Commitar automaticamente {autoCommitCount} repositório(s) cuja única
                pendência é isso, e sincronizar em seguida.
              </span>
            </label>
          )}

          {confirmingExecute ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void execute()}
                disabled={busy}
                className="felixo-btn flex-1 rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
              >
                Confirmar execução
              </button>
              <button
                type="button"
                onClick={() => setConfirmingExecute(false)}
                className="felixo-btn rounded bg-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-600"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingExecute(true)}
              disabled={busy || !canExecute}
              className="felixo-btn rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
              title={
                canExecute
                  ? 'Executa pull --ff-only e push apenas nos repositórios seguros'
                  : 'O plano não tem nenhuma ação segura'
              }
            >
              Executar plano
            </button>
          )}
          <p className="text-[11px] text-zinc-500">
            Repositórios com pendência são apenas reportados. O estado de cada um é
            revalidado imediatamente antes de qualquer escrita.
          </p>
        </div>
      )}

      {results && (
        <div className="mt-3 border-t border-white/10 pt-3">
          <p className="text-xs text-zinc-300">{summarizeResults(results)}</p>
          {reportPath && (
            <p
              className="mt-1 flex items-center gap-1 truncate text-[11px] text-zinc-500"
              title={reportPath}
            >
              <FileText size={11} />
              {reportPath}
            </p>
          )}
          <ul className="mt-2 max-h-40 overflow-auto rounded bg-zinc-800/40">
            {results
              .filter((result) => !result.ok)
              .map((result, index) => (
                <li
                  key={`${result.status.path}-${result.action}-${index}`}
                  className="border-b border-white/5 px-2 py-1.5 text-[11px] text-red-300 last:border-b-0"
                >
                  <span className="text-zinc-300">
                    {result.status.name} · {result.action}
                  </span>{' '}
                  {result.message}
                </li>
              ))}
          </ul>
        </div>
      )}

      <div className="mt-3 border-t border-white/10 pt-3">
        <button
          type="button"
          onClick={() => setShowIgnored((open) => !open)}
          className="felixo-btn flex items-center gap-2 text-xs text-zinc-400 hover:text-zinc-200"
        >
          <EyeOff size={13} />
          Pastas ignoradas ({settings?.ignoredPaths.length ?? 0})
        </button>

        {showIgnored && (
          <ul className="mt-2 rounded bg-zinc-800/40">
            {settings?.ignoredPaths.length ? (
              settings.ignoredPaths.map((ignoredPath) => (
                <li
                  key={ignoredPath}
                  className="flex items-center gap-2 border-b border-white/5 px-2 py-1.5 last:border-b-0"
                >
                  <span
                    className="min-w-0 flex-1 truncate text-[11px] text-zinc-400"
                    title={ignoredPath}
                  >
                    {ignoredPath}
                  </span>
                  <button
                    type="button"
                    onClick={() => void unignorePath(ignoredPath)}
                    className="felixo-btn-icon rounded p-1 text-zinc-500 hover:bg-white/10 hover:text-zinc-200"
                    title="Voltar a varrer esta pasta"
                  >
                    <X size={12} />
                  </button>
                </li>
              ))
            ) : (
              <li className="px-2 py-1.5 text-[11px] text-zinc-500">
                Nenhuma pasta ignorada. Use o ícone ao lado de um repositório para
                tirá-lo das próximas varreduras.
              </li>
            )}
          </ul>
        )}
      </div>
    </CanvasPanel>
  )
}
