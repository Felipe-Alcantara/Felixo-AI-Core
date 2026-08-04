import { describe, expect, it } from 'vitest'
import type { SessionSnapshot } from './terminal-session-store'
import { isActionRequired } from './session-notifications'

function snapshot(activity: SessionSnapshot['activity']): SessionSnapshot {
  return { activity, previewLines: [] }
}

describe('isActionRequired', () => {
  it('signals agents waiting for approval or already exited', () => {
    expect(isActionRequired(snapshot('waiting_approval'))).toBe(true)
    expect(isActionRequired(snapshot('exited'))).toBe(true)
  })

  it('does not signal running, idle, or failed start states', () => {
    expect(isActionRequired(snapshot('starting'))).toBe(false)
    expect(isActionRequired(snapshot('working'))).toBe(false)
    expect(isActionRequired(snapshot('idle'))).toBe(false)
    expect(isActionRequired(snapshot('error'))).toBe(false)
    expect(isActionRequired(undefined)).toBe(false)
  })
})
