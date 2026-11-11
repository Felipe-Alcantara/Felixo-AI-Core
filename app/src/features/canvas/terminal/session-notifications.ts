import type { SessionSnapshot } from './terminal-session-store'

type NotificationNode = { id: string; type?: string }

/** True when a terminal needs the user's attention in the notifications panel. */
export function isActionRequired(snapshot: SessionSnapshot | undefined): boolean {
  return (
    snapshot?.activity === 'idle' ||
    snapshot?.activity === 'exited' ||
    snapshot?.activity === 'waiting_approval'
  )
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

/** Mesmos ids, em qualquer ordem: o conjunto que pede ação não mudou. */
export function sameIdSet(previous: ReadonlySet<string>, next: ReadonlySet<string>): boolean {
  if (previous.size !== next.size) return false
  for (const id of next) {
    if (!previous.has(id)) return false
  }
  return true
}

export function findNewNotificationIds(
  previous: ReadonlySet<string>,
  current: ReadonlySet<string>,
): string[] {
  return [...current].filter((id) => !previous.has(id))
}
