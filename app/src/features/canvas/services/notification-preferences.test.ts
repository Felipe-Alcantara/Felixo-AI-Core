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

    saveNotificationPreferences({ ...DEFAULT_NOTIFICATION_PREFERENCES, soundEnabled: false, volume: 1 }, target)
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
    saveNotificationPreferences({ ...DEFAULT_NOTIFICATION_PREFERENCES, soundEnabled: true, volume: 0.4 }, target)
    expect(readNotificationPreferences(target).volume).toBe(0.4)

    saveNotificationPreferences({ ...DEFAULT_NOTIFICATION_PREFERENCES, soundEnabled: true, volume: 5 }, target)
    expect(readNotificationPreferences(target).volume).toBe(1)

    saveNotificationPreferences({ ...DEFAULT_NOTIFICATION_PREFERENCES, soundEnabled: true, volume: -2 }, target)
    expect(readNotificationPreferences(target).volume).toBe(0)
  })

  it('keeps the system notification off by default and reads the saved choice', () => {
    expect(DEFAULT_NOTIFICATION_PREFERENCES.system).toEqual({
      enabled: false,
      categories: { 'needs-response': true, failed: true, finished: false },
    })

    const target = storage()
    saveNotificationPreferences(
      {
        ...DEFAULT_NOTIFICATION_PREFERENCES,
        system: { enabled: true, categories: { 'needs-response': false, failed: true, finished: true } },
      },
      target,
    )
    expect(readNotificationPreferences(target).system).toEqual({
      enabled: true,
      categories: { 'needs-response': false, failed: true, finished: true },
    })
  })

  it('ignores a malformed system block and keeps the defaults', () => {
    const stored = '{"system":{"enabled":"yes","categories":{"failed":"no","finished":true}}}'
    expect(readNotificationPreferences(storage(stored)).system).toEqual({
      enabled: false,
      categories: { 'needs-response': true, failed: true, finished: true },
    })
  })
})
