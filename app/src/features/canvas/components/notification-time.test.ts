import { describe, expect, it } from 'vitest'
import { formatRelativeTime } from './notification-time'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

describe('formatRelativeTime', () => {
  it('picks the largest unit that fits', () => {
    const now = 10 * DAY
    expect(formatRelativeTime(now, now)).toBe('agora')
    expect(formatRelativeTime(now - 30_000, now)).toBe('agora')
    expect(formatRelativeTime(now - 5 * MINUTE, now)).toBe('5 min')
    expect(formatRelativeTime(now - 59 * MINUTE, now)).toBe('59 min')
    expect(formatRelativeTime(now - 3 * HOUR, now)).toBe('3 h')
    expect(formatRelativeTime(now - 2 * DAY, now)).toBe('2 d')
    expect(formatRelativeTime(now - 7 * DAY, now)).toBe('7 d')
  })

  it('treats a future timestamp as now instead of showing a negative age', () => {
    expect(formatRelativeTime(2_000, 1_000)).toBe('agora')
  })
})
