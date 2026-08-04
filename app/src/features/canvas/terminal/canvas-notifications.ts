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
  const notifiedNodeIds = new Set(nodeIds)
  const additions = nodeIds.flatMap((nodeId, index) => {
    const snapshot = snapshots[nodeId]
    return snapshot
      ? [{ id: `${nodeId}:${sequenceStart + index}`, nodeId, snapshot }]
      : []
  })

  return {
    // Each agent has one actionable item. A later event from the same agent
    // refreshes its message instead of leaving stale duplicates in the panel.
    notifications: [
      ...history.filter((notification) => !notifiedNodeIds.has(notification.nodeId)),
      ...additions,
    ],
    nextSequence: sequenceStart + nodeIds.length,
  }
}

/** Consuming an agent clears every stale item it may have accumulated. */
export function dismissCanvasNotificationsForNode(
  history: readonly CanvasNotification[],
  nodeId: string,
): CanvasNotification[] {
  return history.filter((notification) => notification.nodeId !== nodeId)
}
