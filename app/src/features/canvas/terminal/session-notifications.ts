import type { SessionSnapshot } from './terminal-session-store'

type NotificationNode = { id: string; type?: string }

/** True when a terminal needs the user's attention in the notifications panel. */
export function isActionRequired(snapshot: SessionSnapshot | undefined): boolean {
  return snapshot?.activity === 'exited' || snapshot?.activity === 'waiting_approval'
}

export function getActionRequiredNodeIds(
  nodes: readonly NotificationNode[],
  snapshots: Record<string, SessionSnapshot | undefined>,
): ReadonlySet<string> {
  return new Set(
    nodes
      .filter((node) => node.type === 'terminal' && isActionRequired(snapshots[node.id]))
      .map((node) => node.id),
  )
}

export function findNewNotificationIds(
  previous: ReadonlySet<string>,
  current: ReadonlySet<string>,
): string[] {
  return [...current].filter((id) => !previous.has(id))
}
