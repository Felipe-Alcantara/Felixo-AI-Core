import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDebouncedSaveQueue } from './debounced-save-queue'

describe('createDebouncedSaveQueue', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('agrupa as edições e grava só a última depois do atraso', () => {
    const save = vi.fn()
    const queue = createDebouncedSaveQueue<string>(save, 500)
    queue.schedule('a', 'um')
    queue.schedule('a', 'dois')
    vi.advanceTimersByTime(500)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith('a', 'dois')
  })

  it('flush grava o pendente na hora e não grava de novo depois', () => {
    const save = vi.fn()
    const queue = createDebouncedSaveQueue<string>(save, 500)
    queue.schedule('a', 'um')
    queue.schedule('b', 'dois')
    queue.flush()
    expect(save).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(1000)
    expect(save).toHaveBeenCalledTimes(2)
  })

  it('cancel e cancelAll descartam sem gravar', () => {
    const save = vi.fn()
    const queue = createDebouncedSaveQueue<string>(save, 500)
    queue.schedule('a', 'um')
    queue.schedule('b', 'dois')
    queue.cancel('a')
    queue.cancelAll()
    queue.flush()
    vi.advanceTimersByTime(1000)
    expect(save).not.toHaveBeenCalled()
  })
})
