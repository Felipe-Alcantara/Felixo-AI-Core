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
export function pruneCanvasNotifications(
  history: readonly CanvasNotification[],
  now: number = Date.now(),
  retentionMs: number = NOTIFICATION_RETENTION_MS,
): CanvasNotification[] {
  return history.filter(
    (notification) =>
      notification.readAt === null || now - notification.createdAt < retentionMs,
  )
}

export function countUnreadCanvasNotifications(
  history: readonly CanvasNotification[],
): number {
  return history.filter((notification) => notification.readAt === null).length
}
