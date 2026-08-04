import { AlertCircle, Bell, CheckCircle2, X } from 'lucide-react'
import type { Node } from '@xyflow/react'
import type { SessionSnapshot } from '../terminal/terminal-session-store'
import type { CanvasNodeData } from '../types'

export type CanvasNotification = {
  id: string
  nodeId: string
  snapshot: SessionSnapshot
}

type NotificationsPanelProps = {
  nodes: Node<CanvasNodeData>[]
  notifications: CanvasNotification[]
  open: boolean
  onClose: () => void
  onFocusNode: (nodeId: string) => void
  onExpandNode: (nodeId: string) => void
}

export function NotificationsPanel({
  nodes,
  notifications,
  open,
  onClose,
  onFocusNode,
  onExpandNode,
}: NotificationsPanelProps) {
  if (!open) return null

  const notificationItems = notifications
    .map((notification) => ({
      notification,
      node: nodes.find((node) => node.id === notification.nodeId),
    }))
    .filter(
      (item): item is { notification: CanvasNotification; node: Node<CanvasNodeData> } =>
        item.node?.type === 'terminal',
    )

  return (
    <section aria-label="Notificações dos agentes" className="absolute left-4 top-16 z-30 w-96 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-white/10 bg-zinc-900 shadow-2xl">
      <header className="flex items-center gap-2 border-b border-white/10 px-3 py-2 text-sm font-medium text-zinc-100">
        <Bell size={15} className="text-amber-400" />
        Notificações
        <span className="text-xs font-normal text-zinc-500">{notificationItems.length}</span>
        <button type="button" onClick={onClose} className="ml-auto rounded p-1 text-zinc-400 hover:bg-white/10 hover:text-white" aria-label="Fechar notificações">
          <X size={14} />
        </button>
      </header>

      {notificationItems.length === 0 ? (
        <div className="flex items-center gap-2 px-3 py-5 text-xs text-zinc-500">
          <CheckCircle2 size={15} className="text-emerald-500" />
          Nenhum agente aguardando ação.
        </div>
      ) : (
        <div className="max-h-[50vh] overflow-auto p-1.5">
          {notificationItems.map(({ notification, node }) => (
            <button
              key={notification.id}
              type="button"
              onClick={() => {
                onFocusNode(node.id)
                onExpandNode(node.id)
                onClose()
              }}
              className="flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left hover:bg-white/5"
            >
              <AlertCircle size={15} className="mt-0.5 shrink-0 text-amber-400" />
              <span className="min-w-0">
                <span className="block truncate text-sm text-zinc-100">{node.data.label || node.data.command || node.id}</span>
                <span className="mt-0.5 block text-xs text-zinc-400">{notificationText(notification.snapshot)}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
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
