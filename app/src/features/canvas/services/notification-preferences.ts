const STORAGE_KEY = 'felixo:notification-preferences'

export type NotificationPreferences = {
  soundEnabled: boolean
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  soundEnabled: true,
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
    return {
      soundEnabled:
        typeof parsed === 'object' && parsed !== null && 'soundEnabled' in parsed
          ? (parsed as { soundEnabled?: unknown }).soundEnabled !== false
          : true,
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
