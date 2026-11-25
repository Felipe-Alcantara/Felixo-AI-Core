const STORAGE_KEY = 'felixo:notification-preferences'

import type { NotificationCategory } from '../terminal/notification-category'

/** Aviso pelo sistema operacional (notificação nativa, barra de tarefas, Dock). */
export type SystemNotificationPreferences = {
  enabled: boolean
  categories: Record<NotificationCategory, boolean>
}

export type NotificationPreferences = {
  soundEnabled: boolean
  volume: number
  system: SystemNotificationPreferences
}

// Desligado por padrão: o aviso do sistema aparece fora do app (até na tela
// bloqueada) e a pessoa precisa escolher recebê-lo. "Terminou" é a categoria
// mais frequente e a única que não pede ação, então começa desmarcada.
export const DEFAULT_SYSTEM_NOTIFICATION_PREFERENCES: SystemNotificationPreferences = {
  enabled: false,
  categories: { 'needs-response': true, failed: true, finished: false },
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  soundEnabled: true,
  volume: 1,
  system: DEFAULT_SYSTEM_NOTIFICATION_PREFERENCES,
}

function readSystem(value: unknown): SystemNotificationPreferences {
  const defaults = DEFAULT_SYSTEM_NOTIFICATION_PREFERENCES
  const record = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
  const categories =
    typeof record.categories === 'object' && record.categories !== null
      ? (record.categories as Record<string, unknown>)
      : {}
  const pick = (key: NotificationCategory) =>
    typeof categories[key] === 'boolean' ? categories[key] : defaults.categories[key]
  return {
    enabled: record.enabled === true,
    categories: {
      'needs-response': pick('needs-response'),
      failed: pick('failed'),
      finished: pick('finished'),
    },
  }
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
      system: readSystem(record.system),
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
