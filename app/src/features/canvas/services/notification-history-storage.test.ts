import { describe, expect, it } from 'vitest'
import { NOTIFICATION_RETENTION_MS, type CanvasNotification } from '../terminal/canvas-notifications'
import {
  readNotificationHistory,
  saveNotificationHistory,
} from './notification-history-storage'

function fakeStorage(initial?: string) {
  let value = initial ?? null
  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => {
      value = next
    },
    read: () => value,
  }
}

const notification: CanvasNotification = {
  id: 'agent-a:0',
  nodeId: 'agent-a',
  snapshot: { activity: 'idle', previewLines: ['Pronto.'] },
  createdAt: 1_000,
  readAt: null,
}

describe('notification history storage', () => {
  it('round-trips notifications', () => {
    const storage = fakeStorage()
    saveNotificationHistory([notification], storage)
    expect(readNotificationHistory(storage, 2_000)).toEqual([notification])
  })

  it('drops expired read entries on read', () => {
    const storage = fakeStorage()
    saveNotificationHistory([{ ...notification, readAt: 1_100 }], storage)
    expect(readNotificationHistory(storage, 1_000 + NOTIFICATION_RETENTION_MS + 1)).toEqual([])
  })

  it('ignores malformed payloads and entries', () => {
    expect(readNotificationHistory(fakeStorage('not json'))).toEqual([])
    expect(readNotificationHistory(fakeStorage('{"a":1}'))).toEqual([])
    expect(readNotificationHistory(fakeStorage('[{"id":"x"},null]'))).toEqual([])
  })

  it('survives storage that throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }

    expect(readNotificationHistory(broken)).toEqual([])
    expect(() => saveNotificationHistory([notification], broken)).not.toThrow()
  })

  it('caps how many notifications are stored', () => {
    const storage = fakeStorage()
    const many = Array.from({ length: 250 }, (_, index) => ({
      ...notification,
      id: `agent-a:${index}`,
    }))

    saveNotificationHistory(many, storage)
    const stored = readNotificationHistory(storage, 2_000)
    expect(stored).toHaveLength(200)
    expect(stored[0].id).toBe('agent-a:50')
  })
})
