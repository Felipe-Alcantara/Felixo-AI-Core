import { describe, expect, it } from 'vitest'
import type { SessionSnapshot } from './terminal-session-store'
import {
  appendCanvasNotifications,
  dismissCanvasNotification,
} from './canvas-notifications'

const idleSnapshot: SessionSnapshot = { activity: 'idle', previewLines: ['Pronto.'] }

describe('canvas notifications', () => {
  it('records new agent notifications with stable, increasing ids', () => {
    const result = appendCanvasNotifications(
      [],
      ['agent-a', 'agent-b'],
      { 'agent-a': idleSnapshot, 'agent-b': idleSnapshot },
      4,
    )

    expect(result.notifications.map((notification) => notification.id)).toEqual([
      'agent-a:4',
      'agent-b:5',
    ])
    expect(result.nextSequence).toBe(6)
  })

  it('skips sessions that no longer have a snapshot and dismisses one item only', () => {
    const result = appendCanvasNotifications([], ['agent-a', 'removed'], { 'agent-a': idleSnapshot }, 0)
    expect(result.notifications).toHaveLength(1)
    expect(dismissCanvasNotification(result.notifications, 'agent-a:0')).toEqual([])
  })
})
