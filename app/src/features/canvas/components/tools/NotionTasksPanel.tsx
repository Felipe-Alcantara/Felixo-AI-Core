import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  Check,
  Database,
  KeyRound,
  ListTodo,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  X,
} from 'lucide-react'
import { CanvasPanel } from './CanvasPanel'
import type {
  NotionConnection,
  NotionDatabase,
  NotionSchemaProperty,
  NotionTask,
} from '../../../shared/types/notion'

type NotionTasksPanelProps = {
  onClose: () => void
  toolsMenuOpen?: boolean
}

type TaskDraft = {
  title: string
  completed: boolean
  status: string
  dueDate: string
  priority: string
  text: string
}

const inputClass =
  'w-full rounded border border-white/10 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-sky-500/70'
const buttonClass =
  'felixo-btn flex items-center justify-center gap-1.5 rounded bg-zinc-700 px-2 py-1.5 text-xs text-zinc-100 hover:bg-zinc-600 disabled:cursor-not-allowed disabled:opacity-50'

export function NotionTasksPanel({ onClose, toolsMenuOpen }: NotionTasksPanelProps) {
  const api = window.felixo?.notion
  const [connections, setConnections] = useState<NotionConnection[]>([])
  const [secureStorage, setSecureStorage] = useState<{ ok: boolean; reason: string | null } | null>(null)
  const [connectionId, setConnectionId] = useState('')
  const [connectionLabel, setConnectionLabel] = useState('Minha conexão Notion')
  const [profileId, setProfileId] = useState('default')
  const [token, setToken] = useState('')
  const [showConnectionForm, setShowConnectionForm] = useState(false)
  const [databaseQuery, setDatabaseQuery] = useState('')
  const [databases, setDatabases] = useState<NotionDatabase[]>([])
  const [dataSourceId, setDataSourceId] = useState('')
  const [schema, setSchema] = useState<Record<string, NotionSchemaProperty>>({})
  const [tasks, setTasks] = useState<NotionTask[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'done'>('all')
  const [stale, setStale] = useState(false)
  const [fetchedAt, setFetchedAt] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
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

  const loadTasks = useCallback(async () => {
    if (!api || !connectionId || !dataSourceId) {
      setTasks([])
      return
    }
    setBusy(true)
    setError(null)
    const result = await api.listTasks({
      connectionId,
      dataSourceId,
      search,
      status: statusFilter,
    })
    setBusy(false)
    if (!result.ok) {
      setError(result.message || 'Não foi possível carregar as tarefas do Notion.')
      return
    }
    setTasks(result.tasks || [])
    setSchema(result.schema || {})
    setStale(result.stale === true)
    setFetchedAt(result.fetchedAt || null)
    if (result.stale) {
      setMessage(result.message || 'Exibindo o último snapshot salvo; a rede está indisponível.')
    }
  }, [api, connectionId, dataSourceId, search, statusFilter])

  useEffect(() => {
    if (!connectionId || !dataSourceId) return undefined
    const timer = window.setTimeout(() => void loadTasks(), 0)
    return () => window.clearTimeout(timer)
  }, [connectionId, dataSourceId, loadTasks])

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
    setBusy(true)
    setError(null)
    const result = editingId
      ? await api.updateTask({
          connectionId,
          dataSourceId,
          pageId: editingId,
          changes: draft,
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
    setEditingId(null)
    setDraft(emptyDraft())
    setMessage(editingId ? 'Tarefa atualizada no Notion.' : 'Tarefa criada no Notion.')
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
    })
    setBusyTaskId(null)
    if (!result.ok) {
      setError(result.message || 'Não foi possível alterar o estado da tarefa.')
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
    setMessage('Tarefa enviada para a lixeira do Notion.')
    await loadTasks()
  }

  function editTask(task: NotionTask) {
    setEditingId(task.id)
    setDraft({
      title: task.title,
      completed: task.completed,
      status: task.status,
      dueDate: task.dueDate,
      priority: task.priority,
      text: task.text,
    })
  }

  const selectedConnection = connections.find((connection) => connection.id === connectionId) || null

  return (
    <CanvasPanel
      title="Tarefas Notion"
      icon={<ListTodo size={15} />}
      panelId="notion-tasks"
      size="md"
      onClose={onClose}
      toolsMenuOpen={toolsMenuOpen}
    >
      <div className="space-y-3 text-xs text-zinc-300">
        <section className="space-y-2 rounded border border-white/10 bg-zinc-950/40 p-2.5">
          <div className="flex items-center gap-2">
            <KeyRound size={14} className="text-sky-300" />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-zinc-100">Conexão própria</p>
              <p className="text-[11px] text-zinc-500">O token fica cifrado e nunca chega ao renderer.</p>
            </div>
            <button type="button" className={buttonClass} onClick={() => setShowConnectionForm((value) => !value)}>
              {showConnectionForm ? <X size={13} /> : <Plus size={13} />}
              {showConnectionForm ? 'Fechar' : 'Adicionar'}
            </button>
          </div>

          {secureStorage && !secureStorage.ok && (
            <p className="rounded bg-amber-950/60 px-2 py-1.5 text-[11px] text-amber-200">
              {secureStorage.reason}
            </p>
          )}

          {showConnectionForm && (
            <div className="space-y-2 border-t border-white/10 pt-2">
              <input
                className={inputClass}
                value={connectionLabel}
                onChange={(event) => setConnectionLabel(event.target.value)}
                placeholder="Nome da conexão"
                aria-label="Nome da conexão Notion"
              />
              <input
                className={inputClass}
                value={profileId}
                onChange={(event) => setProfileId(event.target.value)}
                placeholder="Perfil (opcional)"
                aria-label="Perfil da conexão Notion"
              />
              <input
                className={inputClass}
                type="password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder={selectedConnection?.hasToken ? 'Token configurado — deixe vazio para manter' : 'Token interno ou pessoal do Notion'}
                autoComplete="new-password"
                aria-label="Token do Notion"
              />
              <button type="button" className="felixo-btn flex w-full items-center justify-center gap-1.5 rounded bg-sky-700 px-2 py-1.5 text-xs font-medium text-white hover:bg-sky-600 disabled:opacity-50" onClick={() => void saveConnection()} disabled={busy || secureStorage?.ok === false}>
                <Save size={13} /> Guardar conexão
              </button>
            </div>
          )}

          {connections.length > 0 ? (
            <div className="flex items-center gap-1.5">
              <select className={`${inputClass} min-w-0 flex-1`} value={connectionId} onChange={(event) => setConnectionId(event.target.value)} aria-label="Conexão Notion">
                {connections.map((connection) => (
                  <option key={connection.id} value={connection.id}>
                    {connection.label}{connection.hasToken ? '' : ' · sem token'}
                  </option>
                ))}
              </select>
              <button type="button" className="felixo-btn-icon rounded p-1.5 text-zinc-400 hover:bg-white/10 hover:text-emerald-300 disabled:opacity-50" onClick={() => void testConnection()} disabled={busy || !selectedConnection?.hasToken} aria-label="Testar conexão" title="Testar conexão">
                <Check size={14} />
              </button>
              <button type="button" className="felixo-btn-icon rounded p-1.5 text-zinc-400 hover:bg-white/10 hover:text-red-300 disabled:opacity-50" onClick={() => void removeConnection()} disabled={busy} aria-label="Remover conexão" title="Remover conexão">
                <Trash2 size={14} />
              </button>
            </div>
          ) : (
            <p className="text-[11px] text-zinc-500">Adicione uma conexão para começar. Depois compartilhe a database no Notion com ela.</p>
          )}
        </section>

        {connections.length > 0 && (
          <section className="space-y-2 rounded border border-white/10 bg-zinc-950/40 p-2.5">
            <div className="flex items-center gap-2">
              <Database size={14} className="text-violet-300" />
              <p className="font-medium text-zinc-100">Workspace e database</p>
              <button type="button" className="felixo-btn-icon ml-auto rounded p-1.5 text-zinc-400 hover:bg-white/10 hover:text-zinc-100 disabled:opacity-50" onClick={() => void loadDatabases()} disabled={busy || !connectionId} aria-label="Atualizar tabelas" title="Atualizar tabelas">
                <RefreshCw size={14} className={busy ? 'animate-spin' : ''} />
              </button>
            </div>
            <div className="flex gap-1.5">
              <input className={`${inputClass} min-w-0 flex-1`} value={databaseQuery} onChange={(event) => setDatabaseQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void loadDatabases() }} placeholder="Filtrar tabelas compartilhadas" aria-label="Buscar database Notion" />
              <button type="button" className={buttonClass} onClick={() => void loadDatabases()} disabled={busy}><RefreshCw size={13} /> Buscar</button>
            </div>
            <select className={inputClass} value={dataSourceId} onChange={(event) => setDataSourceId(event.target.value)} aria-label="Database Notion">
              <option value="">Selecione uma database</option>
              {databases.map((database) => <option key={database.id} value={database.id}>{database.name}</option>)}
            </select>
            {selectedDatabase && <p className="text-[11px] text-zinc-500">Fonte: {selectedDatabase.name} · {selectedDatabase.id}</p>}
          </section>
        )}

        {connectionId && dataSourceId && (
          <>
            <section className="space-y-2 rounded border border-white/10 bg-zinc-950/40 p-2.5">
              <div className="flex gap-1.5">
                <input className={`${inputClass} min-w-0 flex-1`} value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void loadTasks() }} placeholder="Buscar nas tarefas" aria-label="Buscar tarefas Notion" />
                <select className={`${inputClass} w-28`} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} aria-label="Filtrar estado">
                  <option value="all">Todas</option>
                  <option value="open">Abertas</option>
                  <option value="done">Concluídas</option>
                </select>
                <button type="button" className="felixo-btn-icon rounded p-1.5 text-zinc-400 hover:bg-white/10 hover:text-zinc-100 disabled:opacity-50" onClick={() => void loadTasks()} disabled={busy} aria-label="Sincronizar tarefas" title="Sincronizar tarefas">
                  <RefreshCw size={14} className={busy ? 'animate-spin' : ''} />
                </button>
              </div>
              <div className="flex items-center justify-between text-[10px] text-zinc-500">
                <span>{stale ? 'Snapshot local desatualizado' : fetchedAt ? `Sincronizado ${formatDate(fetchedAt)}` : 'Ainda não sincronizado'}</span>
                <span>{tasks.length} tarefa(s)</span>
              </div>
            </section>

            <form className="space-y-2 rounded border border-white/10 bg-zinc-950/40 p-2.5" onSubmit={(event) => void submitTask(event)}>
              <div className="flex items-center gap-2">
                <p className="font-medium text-zinc-100">{editingId ? 'Editar tarefa' : 'Nova tarefa'}</p>
                {editingId && <button type="button" className="felixo-btn ml-auto text-[11px] text-zinc-400 hover:text-zinc-100" onClick={() => { setEditingId(null); setDraft(emptyDraft()) }}>Cancelar</button>}
              </div>
              <input className={inputClass} value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Título" aria-label="Título da tarefa" required />
              <div className="grid grid-cols-2 gap-1.5">
                <select className={inputClass} value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))} aria-label="Estado da tarefa">
                  <option value="">Estado (automático)</option>
                  {statusOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
                <input className={inputClass} type="date" value={draft.dueDate} onChange={(event) => setDraft((current) => ({ ...current, dueDate: event.target.value }))} aria-label="Prazo da tarefa" />
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <input className={inputClass} value={draft.priority} onChange={(event) => setDraft((current) => ({ ...current, priority: event.target.value }))} placeholder="Prioridade (se houver)" aria-label="Prioridade da tarefa" />
                <label className="flex items-center gap-2 rounded border border-white/10 px-2 text-xs text-zinc-300"><input type="checkbox" checked={draft.completed} onChange={(event) => setDraft((current) => ({ ...current, completed: event.target.checked }))} /> Concluída</label>
              </div>
              <textarea className={`${inputClass} min-h-14 resize-y`} value={draft.text} onChange={(event) => setDraft((current) => ({ ...current, text: event.target.value }))} placeholder="Descrição (se a tabela tiver texto)" aria-label="Descrição da tarefa" />
              <button type="submit" className="felixo-btn flex w-full items-center justify-center gap-1.5 rounded bg-emerald-700 px-2 py-1.5 text-xs font-medium text-white hover:bg-emerald-600 disabled:opacity-50" disabled={busy}><Save size={13} /> {editingId ? 'Salvar alterações' : 'Criar tarefa'}</button>
            </form>

            <ul className="space-y-1" aria-live="polite">
              {tasks.length === 0 ? <li className="rounded border border-dashed border-white/10 px-2 py-4 text-center text-xs text-zinc-500">Nenhuma tarefa encontrada.</li> : tasks.map((task) => (
                <li key={task.id} className={`group rounded border border-white/10 bg-zinc-800/50 p-2 ${task.completed ? 'opacity-70' : ''}`}>
                  <div className="flex items-start gap-2">
                    <button type="button" className={`felixo-btn-icon mt-0.5 rounded p-1 ${task.completed ? 'bg-emerald-700 text-white' : 'bg-zinc-700 text-zinc-400 hover:text-white'} disabled:opacity-50`} onClick={() => void toggleTask(task)} disabled={busyTaskId === task.id} aria-label={task.completed ? `Reabrir ${task.title}` : `Concluir ${task.title}`} title={task.completed ? 'Reabrir' : 'Concluir'}>
                      <Check size={13} />
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className={`break-words text-xs font-medium text-zinc-100 ${task.completed ? 'line-through' : ''}`}>{task.title}</p>
                      <p className="mt-0.5 break-words text-[10px] text-zinc-500">{[task.status, task.priority, task.dueDate].filter(Boolean).join(' · ') || 'Sem estado ou metadados reconhecidos'}</p>
                      {task.text && <p className="mt-1 whitespace-pre-wrap break-words text-[11px] text-zinc-400">{task.text}</p>}
                    </div>
                    <div className="flex shrink-0 gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
                      <button type="button" className="felixo-btn-icon rounded p-1 text-zinc-400 hover:bg-white/10 hover:text-sky-300 disabled:opacity-50" onClick={() => editTask(task)} disabled={busyTaskId === task.id} aria-label={`Editar ${task.title}`} title="Editar"><Pencil size={13} /></button>
                      <button type="button" className="felixo-btn-icon rounded p-1 text-zinc-400 hover:bg-white/10 hover:text-red-300 disabled:opacity-50" onClick={() => void archiveTask(task)} disabled={busyTaskId === task.id} aria-label={`Excluir ${task.title}`} title="Enviar para a lixeira"><Trash2 size={13} /></button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}

        {message && <p className="rounded bg-emerald-950/60 px-2 py-1.5 text-[11px] text-emerald-200" role="status">{message}</p>}
        {error && <p className="rounded bg-red-950/60 px-2 py-1.5 text-[11px] text-red-200" role="alert">{error}</p>}
      </div>
    </CanvasPanel>
  )
}

function emptyDraft(): TaskDraft {
  return { title: '', completed: false, status: '', dueDate: '', priority: '', text: '' }
}

function formatDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}
