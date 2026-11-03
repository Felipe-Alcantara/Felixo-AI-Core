import { useEffect } from 'react'

type AgentUsageRefreshConsumer = 'canvas-panel' | 'chat-modal'

type PerformanceModeMutationObserver = Pick<MutationObserver, 'observe' | 'disconnect'>

export function observePerformanceModeAttribute(
  element: HTMLElement,
  reportState: () => void,
  Observer: new (callback: MutationCallback) => PerformanceModeMutationObserver = MutationObserver,
): () => void {
  const observer = new Observer(reportState)
  observer.observe(element, {
    attributes: true,
    attributeFilter: ['data-performance-mode'],
  })
  return () => observer.disconnect()
}

/** Registra visibilidade do consumidor no scheduler único do processo principal. */
export function useAgentUsageRefreshScheduler(
  consumerId: AgentUsageRefreshConsumer,
  active: boolean,
) {
  useEffect(() => {
    const reportState = () => {
      window.felixo?.agentUsage?.setSchedulerState(consumerId, {
        visible: active && !document.hidden,
        performanceMode:
          document.documentElement.getAttribute('data-performance-mode') === 'on',
      })
    }

    reportState()
    if (!active) {
      return () => {
        window.felixo?.agentUsage?.setSchedulerState(consumerId, {
          visible: false,
          performanceMode: true,
        })
      }
    }

    document.addEventListener('visibilitychange', reportState)
    const disconnectPerformanceModeObserver = observePerformanceModeAttribute(
      document.documentElement,
      reportState,
    )

    return () => {
      document.removeEventListener('visibilitychange', reportState)
      disconnectPerformanceModeObserver()
      window.felixo?.agentUsage?.setSchedulerState(consumerId, {
        visible: false,
        performanceMode: true,
      })
    }
  }, [active, consumerId])
}
