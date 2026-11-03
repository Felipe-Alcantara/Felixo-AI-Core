import { describe, expect, it, vi } from 'vitest'
import { observePerformanceModeAttribute } from './useAgentUsageRefreshScheduler'

describe('observador do Modo Performance no scheduler de uso', () => {
  it('fica inscrito só na preferência de modo e reporta mudanças até ser limpo', () => {
    const captured: { callback?: MutationCallback } = {}
    let target: HTMLElement | null = null
    let options: MutationObserverInit | undefined
    const disconnect = vi.fn()
    const Observer = class {
      constructor(onMutation: MutationCallback) {
        captured.callback = onMutation
      }

      observe(element: HTMLElement, nextOptions?: MutationObserverInit) {
        target = element
        options = nextOptions
      }

      disconnect() {
        disconnect()
      }
    }
    const reportState = vi.fn()
    const root = {} as HTMLElement

    const stopObserving = observePerformanceModeAttribute(root, reportState, Observer)

    expect(target).toBe(root)
    expect(options).toEqual({
      attributes: true,
      attributeFilter: ['data-performance-mode'],
    })
    captured.callback?.([], {} as MutationObserver)
    expect(reportState).toHaveBeenCalledTimes(1)

    stopObserving()
    expect(disconnect).toHaveBeenCalledExactlyOnceWith()
  })
})
