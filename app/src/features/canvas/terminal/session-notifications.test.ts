import { describe, expect, it } from 'vitest'
import type { SessionSnapshot } from './terminal-session-store'
import {
  findNewNotificationIds,
  getActionRequiredNodeIds,
  isActionRequired,
  sameIdSet,
} from './session-notifications'

function snapshot(activity: SessionSnapshot['activity']): SessionSnapshot {
  return { activity, previewLines: [] }
}

describe('isActionRequired', () => {
  it('signals agents that finished work, wait for approval, or exited', () => {
    expect(isActionRequired(snapshot('idle'))).toBe(true)
    expect(isActionRequired(snapshot('waiting_approval'))).toBe(true)
    expect(isActionRequired(snapshot('exited'))).toBe(true)
  })

  it('does not signal running, idle, or failed start states', () => {
    expect(isActionRequired(snapshot('starting'))).toBe(false)
    expect(isActionRequired(snapshot('working'))).toBe(false)
    expect(isActionRequired(snapshot('error'))).toBe(false)
    expect(isActionRequired(undefined)).toBe(false)
  })
})

describe('notification transitions', () => {
  it('finds only terminal nodes that newly require action', () => {
    const ids = getActionRequiredNodeIds(
      [{ id: 'agent-1', type: 'terminal' }, { id: 'note-1', type: 'note' }],
      { 'agent-1': snapshot('waiting_approval'), 'note-1': snapshot('exited') },
    )
    expect([...ids]).toEqual(['agent-1'])
  })

  it('returns notification ids that were not present before', () => {
    expect(findNewNotificationIds(new Set(['agent-1']), new Set(['agent-1', 'agent-2']))).toEqual([
      'agent-2',
    ])
  })
})

describe('sameIdSet (o CanvasView só re-renderiza quando o conjunto muda)', () => {
  it('é igual com os mesmos ids em qualquer ordem e diferente com um a mais, a menos ou trocado', () => {
    expect(sameIdSet(new Set(['a', 'b']), new Set(['b', 'a']))).toBe(true)
    expect(sameIdSet(new Set(), new Set())).toBe(true)
    expect(sameIdSet(new Set(['a']), new Set(['a', 'b']))).toBe(false)
    expect(sameIdSet(new Set(['a', 'b']), new Set(['a']))).toBe(false)
    expect(sameIdSet(new Set(['a', 'b']), new Set(['a', 'c']))).toBe(false)
  })
})
