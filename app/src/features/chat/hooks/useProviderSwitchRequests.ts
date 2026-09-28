import { useCallback, useEffect, useRef, useState } from 'react'

import {
  applyProviderSwitchEvent,
  createProviderSwitchResponder,
  describeProviderSwitchError,
  mergeProviderSwitchList,
} from '../services/provider-switch'
import type { ProviderSwitchRequest, ProviderSwitchRespondResult } from '../types'

export type ProviderSwitchCardState = {
  busy: boolean
  error: string | null
  /** O main disse que a decisão não está mais pendente: só resta fechar o card. */
  stale: boolean
}

const IDLE_STATE: ProviderSwitchCardState = { busy: false, error: null, stale: false }

function sendRespond(params: { decisionId: string; accept: boolean }) {
  const respond = window.felixo?.cli?.respondProviderSwitch
  return respond
    ? respond(params)
    : Promise.resolve<ProviderSwitchRespondResult>({
        ok: false,
        message: 'A resposta de troca de provedor não está disponível nesta janela.',
      })
}

/**
 * Perguntas de troca de provedor do orquestrador pendentes. Recupera a lista
 * do main ao montar (reload no meio da espera) e segue o stream `cli:stream`
 * para pedidos e resoluções. Só consome: quem decide é o processo principal.
 */
export function useProviderSwitchRequests() {
  const [requests, setRequests] = useState<ProviderSwitchRequest[]>([])
  const [cardStates, setCardStates] = useState<Record<string, ProviderSwitchCardState>>({})
  const respondRef = useRef(createProviderSwitchResponder(sendRespond))
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    window.felixo?.cli
      ?.listProviderSwitches?.()
      .then((result) => {
        if (mountedRef.current && result?.ok) {
          setRequests((current) => mergeProviderSwitchList(current, result.requests ?? []))
        }
      })
      .catch(() => {})

    const unsubscribe = window.felixo?.cli?.onStream?.((event) => {
      if (event.type === 'provider_switch_request' || event.type === 'provider_switch_resolved') {
        setRequests((current) => applyProviderSwitchEvent(current, event))
      }
    })

    return () => {
      mountedRef.current = false
      unsubscribe?.()
    }
  }, [])

  const updateCard = useCallback((decisionId: string, patch: Partial<ProviderSwitchCardState>) => {
    setCardStates((current) => ({
      ...current,
      [decisionId]: { ...(current[decisionId] ?? IDLE_STATE), ...patch },
    }))
  }, [])

  const respond = useCallback(
    async (decisionId: string, accept: boolean) => {
      updateCard(decisionId, { busy: true, error: null })
      const result = await respondRef.current(decisionId, accept)

      if (!mountedRef.current) {
        return
      }

      if (result.ok) {
        updateCard(decisionId, { busy: false })
        return
      }

      updateCard(decisionId, {
        busy: false,
        error: describeProviderSwitchError(result),
        stale: result.code === 'DECISION_NOT_PENDING' || result.code === 'RUN_FINISHED',
      })
    },
    [updateCard],
  )

  const dismiss = useCallback((decisionId: string) => {
    setRequests((current) => current.filter((request) => request.decisionId !== decisionId))
  }, [])

  const getCardState = useCallback(
    (decisionId: string) => cardStates[decisionId] ?? IDLE_STATE,
    [cardStates],
  )

  return { requests, respond, dismiss, getCardState }
}
