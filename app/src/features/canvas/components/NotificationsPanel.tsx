import {
  AlertCircle,
  ArrowUpCircle,
  Check,
  CheckCheck,
  CheckCircle2,
  Search,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { useState } from 'react'
import type { Node } from '@xyflow/react'
import { formatRelativeTime } from './notification-time'
import type { SessionSnapshot } from '../terminal/terminal-session-store'
import type { CanvasNotification } from '../terminal/canvas-notifications'
import type { CanvasNodeData } from '../types'
import type { UpdatePresentation } from '../../updates/update-presentation'

/** Atualização pendente a mostrar como um item fixo no topo da lista, no
 *  lugar do antigo aviso flutuante no canto da tela. */
export type UpdateNotificationItem = {
  presentation: UpdatePresentation
  onInstall: () => void
  onDismiss: () => void
}

type NotificationsPanelProps = {
  nodes: Node<CanvasNodeData>[]
  notifications: CanvasNotification[]
  updateItem: UpdateNotificationItem | null
  soundEnabled: boolean
  volume: number
  onClose: () => void
  onFocusNode: (nodeId: string) => void
  /** Abre o agente. Abrir já vale como ler: quem trata isso marca as
   * pendências dele como lidas, aqui e em qualquer outro caminho de abertura. */
  onExpandNode: (nodeId: string) => void
  onMarkRead: (notificationId: string) => void
  onMarkAllRead: () => void
  onRemove: (notificationId: string) => void
  onClearRead: () => void
  onSoundEnabledChange: (enabled: boolean) => void
  onVolumeChange: (volume: number) => void
}

type HistoryFilter = 'unread' | 'all'

/**
 * Conteúdo do painel de notificações — hoje aberto a partir do sino no menu
 * lateral do canvas, dentro do `CanvasPanel` (título e fechar já vêm de lá).
 * Reúne dois tipos de aviso: agentes que precisam de atenção e, no topo,
 * atualizações do app disponíveis (substituindo o antigo aviso flutuante).
 */
export function NotificationsPanel({
  nodes,
  notifications,
  updateItem,
  soundEnabled,
  volume,
  onFocusNode,
  onExpandNode,
  onClose,
  onMarkRead,
  onMarkAllRead,
  onRemove,
  onClearRead,
  onSoundEnabledChange,
  onVolumeChange,
}: NotificationsPanelProps) {
  const [filter, setFilter] = useState<HistoryFilter>('unread')
  const [query, setQuery] = useState('')

  const allItems = notifications
    .map((notification) => ({
      notification,
      node: nodes.find((node) => node.id === notification.nodeId),
    }))
    .filter(
      (item): item is { notification: CanvasNotification; node: Node<CanvasNodeData> } =>
        item.node?.type === 'terminal',
    )
    // Newest first, so the history reads like a feed.
    .reverse()

  const unreadCount = allItems.filter((item) => item.notification.readAt === null).length
  const readCount = allItems.length - unreadCount
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const visibleItems = allItems.filter(({ notification, node }) => {
    if (filter === 'unread' && notification.readAt !== null) return false
    if (!normalizedQuery) return true
    const label = String(node.data.label || node.data.command || node.id)
    return `${label} ${lastNotificationMessage(notification.snapshot)}`
      .toLocaleLowerCase()
      .includes(normalizedQuery)
  })

  const showUpdateItem = updateItem !== null && (filter === 'all' || !normalizedQuery)

  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onMarkAllRead}
          disabled={unreadCount === 0}
          className="felixo-btn-icon ml-auto rounded p-1 text-zinc-400 hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-30"
          title="Marcar todas como lidas"
          aria-label="Marcar todas como lidas"
        >
          <CheckCheck size={14} />
        </button>
      </div>

      <div className="flex items-center gap-2 rounded-md border border-white/10 bg-black/20 px-2 py-1.5">
        <button
          type="button"
          onClick={() => onSoundEnabledChange(!soundEnabled)}
          className="felixo-btn-icon shrink-0 rounded p-1 text-zinc-400 hover:bg-white/10 hover:text-white"
          title={soundEnabled ? 'Mutar notificações' : 'Ativar som das notificações'}
          aria-label={soundEnabled ? 'Mutar notificações' : 'Ativar som das notificações'}
          aria-pressed={!soundEnabled}
        >
          {soundEnabled && volume > 0 ? <Volume2 size={14} /> : <VolumeX size={14} />}
        </button>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(volume * 100)}
          onChange={(event) => {
            const next = Number(event.target.value) / 100
            onVolumeChange(next)
            if (next > 0 && !soundEnabled) onSoundEnabledChange(true)
            if (next === 0 && soundEnabled) onSoundEnabledChange(false)
          }}
          disabled={!soundEnabled && volume === 0}
          aria-label="Volume das notificações"
          className="h-1.5 flex-1 accent-sky-400"
        />
        <span className="w-8 shrink-0 text-right text-[11px] text-zinc-500">
          {soundEnabled ? `${Math.round(volume * 100)}%` : 'Mudo'}
        </span>
      </div>

      <label className="flex items-center gap-2 rounded-md border border-white/10 bg-black/20 px-2 py-1.5 text-zinc-500 focus-within:border-white/10 focus-within:text-[var(--f-core-white-soft)]">
        <Search size={13} aria-hidden />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar notificações…"
          aria-label="Buscar notificações"
          className="min-w-0 flex-1 bg-transparent text-xs text-zinc-200 outline-none placeholder:text-zinc-600"
        />
        {query && (
          <button type="button" onClick={() => setQuery('')} aria-label="Limpar busca">
            <X size={12} />
          </button>
        )}
      </label>

      <div className="flex items-center gap-1 border-b border-white/10 pb-1.5">
        <FilterTab
          label={`Não lidas${unreadCount > 0 ? ` (${unreadCount})` : ''}`}
          active={filter === 'unread'}
          onClick={() => setFilter('unread')}
        />
        <FilterTab
          label={`Histórico${allItems.length > 0 ? ` (${allItems.length})` : ''}`}
          active={filter === 'all'}
          onClick={() => setFilter('all')}
        />
        {filter === 'all' && readCount > 0 && (
          <button
            type="button"
            onClick={onClearRead}
            className="felixo-btn ml-auto flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-zinc-500 hover:bg-white/10 hover:text-zinc-200"
            title="Limpar notificações lidas"
          >
            <Trash2 size={12} />
            Limpar lidas
          </button>
        )}
      </div>

      {showUpdateItem && updateItem && (
        <UpdateNotificationRow item={updateItem} />
      )}

      {visibleItems.length === 0 && !showUpdateItem ? (
        <div className="flex items-center gap-2 px-1 py-5 text-xs text-zinc-500">
          <CheckCircle2 size={15} className="text-[var(--f-core-white-soft)]" />
          {filter === 'unread'
            ? 'Nenhum agente aguardando ação.'
            : query
              ? 'Nenhuma notificação encontrada.'
              : 'Nenhuma notificação nos últimos 7 dias.'}
        </div>
      ) : (
        <div className="felixo-anim-stagger-list max-h-[38vh] overflow-auto -mx-1">
          {visibleItems.map(({ notification, node }) => {
            const unread = notification.readAt === null
            return (
              <div
                key={notification.id}
                className={`group relative flex items-start rounded-md hover:bg-white/5 ${
                  unread ? '' : 'opacity-60'
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    onFocusNode(node.id)
                    onExpandNode(node.id)
                    onClose()
                  }}
                  className="felixo-btn flex min-w-0 flex-1 items-start gap-2 px-2.5 py-2 text-left"
                >
                  {unread ? (
                    <AlertCircle size={15} className="mt-0.5 shrink-0 text-[var(--color-error)]" />
                  ) : (
                    <Check size={15} className="mt-0.5 shrink-0 text-zinc-600" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm text-zinc-100">
                        {node.data.label || node.data.command || node.id}
                      </span>
                      <span className="shrink-0 text-[10px] text-zinc-500">
                        {formatRelativeTime(notification.createdAt)}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-zinc-400">
                      {lastNotificationMessage(notification.snapshot)}
                    </span>
                  </span>
                </button>
                <span className="absolute right-1 top-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  {unread && (
                    <button
                      type="button"
                      onClick={() => onMarkRead(notification.id)}
                      className="felixo-btn-icon rounded bg-zinc-800 p-1 text-zinc-400 hover:text-white"
                      title="Marcar como lida"
                      aria-label={`Marcar como lida: ${node.data.label || node.id}`}
                    >
                      <Check size={12} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onRemove(notification.id)}
                    className="felixo-btn-icon rounded bg-zinc-800 p-1 text-zinc-400 hover:text-white"
                    title="Remover notificação"
                    aria-label={`Remover notificação: ${node.data.label || node.id}`}
                  >
                    <X size={12} />
                  </button>
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const UPDATE_TONE_TEXT: Record<UpdatePresentation['tone'], string> = {
  neutral: 'text-slate-300',
  info: 'text-[var(--f-core-white-soft)]',
  success: 'text-[var(--f-core-white-soft)]',
  error: 'text-[var(--color-error)]',
}

/** Item fixo no topo do painel quando há uma atualização em andamento ou
 *  pronta — no lugar do antigo card flutuante no canto da tela. */
function UpdateNotificationRow({ item }: { item: UpdateNotificationItem }) {
  const { presentation, onInstall, onDismiss } = item
  return (
    <div className="rounded-md border border-[color-mix(in_srgb,var(--f-core-active)_38%,transparent)] bg-white/5 px-2.5 py-2">
      <div className="flex items-start gap-2">
        <ArrowUpCircle size={15} className={`mt-0.5 shrink-0 ${UPDATE_TONE_TEXT[presentation.tone]}`} />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-zinc-100">{presentation.toastTitle}</p>
          <p className="mt-0.5 text-xs text-zinc-400">{presentation.toastDescription}</p>
          {presentation.progress !== null && !presentation.canInstall && (
            <div
              className="mt-2 h-1 overflow-hidden rounded-full bg-white/10"
              role="progressbar"
              aria-valuenow={presentation.progress}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full rounded-full bg-[var(--f-core-active)] transition-[width] duration-300"
                style={{ width: `${presentation.progress}%` }}
              />
            </div>
          )}
          {presentation.canInstall && (
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={onInstall}
                className="felixo-btn rounded-md bg-white/90 px-2.5 py-1 text-xs font-medium text-slate-950 hover:bg-[var(--f-core-active)]"
              >
                Reiniciar agora
              </button>
              <button
                type="button"
                onClick={onDismiss}
                className="felixo-btn rounded-md px-2.5 py-1 text-xs text-slate-300 hover:bg-white/10"
              >
                Depois
              </button>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="felixo-btn-icon -mr-1 -mt-1 rounded p-1 text-zinc-500 hover:bg-white/10 hover:text-zinc-300"
          aria-label="Dispensar aviso de atualização"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  )
}

function FilterTab({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`felixo-btn rounded px-2 py-1 text-[11px] transition-colors ${
        active ? 'bg-white/10 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
      }`}
    >
      {label}
    </button>
  )
}

function notificationText(snapshot: SessionSnapshot): string {
  if (snapshot.activity === 'idle') {
    return 'Terminou de trabalhar e está aguardando uma nova ação.'
  }
  if (snapshot.activity === 'exited') {
    return snapshot.exitCode === 0
      ? 'Sessão encerrada. Revise o resultado e decida o próximo passo.'
      : `Sessão encerrada com código ${snapshot.exitCode ?? 'desconhecido'}. Verifique o agente.`
  }
  return 'O agente está aguardando uma aprovação ou resposta.'
}

function lastNotificationMessage(snapshot: SessionSnapshot): string {
  const lastLine = [...snapshot.previewLines]
    .reverse()
    .map((line) => line.trim())
    .find((line) => line && !isTerminalChrome(line) && !isCanvasInstruction(line))
  return lastLine || notificationText(snapshot)
}

function isTerminalChrome(line: string): boolean {
  return /^(?:gpt-|claude|gemini)\S*.*[·•]|^(?:model|tokens?|contexto|esc to interrupt)\b/i.test(line)
}

function isCanvasInstruction(line: string): boolean {
  return /(?:antes de qualquer tarefa|contexto do canvas|scratchpad vivo compartilhado|sua identidade no canvas|ambiente multi-agente)/i.test(
    line,
  )
}
