import type { SessionSnapshot } from './terminal-session-store'

/** How long a read notification stays in the history before being pruned. */
export const NOTIFICATION_RETENTION_MS = 7 * 24 * 60 * 60 * 1000

/** A notification kept in the history until it expires (see retention above). */
export type CanvasNotification = {
  id: string
  nodeId: string
  snapshot: SessionSnapshot
  createdAt: number
  /** Epoch ms when the user acknowledged it; `null` while still unread. */
  readAt: number | null
}

export function appendCanvasNotifications(
  history: readonly CanvasNotification[],
  nodeIds: readonly string[],
  snapshots: Record<string, SessionSnapshot | undefined>,
  sequenceStart: number,
  now: number = Date.now(),
): { notifications: CanvasNotification[]; nextSequence: number } {
  const notifiedNodeIds = new Set(nodeIds)
  const additions = nodeIds.flatMap((nodeId, index) => {
    const snapshot = snapshots[nodeId]
    return snapshot
      ? [
          {
            id: `${nodeId}:${sequenceStart + index}`,
            nodeId,
            snapshot,
            createdAt: now,
            readAt: null,
          },
        ]
      : []
  })

  return {
    // Each agent has one actionable item. A later event from the same agent
    // refreshes its message instead of leaving stale duplicates in the panel,
    // but already-read items stay as history the user can still scroll back to.
    notifications: [
      ...history.filter(
        (notification) => notification.readAt !== null || !notifiedNodeIds.has(notification.nodeId),
      ),
      ...additions,
    ],
    nextSequence: sequenceStart + nodeIds.length,
  }
}

/** Consuming an agent marks every unread item it accumulated as read. */
export function markCanvasNotificationsReadForNode(
  history: readonly CanvasNotification[],
  nodeId: string,
  now: number = Date.now(),
): CanvasNotification[] {
  return history.map((notification) =>
    notification.nodeId === nodeId && notification.readAt === null
      ? { ...notification, readAt: now }
      : notification,
  )
}

/** Marks a single item as read without touching the agent's other entries. */
export function markCanvasNotificationRead(
  history: readonly CanvasNotification[],
  notificationId: string,
  now: number = Date.now(),
): CanvasNotification[] {
  return history.map((notification) =>
    notification.id === notificationId && notification.readAt === null
      ? { ...notification, readAt: now }
      : notification,
  )
}

export function markAllCanvasNotificationsRead(
  history: readonly CanvasNotification[],
  now: number = Date.now(),
): CanvasNotification[] {
  return history.map((notification) =>
    notification.readAt === null ? { ...notification, readAt: now } : notification,
  )
}

/** Removes a single item from the history permanently. */
export function removeCanvasNotification(
  history: readonly CanvasNotification[],
  notificationId: string,
): CanvasNotification[] {
  return history.filter((notification) => notification.id !== notificationId)
}

export function clearReadCanvasNotifications(
  history: readonly CanvasNotification[],
): CanvasNotification[] {
  return history.filter((notification) => notification.readAt === null)
}

/**
 * Drops items older than the retention window. Unread items are kept, so an
 * agent waiting since last week still shows up when the user comes back.
 */
/**
 * Remove notificações velhas e as de blocos que já saíram do canvas.
 *
 * A retenção sozinha não basta: uma notificação não lida nunca expira, então o
 * histórico de um terminal fechado ficaria guardado indefinidamente. Passar
 * `existingNodeIds` descarta essas órfãs; omitir mantém só a poda por idade.
 */
export function pruneCanvasNotifications(
  history: readonly CanvasNotification[],
  now: number = Date.now(),
  retentionMs: number = NOTIFICATION_RETENTION_MS,
  existingNodeIds?: readonly string[],
): CanvasNotification[] {
  const existentes = existingNodeIds ? new Set(existingNodeIds) : null

  return history.filter((notification) => {
    if (existentes && !existentes.has(notification.nodeId)) {
      return false
    }

    return notification.readAt === null || now - notification.createdAt < retentionMs
  })
}

/**
 * Notificações não lidas que ainda têm um bloco no canvas.
 *
 * `existingNodeIds` não é opcional por gosto: sem ele o badge somava
 * notificações de terminais já fechados e ficava preso num número que o painel
 * não reconhecia — a lista lá sempre descartou o que não tem bloco, então a
 * tela mostrava "5" ao lado de "nenhum agente aguardando ação". Uma
 * notificação não lida também nunca expira pela retenção de 7 dias, então esse
 * badge não se resolvia sozinho.
 *
 * Omitir a lista conta o histórico inteiro, preservando o comportamento antigo
 * para chamadores que não sabem quais blocos existem.
 */
export function countUnreadCanvasNotifications(
  history: readonly CanvasNotification[],
  existingNodeIds?: readonly string[],
): number {
  if (!existingNodeIds) {
    return history.filter((notification) => notification.readAt === null).length
  }

  const existentes = new Set(existingNodeIds)
  return history.filter(
    (notification) => notification.readAt === null && existentes.has(notification.nodeId),
  ).length
}
