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

    saveNotificationPreferences({ soundEnabled: false }, target)
    expect(readNotificationPreferences(target).soundEnabled).toBe(false)
  })

  it('fails safely when stored preferences are invalid', () => {
    expect(readNotificationPreferences(storage('{not-json'))).toEqual(
      DEFAULT_NOTIFICATION_PREFERENCES,
    )
    expect(readNotificationPreferences(storage('{"soundEnabled":"no"}')).soundEnabled).toBe(true)
  })
})
