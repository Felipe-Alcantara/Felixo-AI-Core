import { useEffect } from 'react'

type AgentUsageRefreshConsumer = 'canvas-panel' | 'chat-modal'

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
    const observer = new MutationObserver(reportState)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-performance-mode'],
    })

    return () => {
      document.removeEventListener('visibilitychange', reportState)
      observer.disconnect()
      window.felixo?.agentUsage?.setSchedulerState(consumerId, {
        visible: false,
        performanceMode: true,
      })
    }
  }, [active, consumerId])
}
