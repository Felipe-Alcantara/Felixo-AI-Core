import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  Check,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Clock,
  Columns3,
  Copy,
  Database,
  ExternalLink,
  KeyRound,
  ListTodo,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings2,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react'
import { CanvasPanel } from './CanvasPanel'
import { DeferredMarkdownContent } from '../../../shared/components/DeferredMarkdownContent'
import type {
  NotionConnection,
  NotionDatabase,
  NotionSchemaProperty,
  NotionTask,
} from '../../../shared/types/notion'
import { readVisibleColumns, saveVisibleColumns } from '../../services/notion-table-columns'
import {
  BUILT_IN_VIEWS,
  createViewId,
  filterTasksByView,
  isBuiltInView,
  listFilterableProperties,
  readCustomViews,
  saveCustomViews,
  type NotionStatusScope,
  type NotionTaskView,
} from '../../services/notion-task-views'
import {
  decideSyncStatusAfterNetwork,
  hasUsableCachedSnapshot,
  type PanelSyncStatus,
} from '../../services/notion-sync-status'
import { createRefreshCoordinator, targetChanged } from '../../services/notion-refresh-coordinator'
import { nextAutoSyncDelayMs } from '../../services/notion-sync-backoff'

type NotionTasksPanelProps = {
  onClose: () => void
  toolsMenuOpen?: boolean
  /** Renderiza somente o conteúdo para o bloco persistente do Canvas. */
  embedded?: boolean
}

type TaskDraft = {
  title: string
  completed: boolean
  status: string
  dueDate: string
  priority: string
  text: string
}

type TaskContentState = {
  status: 'loading' | 'loaded' | 'error'
  content: string
  message?: string
}


const inputClass =
  'w-full rounded border border-white/10 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-sky-500/70'
const buttonClass =
  'felixo-btn flex items-center justify-center gap-1.5 rounded bg-zinc-700 px-2 py-1.5 text-xs text-zinc-100 hover:bg-zinc-600 disabled:cursor-not-allowed disabled:opacity-50'

