import { useCallback, useEffect, useRef, useState } from 'react'
import type { AgentUsageAccount, AgentUsageDashboard } from './agent-usage'

type AccountRefreshApi = {
  refreshAccount: (accountId: string) => Promise<AgentUsageDashboard>
}

type AccountRefreshSink = {
  onDashboard: (dashboard: AgentUsageDashboard) => void
  onMessage: (message: string | null) => void
  /** O painel ainda está na tela? Resposta que chega depois de fechar não escreve em estado nenhum. */
  isActive: () => boolean
}

/**
 * Pede ao processo principal a atualização de uma conta e entrega o resultado:
 * o painel novo, ou a mensagem do que deu errado. Separada do hook para poder ser
 * testada sem DOM.
 */
export async function refreshAgentUsageAccount(
  api: AccountRefreshApi | undefined,
  account: Pick<AgentUsageAccount, 'id'>,
  { onDashboard, onMessage, isActive }: AccountRefreshSink,
): Promise<void> {
  if (!api) {
    onMessage('Este painel só funciona no app desktop.')
    return
  }

  onMessage(null)

  try {
    const result = await api.refreshAccount(account.id)
    if (!isActive()) {
      return
    }

    if (!result.ok) {
      onMessage(result.message ?? 'Não foi possível atualizar esta conta.')
      return
    }

    onDashboard(result)
    // Teto de tempo estourado: o painel volta com o que já sabia e o motivo fica escrito.
    onMessage(result.refreshError ?? null)
  } catch {
    if (isActive()) {
      onMessage('Não foi possível falar com o processo principal.')
    }
  }
}

/**
 * "Atualizar" de uma conta só, com o estado "atualizando" de cada conta. A resposta
 * é o painel inteiro (o processo principal devolve o que ficou gravado), então
 * aplicá-la na ordem em que chega é seguro: uma rodada completa que começou depois
 * cancela esta e o processo principal devolve o painel sem gravar nada por cima.
 */
export function useAgentUsageAccountRefresh({
  onDashboard,
  onMessage,
}: Pick<AccountRefreshSink, 'onDashboard' | 'onMessage'>) {
  const [refreshingIds, setRefreshingIds] = useState<ReadonlySet<string>>(() => new Set())
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const refreshAccount = useCallback(
    async (account: AgentUsageAccount) => {
      setRefreshingIds((ids) => new Set(ids).add(account.id))

      try {
        await refreshAgentUsageAccount(window.felixo?.agentUsage, account, {
          onDashboard,
          onMessage,
          isActive: () => mounted.current,
        })
      } finally {
        if (mounted.current) {
          setRefreshingIds((ids) => {
            const next = new Set(ids)
            next.delete(account.id)
            return next
          })
        }
      }
    },
    [onDashboard, onMessage],
  )

  return { refreshingIds, refreshAccount }
}
