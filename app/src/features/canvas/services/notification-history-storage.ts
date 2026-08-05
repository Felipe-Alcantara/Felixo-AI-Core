import {
  pruneCanvasNotifications,
  type CanvasNotification,
} from '../terminal/canvas-notifications'
import type { SessionSnapshot } from '../terminal/terminal-session-store'

const STORAGE_KEY = 'felixo:notification-history'

/** Cap so a long-running canvas can't grow the stored history without bound. */
const MAX_STORED_NOTIFICATIONS = 200

type StorageReader = Pick<Storage, 'getItem'>
type StorageWriter = Pick<Storage, 'setItem'>

function getBrowserStorage(): Storage | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }

  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeSnapshot(value: unknown): SessionSnapshot | undefined {
  if (!isRecord(value) || typeof value.activity !== 'string') {
    return undefined
  }

  const previewLines = Array.isArray(value.previewLines)
    ? value.previewLines.filter((line): line is string => typeof line === 'string')
    : []

  return { ...value, previewLines } as SessionSnapshot
}

function normalizeNotification(value: unknown): CanvasNotification | undefined {
  if (!isRecord(value)) return undefined

  const snapshot = normalizeSnapshot(value.snapshot)
  if (
    typeof value.id !== 'string' ||
    typeof value.nodeId !== 'string' ||
    typeof value.createdAt !== 'number' ||
    !snapshot
  ) {
    return undefined
  }

  return {
    id: value.id,
    nodeId: value.nodeId,
    snapshot,
    createdAt: value.createdAt,
    readAt: typeof value.readAt === 'number' ? value.readAt : null,
  }
}

/** Reads the stored history, dropping malformed and expired entries. */
export function readNotificationHistory(
  storage: StorageReader | undefined = getBrowserStorage(),
  now: number = Date.now(),
): CanvasNotification[] {
  let raw: string | null

  try {
    raw = storage?.getItem(STORAGE_KEY) ?? null
  } catch {
    return []
  }

  if (!raw) return []

  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    return pruneCanvasNotifications(
      parsed.flatMap((entry) => {
        const notification = normalizeNotification(entry)
        return notification ? [notification] : []
      }),
      now,
    )
  } catch {
    return []
  }
}

export function saveNotificationHistory(
  notifications: readonly CanvasNotification[],
  storage: StorageWriter | undefined = getBrowserStorage(),
): void {
  try {
    storage?.setItem(
      STORAGE_KEY,
      JSON.stringify(notifications.slice(-MAX_STORED_NOTIFICATIONS)),
    )
  } catch {
    // The canvas must keep working when browser storage is unavailable.
  }
}
