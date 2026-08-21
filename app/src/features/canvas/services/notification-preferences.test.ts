import { describe, expect, it } from 'vitest'
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  readNotificationPreferences,
  saveNotificationPreferences,
} from './notification-preferences'

function storage(initial?: string) {
  let value = initial ?? null
  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => {
      value = next
    },
  }
}

describe('notification preferences', () => {
  it('keeps sound enabled by default and persists the user choice', () => {
    const target = storage()
    expect(readNotificationPreferences(target)).toEqual(DEFAULT_NOTIFICATION_PREFERENCES)

    saveNotificationPreferences({ soundEnabled: false, volume: 1 }, target)
    expect(readNotificationPreferences(target).soundEnabled).toBe(false)
  })

  it('fails safely when stored preferences are invalid', () => {
    expect(readNotificationPreferences(storage('{not-json'))).toEqual(
      DEFAULT_NOTIFICATION_PREFERENCES,
    )
    expect(readNotificationPreferences(storage('{"soundEnabled":"no"}')).soundEnabled).toBe(true)
  })

  it('persists and clamps the volume', () => {
    const target = storage()
    saveNotificationPreferences({ soundEnabled: true, volume: 0.4 }, target)
    expect(readNotificationPreferences(target).volume).toBe(0.4)

    saveNotificationPreferences({ soundEnabled: true, volume: 5 }, target)
    expect(readNotificationPreferences(target).volume).toBe(1)

    saveNotificationPreferences({ soundEnabled: true, volume: -2 }, target)
    expect(readNotificationPreferences(target).volume).toBe(0)
  })
})
