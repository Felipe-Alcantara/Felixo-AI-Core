const STORAGE_KEY = 'felixo:notification-preferences'

export type NotificationPreferences = {
  soundEnabled: boolean
  volume: number
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  soundEnabled: true,
  volume: 1,
}

function clampVolume(value: unknown): number {
  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(num)) return DEFAULT_NOTIFICATION_PREFERENCES.volume
  return Math.min(1, Math.max(0, num))
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

function getStorage(): StorageLike | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage
  } catch {
    return undefined
  }
}

export function readNotificationPreferences(
  storage: StorageLike | undefined = getStorage(),
): NotificationPreferences {
  if (!storage) return DEFAULT_NOTIFICATION_PREFERENCES
  try {
    const parsed: unknown = JSON.parse(storage.getItem(STORAGE_KEY) ?? '{}')
    const record = typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {}
    return {
      soundEnabled: 'soundEnabled' in record ? record.soundEnabled !== false : true,
      volume: 'volume' in record ? clampVolume(record.volume) : DEFAULT_NOTIFICATION_PREFERENCES.volume,
    }
  } catch {
    return DEFAULT_NOTIFICATION_PREFERENCES
  }
}

export function saveNotificationPreferences(
  preferences: NotificationPreferences,
  storage: StorageLike | undefined = getStorage(),
): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(preferences))
  } catch {
    // Preferences are best effort; a restricted storage must not break the app.
  }
}