export function NotionTasksPanel({ onClose, toolsMenuOpen, embedded = false }: NotionTasksPanelProps) {
  const api = window.felixo?.notion
  const [connections, setConnections] = useState<NotionConnection[]>([])
  const [secureStorage, setSecureStorage] = useState<{ ok: boolean; reason: string | null } | null>(null)
  const [connectionId, setConnectionId] = useState('')
  const [connectionLabel, setConnectionLabel] = useState('Minha conexão Notion')
  const [profileId, setProfileId] = useState('default')
  const [token, setToken] = useState('')
  const [showConnectionForm, setShowConnectionForm] = useState(false)
  const [showWorkspaceSettings, setShowWorkspaceSettings] = useState(false)
  const [databaseQuery, setDatabaseQuery] = useState('')
  const [databases, setDatabases] = useState<NotionDatabase[]>([])
  const [dataSourceId, setDataSourceId] = useState('')
  const [schema, setSchema] = useState<Record<string, NotionSchemaProperty>>({})
  const [tasks, setTasks] = useState<NotionTask[]>([])
  const [search, setSearch] = useState('')
  const [viewsVersion, setViewsVersion] = useState(0)
  const [columnsVersion, setColumnsVersion] = useState(0)
  const [showColumnPicker, setShowColumnPicker] = useState(false)
  const [activeViewId, setActiveViewId] = useState<string>(BUILT_IN_VIEWS[0].id)
  const [showViewBuilder, setShowViewBuilder] = useState(false)
  const [editingViewId, setEditingViewId] = useState<string | null>(null)
  const [viewDraft, setViewDraft] = useState(() => emptyViewDraft())
  const [syncStatus, setSyncStatus] = useState<PanelSyncStatus>('idle')
  const stale = syncStatus === 'stale'
  const syncing = syncStatus === 'syncing'
  const [fetchedAt, setFetchedAt] = useState<string | null>(null)
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(true)
  const [busy, setBusy] = useState(false)
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  // updatedAt da tarefa no momento em que a edição começou — enviado como
  // expectedUpdatedAt pro serviço recusar a escrita se a versão remota
  // mudou nesse meio tempo, em vez de sobrescrever silenciosamente.
  const [editingUpdatedAt, setEditingUpdatedAt] = useState<string | null>(null)
  const [showTaskComposer, setShowTaskComposer] = useState(false)
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null)
  const [taskContentById, setTaskContentById] = useState<Record<string, TaskContentState>>({})
  const [copiedTaskId, setCopiedTaskId] = useState<string | null>(null)
  const [draft, setDraft] = useState<TaskDraft>(emptyDraft())
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const selectedDatabase = databases.find((database) => database.id === dataSourceId) || null

  const statusOptions = useMemo(() => {
    const values = new Set<string>()
    for (const property of Object.values(schema)) {
      if (property.type !== 'status' && property.type !== 'select') continue
      const options = property[property.type]
      if (!options || typeof options !== 'object') continue
      const items = (options as { options?: unknown[] }).options
      if (!Array.isArray(items)) continue
      for (const item of items) {
        if (item && typeof item === 'object' && typeof (item as { name?: unknown }).name === 'string') {
          values.add((item as { name: string }).name)
        }
      }
    }
    return [...values]
  }, [schema])

  const filterableProperties = useMemo(() => listFilterableProperties(schema), [schema])

  // Propriedades que podem virar coluna extra na tabela: qualquer uma da
  // database, menos o título (que já é a coluna "Tarefa").
  const columnableProperties = useMemo(
    () => Object.values(schema).filter((property) => property.type !== 'title').map((property) => property.name),
    [schema],
  )

  // eslint-disable-next-line react-hooks/exhaustive-deps -- columnsVersion força reler o localStorage após persistVisibleColumns
  const visibleColumns = useMemo(() => readVisibleColumns(connectionId, dataSourceId).filter((name) => columnableProperties.includes(name)), [connectionId, dataSourceId, columnableProperties, columnsVersion])

  function persistVisibleColumns(next: string[]) {
    saveVisibleColumns(connectionId, dataSourceId, next)
    setColumnsVersion((value) => value + 1)
  }

  function toggleColumn(name: string) {
    persistVisibleColumns(
      visibleColumns.includes(name)
        ? visibleColumns.filter((current) => current !== name)
        : [...visibleColumns, name],
    )
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps -- viewsVersion força reler o localStorage após persistCustomViews
  const customViews = useMemo(() => readCustomViews(connectionId, dataSourceId), [connectionId, dataSourceId, viewsVersion])
  const views = useMemo<NotionTaskView[]>(() => [...BUILT_IN_VIEWS, ...customViews], [customViews])
  const activeView = views.find((view) => view.id === activeViewId) || BUILT_IN_VIEWS[0]

  // Reseta a visualização ativa ao trocar de conexão/database, sem depender de um efeito (ver
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes).
  const dataScopeKey = `${connectionId}::${dataSourceId}`
  const [lastDataScopeKey, setLastDataScopeKey] = useState(dataScopeKey)
  if (dataScopeKey !== lastDataScopeKey) {
    setLastDataScopeKey(dataScopeKey)
    setActiveViewId(BUILT_IN_VIEWS[0].id)
  }

  function persistCustomViews(next: NotionTaskView[]) {
    saveCustomViews(connectionId, dataSourceId, next)
    setViewsVersion((value) => value + 1)
  }

  const loadConnections = useCallback(async () => {
    if (!api) {
      setError('A ponte do Notion não está disponível nesta versão do app.')
      return
    }
    const result = await api.listConnections()
    if (!result.ok) {
      setError(result.message || 'Não foi possível carregar as conexões Notion.')
      return
    }
    setConnections(result.connections || [])
    setSecureStorage(result.secureStorage || null)
    setConnectionId((current) => current || result.connections?.[0]?.id || '')
  }, [api])

  useEffect(() => {
    const timer = window.setTimeout(() => void loadConnections(), 0)
    return () => window.clearTimeout(timer)
  }, [loadConnections])

  const loadDatabases = useCallback(async () => {
    if (!api || !connectionId) {
      setDatabases([])
      setDataSourceId('')
      return
    }
    setBusy(true)
    setError(null)
    const result = await api.listDatabases({ connectionId, query: databaseQuery })
    setBusy(false)
    if (!result.ok) {
      setError(result.message || 'Não foi possível listar as tabelas compartilhadas.')
      return
    }
    const nextDatabases = result.databases || []
    setDatabases(nextDatabases)
    setDataSourceId((current) =>
      nextDatabases.some((database) => database.id === current) ? current : nextDatabases[0]?.id || '',
    )
  }, [api, connectionId, databaseQuery])

  useEffect(() => {
    if (!connectionId) return undefined
    const timer = window.setTimeout(() => void loadDatabases(), 0)
    return () => window.clearTimeout(timer)
  }, [connectionId, loadDatabases])

  // Nunca deixa dois loadTasks() rodarem em paralelo (manual, timer, busca,
  // troca de filtro disputando ao mesmo tempo) — ver notion-refresh-coordinator.ts.
  // O tipo devolvido (PanelSyncStatus) é o que o auto-sync usa pra decidir
  // o backoff — undefined quando a resposta foi descartada por obsoleta.
  const refreshCoordinatorRef = useRef(createRefreshCoordinator<PanelSyncStatus | undefined>())
  // Sempre reflete a conexão/tabela SELECIONADA agora, pra uma resposta que
  // chega depois de uma troca de tabela poder se reconhecer como obsoleta.
  const activeTargetRef = useRef({ connectionId, dataSourceId })
  useEffect(() => {
    activeTargetRef.current = { connectionId, dataSourceId }
  }, [connectionId, dataSourceId])

  /**
   * `silent` é usado pela sincronização automática em segundo plano: mantém o
   * detalhe expandido e o conteúdo já carregado de uma tarefa (não reseta a
   * leitura em andamento) e não liga o spinner de "carregando" — só atualiza
   * a lista por baixo. Uma sincronização manual (botão, busca, troca de
   * database) continua limpando os dois, como sempre.
   */
  const loadTasks = useCallback((options: { silent?: boolean } = {}) => {
    const { silent = false } = options
    const targetConnectionId = connectionId
    const targetDataSourceId = dataSourceId

    return refreshCoordinatorRef.current.trigger(async (): Promise<PanelSyncStatus | undefined> => {
      if (!api || !targetConnectionId || !targetDataSourceId) {
        setTasks([])
        setSyncStatus('idle')
        return 'idle'
      }
      // Uma resposta cujo alvo já não é mais a tabela selecionada é
      // descartada silenciosamente — nunca sobrescreve o que já apareceu
      // de uma tabela nova selecionada nesse meio tempo.
      const isStale = () => targetChanged(
        { connectionId: targetConnectionId, dataSourceId: targetDataSourceId },
        activeTargetRef.current,
      )

      if (!silent) {
        setTaskContentById({})
        setExpandedTaskId(null)
      }
      setError(null)

      // Fase 1 (stale-while-revalidate, lado "stale"): mostra o snapshot local
      // na hora, sem esperar a rede. Um refresh silencioso (auto-sync) pula
      // isto — a lista já exibida É o snapshot mais recente que se tem.
      let hasLocalSnapshot = false
      if (!silent) {
        const cachedResult = await api.getCachedTasks({
          connectionId: targetConnectionId,
          dataSourceId: targetDataSourceId,
          search,
          status: activeView.statusFilter,
        })
        if (isStale()) return undefined
        hasLocalSnapshot = hasUsableCachedSnapshot(cachedResult)
        if (hasLocalSnapshot) {
          setTasks(cachedResult.tasks || [])
          setSchema(cachedResult.schema || {})
          setFetchedAt(cachedResult.fetchedAt || null)
        }
      }
      // Só bloqueia a UI (spinner de carregamento cheio) quando não há nada
      // local pra mostrar enquanto se espera a rede — o caso raro de primeira
      // visita a uma tabela nunca sincronizada antes.
      setBusy(!silent && !hasLocalSnapshot)
      setSyncStatus('syncing')

      // Fase 2: revalida com a rede de verdade, em segundo plano quando já
      // havia um snapshot local exibido.
      const result = await api.listTasks({
        connectionId: targetConnectionId,
        dataSourceId: targetDataSourceId,
        search,
        status: activeView.statusFilter,
      })
      if (isStale()) return undefined
      setBusy(false)
      const finalStatus = decideSyncStatusAfterNetwork(result, hasLocalSnapshot)
      setSyncStatus(finalStatus)
      if (!result.ok) {
        if (!silent) {
          setError(result.message || 'Não foi possível carregar as tarefas do Notion.')
        }
        return finalStatus
      }
      setTasks(result.tasks || [])
      setSchema(result.schema || {})
      setFetchedAt(result.fetchedAt || null)
      if (result.stale && !silent) {
        setMessage(result.message || 'Exibindo o último snapshot salvo; a rede está indisponível.')
      }
      return finalStatus
    })
  }, [api, connectionId, dataSourceId, search, activeView.statusFilter])

  const visibleTasks = useMemo(() => filterTasksByView(tasks, activeView), [tasks, activeView])

  useEffect(() => {
    if (!connectionId || !dataSourceId) return undefined
    const timer = window.setTimeout(() => void loadTasks(), 0)
    return () => window.clearTimeout(timer)
  }, [connectionId, dataSourceId, loadTasks])

  // Sincronização automática: revalida a lista com o Notion em segundo
  // plano, sem interromper o que a pessoa está fazendo (detalhe aberto,
  // busca digitada). O coordinator (dentro de loadTasks) já garante que
  // isto nunca roda em paralelo com um load manual ou outro tick — só entra
  // na fila. Backoff exponencial: cada falha consecutiva dobra o intervalo
  // até o teto (ver notion-sync-backoff.ts), pra não bater na rede no mesmo
  // ritmo enquanto ela está indisponível; reseta no primeiro sucesso.
  useEffect(() => {
    if (!autoSyncEnabled || !connectionId || !dataSourceId) return undefined
    let cancelled = false
    let consecutiveFailures = 0
    let timerId: number | undefined

    const scheduleNext = () => {
      if (cancelled) return
      timerId = window.setTimeout(tick, nextAutoSyncDelayMs(consecutiveFailures))
    }
    const tick = () => {
      if (cancelled) return
      void loadTasks({ silent: true }).then((status) => {
        if (cancelled) return
        consecutiveFailures = status === 'success' ? 0 : consecutiveFailures + 1
        scheduleNext()
      })
    }

    scheduleNext()
    return () => {
      cancelled = true
      if (timerId !== undefined) window.clearTimeout(timerId)
    }
  }, [autoSyncEnabled, connectionId, dataSourceId, loadTasks])

  async function saveConnection() {
    if (!api) return
    setBusy(true)
    setError(null)
    const result = await api.saveConnection({
      id: connectionId || undefined,
      label: connectionLabel,
      profileId,
      token: token || undefined,
    })
    setBusy(false)
    if (!result.ok || !result.connection) {
      setError(result.message || 'Não foi possível guardar a conexão.')
      return
    }
    setToken('')
    setShowConnectionForm(false)
    setMessage('Conexão Notion guardada. O token permanece cifrado no processo principal.')
    await loadConnections()
    setConnectionId(result.connection.id)
  }

  async function testConnection() {
    if (!api || !connectionId) return
    setBusy(true)
    setError(null)
    const result = await api.testConnection(connectionId)
    setBusy(false)
    if (!result.ok) {
      setError(result.message || 'A conexão não respondeu.')
      return
    }
    setMessage(result.identity ? `Conexão validada para ${result.identity}.` : 'Conexão validada pelo Notion.')
    await loadConnections()
  }

  async function removeConnection() {
    if (!api || !connectionId || !window.confirm('Remover a conexão e o token cifrado deste perfil?')) return
    setBusy(true)
    const result = await api.removeConnection(connectionId)
    setBusy(false)
    if (!result.ok) {
      setError(result.message || 'Não foi possível remover a conexão.')
      return
    }
    setDatabases([])
    setDataSourceId('')
    setTasks([])
    setMessage('Conexão removida. O cache local das tarefas continua sem credencial e não é enviado.')
    setConnectionId('')
    await loadConnections()
  }

  async function submitTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!api || !connectionId || !dataSourceId || !draft.title.trim()) return
    const wasEditing = Boolean(editingId)
    setBusy(true)
    setError(null)
    const result = editingId
      ? await api.updateTask({
          connectionId,
          dataSourceId,
          pageId: editingId,
          changes: draft,
          expectedUpdatedAt: editingUpdatedAt,
        })
      : await api.createTask({
          connectionId,
          dataSourceId,
          task: draft,
        })
    setBusy(false)
    if (!result.ok) {
      setError(result.message || 'Não foi possível salvar a tarefa.')
      return
    }
    if (result.conflict) {
      // Rejeição segura: a versão remota mudou desde que a edição começou.
      // Nada foi escrito no Notion; recarrega a lista (o cache já tem a
      // versão atual) e deixa a pessoa decidir se edita de novo com o dado
      // fresco em vez de perder a mudança concorrente em silêncio.
      setError(result.message || 'Esta tarefa foi alterada no Notion. Revise antes de salvar de novo.')
      await loadTasks()
      return
    }
    setEditingId(null)
    setEditingUpdatedAt(null)
    setShowTaskComposer(false)
    setDraft(emptyDraft())
    setMessage(wasEditing ? 'Tarefa atualizada no Notion.' : 'Tarefa criada no Notion.')
    await loadTasks()
  }

  async function toggleTask(task: NotionTask) {
    if (!api || !connectionId || !dataSourceId) return
    setBusyTaskId(task.id)
    setError(null)
    const result = await api.updateTask({
      connectionId,
      dataSourceId,
      pageId: task.id,
      changes: { completed: !task.completed },
      expectedUpdatedAt: task.updatedAt,
    })
    setBusyTaskId(null)
    if (!result.ok) {
      setError(result.message || 'Não foi possível alterar o estado da tarefa.')
      return
    }
    if (result.conflict) {
      setError(result.message || 'Esta tarefa foi alterada no Notion. Revise antes de tentar de novo.')
      await loadTasks()
      return
    }
    await loadTasks()
  }

  async function archiveTask(task: NotionTask) {
    if (!api || !connectionId || !dataSourceId || !window.confirm(`Enviar “${task.title}” para a lixeira do Notion?`)) return
    setBusyTaskId(task.id)
    const result = await api.archiveTask({
      connectionId,
      dataSourceId,
      pageId: task.id,
    })
    setBusyTaskId(null)
    if (!result.ok) {
      setError(result.message || 'Não foi possível arquivar a tarefa.')
      return
    }
    setExpandedTaskId((current) => (current === task.id ? null : current))
    setMessage('Tarefa enviada para a lixeira do Notion.')
    await loadTasks()
  }

  function editTask(task: NotionTask) {
    setEditingId(task.id)
    setEditingUpdatedAt(task.updatedAt)
    setShowTaskComposer(true)
    setExpandedTaskId(null)
    setDraft({
      title: task.title,
      completed: task.completed,
      status: task.status,
      dueDate: task.dueDate,
      priority: task.priority,
      text: task.text,
    })
  }

  function startCreatingTask() {
    setEditingId(null)
    setEditingUpdatedAt(null)
    setDraft(emptyDraft())
    setShowTaskComposer(true)
  }

  function cancelTaskComposer() {
    setEditingId(null)
    setEditingUpdatedAt(null)
    setDraft(emptyDraft())
    setShowTaskComposer(false)
  }

  function startCreatingView() {
    setEditingViewId(null)
    setViewDraft(emptyViewDraft())
    setShowViewBuilder(true)
  }

  function startEditingView(view: NotionTaskView) {
    setEditingViewId(view.id)
    setViewDraft({
      name: view.name,
      statusFilter: view.statusFilter,
      property: view.propertyFilters[0]?.property || filterableProperties[0]?.name || '',
      values: view.propertyFilters[0]?.values || [],
    })
    setShowViewBuilder(true)
  }

  function cancelViewBuilder() {
    setEditingViewId(null)
    setViewDraft(emptyViewDraft())
    setShowViewBuilder(false)
  }

  function toggleViewDraftValue(value: string) {
    setViewDraft((current) => ({
      ...current,
      values: current.values.includes(value)
        ? current.values.filter((item) => item !== value)
        : [...current.values, value],
    }))
  }

  function submitViewBuilder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = viewDraft.name.trim()
    if (!name) return
    const propertyFilters = viewDraft.property && viewDraft.values.length > 0
      ? [{ property: viewDraft.property, values: viewDraft.values }]
      : []
    const view: NotionTaskView = {
      id: editingViewId && !isBuiltInView(editingViewId) ? editingViewId : createViewId(),
      name,
      statusFilter: viewDraft.statusFilter,
      propertyFilters,
    }
    const next = editingViewId
      ? customViews.map((current) => (current.id === editingViewId ? view : current))
      : [...customViews, view]
    persistCustomViews(next)
    setActiveViewId(view.id)
    cancelViewBuilder()
  }

  function deleteView(view: NotionTaskView) {
    if (!window.confirm(`Excluir a visualização “${view.name}”? Isso não afeta as tarefas no Notion.`)) return
    persistCustomViews(customViews.filter((current) => current.id !== view.id))
    if (activeViewId === view.id) setActiveViewId(BUILT_IN_VIEWS[0].id)
  }

  const loadTaskContent = useCallback(async (task: NotionTask) => {
    const fallback = task.text.trim()
    if (!api || !connectionId) {
      setTaskContentById((current) => ({
        ...current,
        [task.id]: { status: 'loaded', content: fallback },
      }))
      return
    }

    setTaskContentById((current) => ({
      ...current,
      [task.id]: { status: 'loading', content: fallback },
    }))

    const result = await api.getTaskContent({ connectionId, pageId: task.id })
    if (!result.ok) {
      setTaskContentById((current) => ({
        ...current,
        [task.id]: {
          status: 'error',
          content: fallback,
          message: result.message || 'Não foi possível carregar o conteúdo da página.',
        },
      }))
      return
    }

    setTaskContentById((current) => ({
      ...current,
      [task.id]: {
        status: 'loaded',
        content: result.content?.trim() || fallback,
      },
    }))
  }, [api, connectionId])

  async function copyTaskLink(task: NotionTask) {
    if (!task.url) return
    try {
      await navigator.clipboard.writeText(task.url)
    } catch {
      setError(`Não foi possível copiar o link automaticamente. Copie manualmente: ${task.url}`)
      return
    }
    setCopiedTaskId(task.id)
    window.setTimeout(() => setCopiedTaskId((current) => (current === task.id ? null : current)), 1500)
  }

  function toggleTaskDetails(task: NotionTask) {
    const isExpanded = expandedTaskId === task.id
    setExpandedTaskId(isExpanded ? null : task.id)
    if (isExpanded) return

    const existing = taskContentById[task.id]
    if (existing?.status === 'loading' || existing?.status === 'loaded') return
    void loadTaskContent(task)
  }

  const selectedConnection = connections.find((connection) => connection.id === connectionId) || null

  const content = (
    <div className="min-h-full text-xs text-zinc-300">
        <header className="flex flex-wrap items-center gap-3 border-b border-white/10 pb-3">
          <div className="min-w-0 flex-1">
            <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500">Workspace / database</p>
            <div className="flex min-w-0 items-center gap-2">
              <Database size={16} className="shrink-0 text-violet-300" />
              {databases.length > 0 ? (
                <select
                  className="min-w-0 max-w-[34rem] flex-1 bg-transparent text-sm font-medium text-zinc-100 outline-none"
                  value={dataSourceId}
                  onChange={(event) => setDataSourceId(event.target.value)}
                  aria-label="Database Notion"
                >
                  <option value="">Selecione uma database</option>
                  {databases.map((database) => <option key={database.id} value={database.id}>{database.name}</option>)}
                </select>
              ) : (
                <span className="truncate text-sm font-medium text-zinc-100">{selectedDatabase?.name || 'Selecione uma database'}</span>
              )}
            </div>
            <p className="mt-1 truncate text-[11px] text-zinc-500">
              {selectedConnection?.label || 'Nenhuma conexão selecionada'}
              {selectedDatabase ? ` · ${selectedDatabase.id}` : ''}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              className="felixo-btn flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-white/5 hover:text-zinc-100"
              onClick={() => setShowWorkspaceSettings((value) => !value)}
              aria-expanded={showWorkspaceSettings}
            >
              <Settings2 size={14} /> Configurar
              <ChevronDown size={13} className={showWorkspaceSettings ? 'rotate-180 transition-transform' : 'transition-transform'} />
            </button>
            {connectionId && dataSourceId && (
              <button
                type="button"
                className="felixo-btn flex items-center gap-1.5 rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
                onClick={startCreatingTask}
                disabled={busy}
              >
                <Plus size={14} /> Nova tarefa
              </button>
            )}
          </div>
        </header>

        {showWorkspaceSettings && (
          <section className="mt-3 grid gap-3 rounded-lg border border-white/10 bg-zinc-950/45 p-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]" aria-label="Configuração do Notion">
            <div className="min-w-0 space-y-2">
              <div className="flex items-center gap-2">
                <KeyRound size={14} className="text-sky-300" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-zinc-100">Conexão</p>
                  <p className="text-[11px] text-zinc-500">O token fica cifrado e não chega ao renderer.</p>
                </div>
                <button type="button" className="felixo-btn flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-[11px] text-zinc-300 hover:bg-white/5" onClick={() => setShowConnectionForm((value) => !value)}>
                  {showConnectionForm ? <X size={12} /> : <Plus size={12} />}
                  {showConnectionForm ? 'Fechar' : 'Adicionar'}
                </button>
              </div>
              {connections.length > 0 ? (
                <div className="flex items-center gap-1.5">
                  <select className={`${inputClass} h-8 min-w-0 flex-1`} value={connectionId} onChange={(event) => setConnectionId(event.target.value)} aria-label="Conexão Notion">
                    {connections.map((connection) => <option key={connection.id} value={connection.id}>{connection.label}{connection.hasToken ? '' : ' · sem token'}</option>)}
                  </select>
                  <button type="button" className="felixo-btn-icon rounded p-1.5 text-zinc-400 hover:bg-white/10 hover:text-emerald-300 disabled:opacity-50" onClick={() => void testConnection()} disabled={busy || !selectedConnection?.hasToken} aria-label="Testar conexão" title="Testar conexão"><Check size={14} /></button>
                  <button type="button" className="felixo-btn-icon rounded p-1.5 text-zinc-400 hover:bg-white/10 hover:text-red-300 disabled:opacity-50" onClick={() => void removeConnection()} disabled={busy} aria-label="Remover conexão" title="Remover conexão"><Trash2 size={14} /></button>
                </div>
              ) : <p className="rounded border border-dashed border-white/10 px-2 py-2 text-[11px] text-zinc-500">Adicione uma conexão para começar e compartilhe a database no Notion com ela.</p>}
            </div>

            <div className="min-w-0 space-y-2">
              <div className="flex items-center gap-2">
                <Database size={14} className="text-violet-300" />
                <p className="font-medium text-zinc-100">Database compartilhada</p>
                <button type="button" className="felixo-btn-icon ml-auto rounded p-1.5 text-zinc-400 hover:bg-white/10 hover:text-zinc-100 disabled:opacity-50" onClick={() => void loadDatabases()} disabled={busy || !connectionId} aria-label="Atualizar tabelas" title="Atualizar tabelas"><RefreshCw size={14} className={busy ? 'animate-spin' : ''} /></button>
              </div>
              <div className="flex gap-1.5">
                <input className={`${inputClass} h-8 min-w-0 flex-1`} value={databaseQuery} onChange={(event) => setDatabaseQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void loadDatabases() }} placeholder="Filtrar tabelas compartilhadas" aria-label="Buscar database Notion" />
                <button type="button" className={`${buttonClass} h-8`} onClick={() => void loadDatabases()} disabled={busy}><RefreshCw size={13} /> Buscar</button>
              </div>
              {selectedDatabase && <p className="truncate text-[11px] text-zinc-500">Fonte: {selectedDatabase.name} · {selectedDatabase.id}</p>}
            </div>

            {showConnectionForm && (
              <div className="space-y-2 border-t border-white/10 pt-3 lg:col-span-2">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  <input className={`${inputClass} h-8`} value={connectionLabel} onChange={(event) => setConnectionLabel(event.target.value)} placeholder="Nome da conexão" aria-label="Nome da conexão Notion" />
                  <input className={`${inputClass} h-8`} value={profileId} onChange={(event) => setProfileId(event.target.value)} placeholder="Perfil (opcional)" aria-label="Perfil da conexão Notion" />
                  <input className={`${inputClass} h-8`} type="password" value={token} onChange={(event) => setToken(event.target.value)} placeholder={selectedConnection?.hasToken ? 'Token configurado — deixe vazio para manter' : 'Token do Notion'} autoComplete="new-password" aria-label="Token do Notion" />
                </div>
                <div className="flex items-center gap-2">
                  {secureStorage && !secureStorage.ok && <p className="min-w-0 flex-1 rounded bg-amber-950/60 px-2 py-1.5 text-[11px] text-amber-200">{secureStorage.reason}</p>}
                  <button type="button" className="felixo-btn ml-auto flex items-center gap-1.5 rounded-md bg-sky-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-600 disabled:opacity-50" onClick={() => void saveConnection()} disabled={busy || secureStorage?.ok === false}><Save size={13} /> Guardar conexão</button>
                </div>
              </div>
            )}
          </section>
        )}

        {secureStorage && !secureStorage.ok && !showWorkspaceSettings && (
          <p className="mt-3 rounded bg-amber-950/60 px-2.5 py-2 text-[11px] text-amber-200">{secureStorage.reason}</p>
        )}
        {(message || error) && (
          <div className="mt-3 space-y-1.5">
            {message && <p className="rounded bg-emerald-950/60 px-2.5 py-2 text-[11px] text-emerald-200" role="status">{message}</p>}
            {error && <p className="rounded bg-red-950/60 px-2.5 py-2 text-[11px] text-red-200" role="alert">{error}</p>}
          </div>
        )}

        {!connectionId || !dataSourceId ? (
          <div className="flex min-h-[19rem] flex-col items-center justify-center text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-500/10 text-violet-300"><ListTodo size={22} /></div>
            <h2 className="mt-3 text-sm font-medium text-zinc-100">Sua lista do Notion aparece aqui</h2>
            <p className="mt-1 max-w-sm text-xs leading-5 text-zinc-500">Configure uma conexão e escolha uma database para abrir as tarefas em uma tabela, como no Notion.</p>
            <button type="button" className="felixo-btn mt-4 flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/5" onClick={() => setShowWorkspaceSettings(true)}><Settings2 size={13} /> Configurar agora</button>
          </div>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-medium text-zinc-100">{activeView.name}</h2>
                  <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] text-zinc-400">{visibleTasks.length}</span>
                </div>
                <p className="mt-1 text-[11px] text-zinc-500">
                  {syncing ? 'Revalidando com o Notion…' : stale ? 'Snapshot local desatualizado' : fetchedAt ? `Sincronizado ${formatDate(fetchedAt)}` : 'Ainda não sincronizado'}
                </p>
              </div>
              <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1.5 sm:flex-none">
                <label className="relative min-w-[13rem] flex-1 sm:w-56 sm:flex-none">
                  <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <input className={`${inputClass} h-8 pl-8`} value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void loadTasks() }} placeholder="Buscar tarefas" aria-label="Buscar tarefas Notion" />
                </label>
                <button type="button" className="felixo-btn-icon rounded-md border border-white/10 p-1.5 text-zinc-400 hover:bg-white/5 hover:text-zinc-100 disabled:opacity-50" onClick={() => void loadTasks()} disabled={busy || syncing} aria-label="Sincronizar tarefas" title="Sincronizar tarefas"><RefreshCw size={14} className={busy || syncing ? 'animate-spin' : ''} /></button>
                <button
                  type="button"
                  className={`felixo-btn-icon rounded-md border p-1.5 ${autoSyncEnabled ? 'border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10' : 'border-white/10 text-zinc-500 hover:bg-white/5 hover:text-zinc-100'}`}
                  onClick={() => setAutoSyncEnabled((value) => !value)}
                  aria-pressed={autoSyncEnabled}
                  aria-label={autoSyncEnabled ? 'Desligar sincronização automática' : 'Ligar sincronização automática (a cada minuto)'}
                  title={autoSyncEnabled ? 'Sincronização automática ligada (a cada 1 min) — clique para desligar' : 'Sincronização automática desligada — clique para ligar'}
                >
                  <Clock size={14} />
                </button>
                <div className="relative">
                  <button
                    type="button"
                    className={`felixo-btn-icon rounded-md border p-1.5 ${visibleColumns.length > 0 ? 'border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10' : 'border-white/10 text-zinc-400 hover:bg-white/5 hover:text-zinc-100'}`}
                    onClick={() => setShowColumnPicker((value) => !value)}
                    aria-expanded={showColumnPicker}
                    aria-label="Escolher colunas da tabela"
                    title="Escolher quais propriedades aparecem como coluna, sem precisar expandir a tarefa"
                  >
                    <Columns3 size={14} />
                  </button>
                  {showColumnPicker && (
                    <div className="absolute right-0 top-[calc(100%+0.375rem)] z-10 w-64 rounded-lg border border-white/10 bg-zinc-900 p-2 shadow-xl">
                      <p className="mb-1.5 px-1 text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">Colunas da tabela</p>
                      {columnableProperties.length === 0 ? (
                        <p className="px-1 py-1 text-[11px] text-zinc-500">Esta database não tem outras propriedades.</p>
                      ) : (
                        <div className="max-h-64 space-y-0.5 overflow-y-auto">
                          {columnableProperties.map((name) => (
                            <label key={name} className="flex items-center gap-2 rounded px-1 py-1 text-[11px] text-zinc-300 hover:bg-white/5">
                              <input type="checkbox" checked={visibleColumns.includes(name)} onChange={() => toggleColumn(name)} />
                              <span className="truncate" title={name}>{name}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <button type="button" className="felixo-btn-icon rounded-md border border-white/10 p-1.5 text-zinc-400 hover:bg-white/5 hover:text-zinc-100" onClick={() => setShowWorkspaceSettings(true)} aria-label="Mostrar filtros e configuração" title="Filtros e configuração"><SlidersHorizontal size={14} /></button>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-1.5 border-b border-white/10 pb-2" role="tablist" aria-label="Visualizações de tarefas">
              {views.map((view) => {
                const isActive = view.id === activeViewId
                const editable = !isBuiltInView(view.id)
                return (
                  <div key={view.id} className={`group flex items-center gap-1 rounded-md px-1 ${isActive ? 'bg-zinc-700' : 'hover:bg-white/5'}`}>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      className={`rounded px-1.5 py-1 text-[11px] ${isActive ? 'text-zinc-100' : 'text-zinc-500 hover:text-zinc-200'}`}
                      onClick={() => setActiveViewId(view.id)}
                      title={editable && view.propertyFilters[0] ? `${view.propertyFilters[0].property}: ${view.propertyFilters[0].values.join(', ')}` : undefined}
                    >
                      {view.name}
                    </button>
                    {editable && (
                      <span className="hidden items-center gap-0.5 group-hover:flex">
                        <button type="button" className="felixo-btn-icon rounded p-0.5 text-zinc-500 hover:bg-white/10 hover:text-sky-300" onClick={() => startEditingView(view)} aria-label={`Editar visualização ${view.name}`} title="Editar visualização"><Pencil size={11} /></button>
                        <button type="button" className="felixo-btn-icon rounded p-0.5 text-zinc-500 hover:bg-white/10 hover:text-red-300" onClick={() => deleteView(view)} aria-label={`Excluir visualização ${view.name}`} title="Excluir visualização"><Trash2 size={11} /></button>
                      </span>
                    )}
                  </div>
                )
              })}
              <button type="button" className="felixo-btn flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-zinc-400 hover:bg-white/5 hover:text-zinc-100" onClick={startCreatingView} aria-label="Criar nova visualização" title="Criar visualização com filtro avançado"><Plus size={12} /> Nova visualização</button>
            </div>

            {showViewBuilder && (
              <form className="mt-3 space-y-3 rounded-lg border border-white/10 bg-zinc-950/50 p-3" onSubmit={submitViewBuilder}>
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1"><p className="font-medium text-zinc-100">{editingViewId ? 'Editar visualização' : 'Nova visualização'}</p><p className="text-[11px] text-zinc-500">Filtra tarefas por uma propriedade da database, como “Repositório” no Notion.</p></div>
                  <button type="button" className="felixo-btn-icon rounded p-1.5 text-zinc-400 hover:bg-white/10 hover:text-zinc-100" onClick={cancelViewBuilder} aria-label="Fechar editor de visualização" title="Fechar"><X size={14} /></button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <input className={`${inputClass} h-9`} value={viewDraft.name} onChange={(event) => setViewDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Nome da visualização" aria-label="Nome da visualização" required />
                  <select className={`${inputClass} h-9`} value={viewDraft.statusFilter} onChange={(event) => setViewDraft((current) => ({ ...current, statusFilter: event.target.value as NotionStatusScope }))} aria-label="Estado incluído na visualização">
                    <option value="all">Todos os estados</option>
                    <option value="open">Só abertas</option>
                    <option value="done">Só concluídas</option>
                  </select>
                </div>
                {filterableProperties.length > 0 ? (
                  <div className="space-y-2">
                    <select
                      className={`${inputClass} h-9`}
                      value={viewDraft.property}
                      onChange={(event) => setViewDraft((current) => ({ ...current, property: event.target.value, values: [] }))}
                      aria-label="Propriedade para filtrar"
                    >
                      <option value="">Sem filtro por propriedade</option>
                      {filterableProperties.map((property) => <option key={property.name} value={property.name}>{property.name}</option>)}
                    </select>
                    {viewDraft.property && (
                      <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Valores de ${viewDraft.property}`}>
                        {filterableProperties.find((property) => property.name === viewDraft.property)?.options.map((option) => {
                          const checked = viewDraft.values.includes(option)
                          return (
                            <button key={option} type="button" className={`rounded-full border px-2.5 py-1 text-[11px] ${checked ? 'border-sky-500/60 bg-sky-500/15 text-sky-200' : 'border-white/10 text-zinc-400 hover:bg-white/5'}`} onClick={() => toggleViewDraftValue(option)}>{option}</button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="rounded border border-dashed border-white/10 px-2 py-2 text-[11px] text-zinc-500">Esta database não tem propriedades do tipo seleção para filtrar (select, multi-select ou status).</p>
                )}
                <div className="flex justify-end gap-2"><button type="button" className="felixo-btn rounded-md px-3 py-1.5 text-xs text-zinc-400 hover:bg-white/5 hover:text-zinc-100" onClick={cancelViewBuilder}>Cancelar</button><button type="submit" className="felixo-btn flex items-center gap-1.5 rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-600 disabled:opacity-50"><Save size={13} /> {editingViewId ? 'Salvar alterações' : 'Criar visualização'}</button></div>
              </form>
            )}

            {showTaskComposer && (
              <form className="mt-3 space-y-3 rounded-lg border border-white/10 bg-zinc-950/50 p-3" onSubmit={(event) => void submitTask(event)}>
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1"><p className="font-medium text-zinc-100">{editingId ? 'Editar tarefa' : 'Nova tarefa'}</p><p className="text-[11px] text-zinc-500">Os campos seguem as propriedades reconhecidas pela database.</p></div>
                  <button type="button" className="felixo-btn-icon rounded p-1.5 text-zinc-400 hover:bg-white/10 hover:text-zinc-100" onClick={cancelTaskComposer} aria-label="Fechar editor" title="Fechar editor"><X size={14} /></button>
                </div>
                <div className="grid gap-2 lg:grid-cols-[minmax(0,2fr)_minmax(10rem,1fr)_minmax(9rem,1fr)_auto]">
                  <input className={`${inputClass} h-9`} value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Título" aria-label="Título da tarefa" required />
                  <select className={`${inputClass} h-9`} value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))} aria-label="Estado da tarefa"><option value="">Estado (automático)</option>{statusOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select>
                  <input className={`${inputClass} h-9`} type="date" value={draft.dueDate} onChange={(event) => setDraft((current) => ({ ...current, dueDate: event.target.value }))} aria-label="Prazo da tarefa" />
                  <label className="flex h-9 items-center gap-2 rounded border border-white/10 px-2 text-xs text-zinc-300"><input type="checkbox" checked={draft.completed} onChange={(event) => setDraft((current) => ({ ...current, completed: event.target.checked }))} /> Concluída</label>
                </div>
                <div className="flex flex-wrap gap-2">
                  <input className={`${inputClass} h-9 min-w-[12rem] flex-1`} value={draft.priority} onChange={(event) => setDraft((current) => ({ ...current, priority: event.target.value }))} placeholder="Prioridade (se houver)" aria-label="Prioridade da tarefa" />
                  <textarea className={`${inputClass} min-h-9 min-w-[18rem] flex-[2] resize-y`} value={draft.text} onChange={(event) => setDraft((current) => ({ ...current, text: event.target.value }))} placeholder="Descrição (se a tabela tiver texto)" aria-label="Descrição da tarefa" />
                </div>
                <div className="flex justify-end gap-2"><button type="button" className="felixo-btn rounded-md px-3 py-1.5 text-xs text-zinc-400 hover:bg-white/5 hover:text-zinc-100" onClick={cancelTaskComposer}>Cancelar</button><button type="submit" className="felixo-btn flex items-center gap-1.5 rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-600 disabled:opacity-50" disabled={busy}><Save size={13} /> {editingId ? 'Salvar alterações' : 'Criar tarefa'}</button></div>
              </form>
            )}

            <div className="mt-3 overflow-hidden rounded-lg border border-white/10 bg-zinc-950/35">
              <div className="overflow-x-auto">
                <table className="min-w-[760px] w-full table-fixed border-collapse text-xs" aria-label="Tarefas do Notion">
                  <thead className="bg-white/[0.03] text-left text-[10px] uppercase tracking-[0.12em] text-zinc-500">
                    <tr className="border-b border-white/10">
                      <th className="w-12 px-3 py-2 font-medium" scope="col"><span className="sr-only">Concluída</span></th>
                      <th className="min-w-[22rem] px-3 py-2 font-medium" scope="col">Tarefa</th>
                      <th className="w-36 px-3 py-2 font-medium" scope="col">Estado</th>
                      <th className="w-32 px-3 py-2 font-medium" scope="col">Prioridade</th>
                      <th className="w-36 px-3 py-2 font-medium" scope="col">Prazo</th>
                      {visibleColumns.map((name) => (
                        <th key={name} className="min-w-[9rem] px-3 py-2 font-medium" scope="col" title={name}>{name}</th>
                      ))}
                      <th className="w-24 px-3 py-2 text-right font-medium" scope="col"><span className="sr-only">Ações</span></th>
                    </tr>
                  </thead>
                  <tbody aria-live="polite">
                    {visibleTasks.length === 0 ? (
                      <tr><td colSpan={6 + visibleColumns.length} className="px-3 py-12 text-center text-xs text-zinc-500">Nenhuma tarefa encontrada.</td></tr>
                    ) : visibleTasks.map((task) => {
                      const hasDetails = true
                      const isExpanded = expandedTaskId === task.id
                      const taskContent = taskContentById[task.id]
                      const detailText = taskContent?.content || task.text
                      const properties = getTaskProperties(task, schema, visibleColumns)
                      return (
                        <Fragment key={task.id}>
                          <tr className={`group border-b border-white/[0.07] align-middle last:border-0 hover:bg-white/[0.035] ${task.completed ? 'text-zinc-500' : 'text-zinc-300'}`}>
                            <td className="px-3 py-2.5">
                              <button type="button" className={`felixo-btn-icon flex h-5 w-5 items-center justify-center rounded-full border ${task.completed ? 'border-emerald-500/50 bg-emerald-700 text-white' : 'border-zinc-600 text-transparent hover:border-zinc-400'} disabled:opacity-50`} onClick={() => void toggleTask(task)} disabled={busyTaskId === task.id} aria-label={task.completed ? `Reabrir ${task.title}` : `Concluir ${task.title}`} title={task.completed ? 'Reabrir' : 'Concluir'}><Check size={12} /></button>
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="flex min-w-0 items-center gap-1">
                                {hasDetails ? <button type="button" className="felixo-btn-icon shrink-0 rounded p-0.5 text-zinc-500 hover:bg-white/10 hover:text-zinc-200" onClick={() => toggleTaskDetails(task)} aria-label={isExpanded ? `Recolher ${task.title}` : `Ver detalhes de ${task.title}`} title={isExpanded ? 'Recolher detalhes' : 'Ver detalhes'}>{isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button> : <span className="w-[19px] shrink-0" />}
                                <span className={`min-w-0 flex-1 break-words font-medium ${task.completed ? 'line-through' : 'text-zinc-100'}`} title={task.title}>{task.title}</span>
                                {task.url && <a className="felixo-btn-icon shrink-0 rounded p-0.5 text-zinc-600 opacity-0 hover:bg-white/10 hover:text-sky-300 group-hover:opacity-100" href={task.url} target="_blank" rel="noreferrer" aria-label={`Abrir ${task.title}`} title="Abrir no Notion"><ExternalLink size={13} /></a>}
                              </div>
                            </td>
                            <td className="px-3 py-2.5"><span className={`inline-flex max-w-full items-center truncate rounded-full border px-2 py-0.5 text-[11px] ${statusBadgeClass(task)}`}>{task.completed ? 'Concluída' : task.status || 'Sem estado'}</span></td>
                            <td className="px-3 py-2.5"><span className="truncate text-[11px] text-zinc-400">{task.priority || '—'}</span></td>
                            <td className="px-3 py-2.5"><span className="flex items-center gap-1 text-[11px] text-zinc-400">{task.dueDate ? <><CalendarDays size={12} className="text-zinc-600" /> {formatShortDate(task.dueDate)}</> : '—'}</span></td>
                            {visibleColumns.map((name) => (
                              <td key={name} className="px-3 py-2.5"><span className="block truncate text-[11px] text-zinc-400" title={formatPropertyValue(task.fields?.[name])}>{formatPropertyValue(task.fields?.[name]) || '—'}</span></td>
                            ))}
                            <td className="px-3 py-2.5"><div className="flex justify-end gap-0.5 opacity-50 transition-opacity group-hover:opacity-100"><button type="button" className="felixo-btn-icon rounded p-1 text-zinc-400 hover:bg-white/10 hover:text-sky-300 disabled:opacity-50" onClick={() => editTask(task)} disabled={busyTaskId === task.id} aria-label={`Editar ${task.title}`} title="Editar"><Pencil size={13} /></button><button type="button" className="felixo-btn-icon rounded p-1 text-zinc-400 hover:bg-white/10 hover:text-red-300 disabled:opacity-50" onClick={() => void archiveTask(task)} disabled={busyTaskId === task.id} aria-label={`Excluir ${task.title}`} title="Enviar para a lixeira"><Trash2 size={13} /></button></div></td>
                          </tr>
                          {isExpanded && <tr className="border-b border-white/[0.07] bg-white/[0.02]"><td colSpan={6 + visibleColumns.length} className="px-12 pb-3 pt-1"><div className="max-w-4xl space-y-3 text-[11px] leading-5 text-zinc-400">{properties.length > 0 && <section className="rounded-md border border-white/[0.08] bg-black/10 p-2.5" aria-label={`Propriedades de ${task.title}`}><p className="mb-2 text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">Propriedades</p><div className="grid gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">{properties.map((property) => <div key={property.name} className="min-w-0"><p className="truncate text-[10px] uppercase tracking-wide text-zinc-600" title={property.name}>{property.name}</p><p className="break-words text-zinc-300" title={property.value}>{property.value}</p></div>)}</div></section>}{taskContent?.status === 'loading' && <p className="text-zinc-500">Carregando conteúdo da página…</p>}{detailText ? <div className="min-w-0 rounded-md border border-white/[0.08] bg-black/10 p-3"><DeferredMarkdownContent content={detailText} /></div> : taskContent?.status !== 'loading' && <p className="text-zinc-500">Sem conteúdo nesta página.</p>}{taskContent?.status === 'error' && <div className="flex flex-wrap items-center gap-2 text-amber-300"><span>{taskContent.message}</span><button type="button" className="text-sky-300 underline hover:text-sky-200" onClick={() => void loadTaskContent(task)}>Tentar novamente</button></div>}{task.url && <div className="flex flex-wrap items-center gap-3"><a className="flex w-fit items-center gap-1 text-sky-300 hover:text-sky-200" href={task.url} target="_blank" rel="noreferrer"><ExternalLink size={12} /> Abrir página no Notion</a><button type="button" className="flex w-fit items-center gap-1 text-zinc-400 hover:text-zinc-200" onClick={() => void copyTaskLink(task)}>{copiedTaskId === task.id ? <><Check size={12} className="text-emerald-400" /> Link copiado</> : <><Copy size={12} /> Copiar link</>}</button></div>}</div></td></tr>}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between border-t border-white/[0.07] px-3 py-2 text-[10px] text-zinc-500"><span>{visibleTasks.length} tarefa(s) exibida(s)</span><span>{syncing ? 'Sincronizando…' : stale ? 'Dados locais' : 'Notion conectado'}</span></div>
            </div>
          </>
        )}
      </div>
  )

  if (embedded) {
    return content
  }

  return (
    <CanvasPanel
      title="Tarefas Notion"
      icon={<ListTodo size={15} />}
      panelId="notion-tasks"
      size="xl"
      variant="workspace"
      onClose={onClose}
      toolsMenuOpen={toolsMenuOpen}
    >
      {content}
    </CanvasPanel>
  )
}

function emptyDraft(): TaskDraft {
  return { title: '', completed: false, status: '', dueDate: '', priority: '', text: '' }
}

function emptyViewDraft(): { name: string; statusFilter: NotionStatusScope; property: string; values: string[] } {
  return { name: '', statusFilter: 'all', property: '', values: [] }
}

function formatDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function formatShortDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString()
}

/**
 * Propriedades a listar no detalhe expandido. `hiddenNames` tira as que já
 * aparecem como coluna na tabela (Colunas), pra não repetir a informação.
 */
function getTaskProperties(
  task: NotionTask,
  schema: Record<string, NotionSchemaProperty>,
  hiddenNames: string[] = [],
) {
  const names = [...new Set([...Object.keys(schema), ...Object.keys(task.fields || {})])]
  return names
    .map((name) => {
      const definition = schema[name]
      const value = task.fields?.[name]
      return {
        name,
        type: definition?.type || 'unknown',
        value: formatPropertyValue(value),
      }
    })
    .filter((property) => property.type !== 'title' && property.value && !hiddenNames.includes(property.name))
}

function formatPropertyValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return ''
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    return value.map((item) => formatPropertyValue(item)).filter(Boolean).join(', ')
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    for (const key of ['name', 'plain_text', 'title', 'content', 'start', 'url', 'id']) {
      const candidate = record[key]
      if (typeof candidate === 'string' && candidate) return candidate
    }
    return Object.values(record).map((item) => formatPropertyValue(item)).filter(Boolean).join(', ')
  }
  return String(value)
}

function statusBadgeClass(task: NotionTask): string {
  if (task.completed) return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
  if (!task.status) return 'border-zinc-500/25 bg-zinc-500/10 text-zinc-400'
  return 'border-violet-500/25 bg-violet-500/10 text-violet-300'
}
