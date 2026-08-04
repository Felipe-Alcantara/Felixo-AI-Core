import type { SessionSnapshot } from './terminal-session-store'

/** An in-memory notification shown until the user opens its terminal. */
export type CanvasNotification = {
  id: string
  nodeId: string
  snapshot: SessionSnapshot
}

export function appendCanvasNotifications(
  history: readonly CanvasNotification[],
  nodeIds: readonly string[],
  snapshots: Record<string, SessionSnapshot | undefined>,
  sequenceStart: number,
): { notifications: CanvasNotification[]; nextSequence: number } {
  const additions = nodeIds.flatMap((nodeId, index) => {
    const snapshot = snapshots[nodeId]
    return snapshot
      ? [{ id: `${nodeId}:${sequenceStart + index}`, nodeId, snapshot }]
      : []
  })

  return {
    notifications: [...history, ...additions],
    nextSequence: sequenceStart + nodeIds.length,
  }
}

export function dismissCanvasNotification(
  history: readonly CanvasNotification[],
  notificationId: string,
): CanvasNotification[] {
  return history.filter((notification) => notification.id !== notificationId)
}
