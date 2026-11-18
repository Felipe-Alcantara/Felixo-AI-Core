import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useProviderSwitchRequests } from '../../chat/hooks/useProviderSwitchRequests'
import type { ProviderSwitchRespondResult } from '../../chat/types'
import {
  buildApprovalQueue,
  runApprovalAction,
  type ApprovalActionResult,
  type ApprovalItem,
  type ApprovalTransport,
} from '../services/approval-queue'
import type { CanvasAgentQuestion } from '../types'

const transport: ApprovalTransport = {
  respondDecision: (params) =>
    window.felixo?.cli?.respondProviderSwitch?.(params) ??
    Promise.resolve<ProviderSwitchRespondResult>({
      ok: false,
      message: 'A resposta de troca de provedor não está disponível nesta janela.',
    }),
  answerQuestion: async (params) =>
    (await window.felixo?.canvas?.answerQuestion?.(params)) ?? {
      ok: false,
      message: 'A resposta de pergunta não está disponível nesta janela.',
    },
}

/**
 * Fila única do que espera a pessoa: decisões do orquestrador e das CLIs
 * (troca de provedor, teto de custo, permissão) e perguntas de agente. Só
 * consome as mesmas fontes do chat e do diálogo de pergunta; quem decide é o
 * processo principal.
 */
export function useApprovalQueue() {
  const switches = useProviderSwitchRequests()
  const [questions, setQuestions] = useState<CanvasAgentQuestion[]>([])
  const mountedRef = useRef(true)

  const loadQuestions = useCallback(async () => {
    const result = await window.felixo?.canvas?.listQuestions?.()
    if (mountedRef.current && result?.ok) setQuestions(result.requests ?? [])
  }, [])

  useEffect(() => {
    mountedRef.current = true
    void loadQuestions().catch(() => {})
    const unsubscribe = window.felixo?.canvas?.onQuestions?.((data) => setQuestions(data.requests ?? []))
    return () => {
      mountedRef.current = false
      unsubscribe?.()
    }
  }, [loadQuestions])

  const items = useMemo(
    () => buildApprovalQueue({ decisions: switches.requests, questions }),
    [switches.requests, questions],
  )

  const { dismiss } = switches
  const act = useCallback(
    async (item: ApprovalItem, actionId: string) => {
      const result = await runApprovalAction(item, actionId, transport).catch((): ApprovalActionResult => ({
        ok: false,
        message: 'Não foi possível responder.',
      }))
      if (item.source === 'question') void loadQuestions().catch(() => {})
      else if (result.stale) dismiss(item.requestId)
      return result
    },
    [dismiss, loadQuestions],
  )

  return { items, act }
}
