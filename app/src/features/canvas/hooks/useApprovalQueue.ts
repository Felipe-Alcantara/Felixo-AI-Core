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
import type { CanvasAgentLaunchRequest, CanvasAgentLaunchTask, CanvasAgentQuestion } from '../types'

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
  decideLaunch: async (params) =>
    (await window.felixo?.canvas?.decideAgentLaunch?.(params)) ?? {
      ok: false,
      message: 'O pedido de agentes não está disponível nesta janela.',
    },
}

/**
 * Fila única do que espera a pessoa: decisões do orquestrador e das CLIs
 * (troca de provedor, teto de custo, permissão) e perguntas de agente. Só
 * consome as mesmas fontes do chat e do diálogo de pergunta; quem decide é o
 * processo principal.
 */
export function useApprovalQueue({
  onOpenAgents,
}: {
  /** Abre os terminais de um pedido de agentes aceito (o canvas é quem cria os blocos). */
  onOpenAgents?: (tasks: CanvasAgentLaunchTask[], cwd: string) => Promise<void>
} = {}) {
  const switches = useProviderSwitchRequests()
  const [questions, setQuestions] = useState<CanvasAgentQuestion[]>([])
  const [launches, setLaunches] = useState<CanvasAgentLaunchRequest[]>([])
  const mountedRef = useRef(true)

  const loadQuestions = useCallback(async () => {
    const result = await window.felixo?.canvas?.listQuestions?.()
    if (mountedRef.current && result?.ok) setQuestions(result.requests ?? [])
  }, [])

  const loadLaunches = useCallback(async () => {
    const result = await window.felixo?.canvas?.listAgentLaunches?.()
    if (mountedRef.current && result?.ok) setLaunches(result.requests ?? [])
  }, [])

  useEffect(() => {
    mountedRef.current = true
    void loadQuestions().catch(() => {})
    void loadLaunches().catch(() => {})
    const unsubscribe = window.felixo?.canvas?.onQuestions?.((data) => setQuestions(data.requests ?? []))
    const unsubscribeLaunches = window.felixo?.canvas?.onAgentLaunches?.((data) => setLaunches(data.requests ?? []))
    return () => {
      mountedRef.current = false
      unsubscribe?.()
      unsubscribeLaunches?.()
    }
  }, [loadQuestions, loadLaunches])

  const items = useMemo(
    () => buildApprovalQueue({ decisions: switches.requests, questions, launches }),
    [switches.requests, questions, launches],
  )

  const { dismiss } = switches
  const act = useCallback(
    async (item: ApprovalItem, actionId: string) => {
      const result = await runApprovalAction(item, actionId, transport).catch((): ApprovalActionResult => ({
        ok: false,
        message: 'Não foi possível responder.',
      }))
      if (item.source === 'question') void loadQuestions().catch(() => {})
      else if (item.source === 'launch') void loadLaunches().catch(() => {})
      else if (result.stale) dismiss(item.requestId)
      if (result.opened && onOpenAgents) {
        // O main já resolveu o pedido: se os terminais não nascerem, a pessoa precisa saber.
        try {
          await onOpenAgents(result.opened.tasks, result.opened.cwd)
        } catch {
          return { ok: false, message: 'O pedido foi aceito, mas não foi possível abrir os terminais. Peça ao coordenador para pedir de novo.' }
        }
      }
      return result
    },
    [dismiss, loadQuestions, loadLaunches, onOpenAgents],
  )

  return { items, act }
}
