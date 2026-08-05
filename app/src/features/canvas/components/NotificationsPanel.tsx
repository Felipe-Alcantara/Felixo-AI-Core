import { AlertCircle, Bell, Check, CheckCheck, CheckCircle2, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import type { Node } from '@xyflow/react'
import { formatRelativeTime } from './notification-time'
import type { SessionSnapshot } from '../terminal/terminal-session-store'
import type { CanvasNotification } from '../terminal/canvas-notifications'
import type { CanvasNodeData } from '../types'

type NotificationsPanelProps = {
  nodes: Node<CanvasNodeData>[]
  notifications: CanvasNotification[]
  open: boolean
  ready: boolean
  toolsMenuOpen: boolean
  onClose: () => void
  onFocusNode: (nodeId: string) => void
  onExpandNode: (nodeId: string) => void
  /** Opening an agent acknowledges every unread item it accumulated. */
  onDismiss: (nodeId: string) => void
  onMarkRead: (notificationId: string) => void
  onMarkAllRead: () => void
  onRemove: (notificationId: string) => void
  onClearRead: () => void
}

type HistoryFilter = 'unread' | 'all'

export function NotificationsPanel({
  nodes,
  notifications,
  open,
  ready,
  toolsMenuOpen,
  onClose,
  onFocusNode,
  onExpandNode,
  onDismiss,
  onMarkRead,
  onMarkAllRead,
  onRemove,
  onClearRead,
}: NotificationsPanelProps) {
  const [filter, setFilter] = useState<HistoryFilter>('unread')

  // Reopening the panel always starts on what still needs attention. Adjusted
  // during render (React's documented pattern for deriving state from a prop
  // change) rather than in an effect, which would render the stale tab first.
  const [previousOpen, setPreviousOpen] = useState(open)
  if (open !== previousOpen) {
    setPreviousOpen(open)
    if (open) setFilter('unread')
  }

  if (!open || !ready) return null

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
  const visibleItems =
    filter === 'unread'
      ? allItems.filter((item) => item.notification.readAt === null)
      : allItems

  return (
    <section
      aria-label="Notificações dos agentes"
      className={`felixo-anim-sequential-panel absolute top-full z-40 mt-2 w-80 max-w-[calc(100vw-12rem)] overflow-hidden rounded-lg border border-red-500/40 bg-zinc-900 shadow-2xl transition-[left] duration-[420ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${
        toolsMenuOpen ? 'left-[calc(18.5rem+0.5rem)]' : 'left-[calc(9rem+0.5rem)]'
      }`}
    >
      <header className="flex items-center gap-2 border-b border-white/10 px-3 py-2 text-sm font-medium text-zinc-100">
        <Bell size={15} className="text-red-400" />
        Notificações
        <span className="text-xs font-normal text-zinc-500">{unreadCount}</span>
        <button
          type="button"
          onClick={onMarkAllRead}
          disabled={unreadCount === 0}
          className="ml-auto rounded p-1 text-zinc-400 hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-30"
          title="Marcar todas como lidas"
          aria-label="Marcar todas como lidas"
        >
          <CheckCheck size={14} />
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-zinc-400 hover:bg-white/10 hover:text-white"
          aria-label="Fechar notificações"
        >
          <X size={14} />
        </button>
      </header>

      <div className="flex items-center gap-1 border-b border-white/10 px-2 py-1.5">
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
            className="ml-auto flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-zinc-500 hover:bg-white/10 hover:text-zinc-200"
            title="Limpar notificações lidas"
          >
            <Trash2 size={12} />
            Limpar lidas
          </button>
        )}
      </div>

      {visibleItems.length === 0 ? (
        <div className="flex items-center gap-2 px-3 py-5 text-xs text-zinc-500">
          <CheckCircle2 size={15} className="text-emerald-500" />
          {filter === 'unread'
            ? 'Nenhum agente aguardando ação.'
            : 'Nenhuma notificação nos últimos 7 dias.'}
        </div>
      ) : (
        <div className="max-h-[50vh] overflow-auto p-1.5">
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
                    onDismiss(node.id)
                    onClose()
                  }}
                  className="flex min-w-0 flex-1 items-start gap-2 px-2.5 py-2 text-left"
                >
                  {unread ? (
                    <AlertCircle size={15} className="mt-0.5 shrink-0 text-red-400" />
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
                      className="rounded bg-zinc-800 p-1 text-zinc-400 hover:text-white"
                      title="Marcar como lida"
                      aria-label={`Marcar como lida: ${node.data.label || node.id}`}
                    >
                      <Check size={12} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onRemove(notification.id)}
                    className="rounded bg-zinc-800 p-1 text-zinc-400 hover:text-white"
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
    </section>
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
      className={`rounded px-2 py-1 text-[11px] transition-colors ${
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
