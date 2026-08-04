import { describe, expect, it } from 'vitest'
import type { SessionSnapshot } from './terminal-session-store'
import {
  appendCanvasNotifications,
  dismissCanvasNotificationsForNode,
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

  it('skips sessions that no longer have a snapshot and clears every item for a consumed agent', () => {
    const result = appendCanvasNotifications([], ['agent-a', 'removed'], { 'agent-a': idleSnapshot }, 0)
    expect(result.notifications).toHaveLength(1)
    expect(
      dismissCanvasNotificationsForNode(
        [...result.notifications, { id: 'agent-a:old', nodeId: 'agent-a', snapshot: idleSnapshot }],
        'agent-a',
      ),
    ).toEqual([])
  })

  it('replaces a previous notification from the same agent instead of duplicating it', () => {
    const first = appendCanvasNotifications([], ['agent-a'], { 'agent-a': idleSnapshot }, 0)
    const updatedSnapshot: SessionSnapshot = { activity: 'waiting_approval', previewLines: ['Posso continuar?'] }
    const second = appendCanvasNotifications(
      first.notifications,
      ['agent-a'],
      { 'agent-a': updatedSnapshot },
      first.nextSequence,
    )

    expect(second.notifications).toEqual([
      { id: 'agent-a:1', nodeId: 'agent-a', snapshot: updatedSnapshot },
    ])
  })
})
